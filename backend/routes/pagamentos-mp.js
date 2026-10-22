// ============================================================
//  FreelaFree — Rotas de pagamento (Mercado Pago / Pix)
//  routes/pagamentos-mp.js
//
//  Segue o mesmo padrão das outras rotas do projeto:
//    - importa o banco de ../db/connection
//    - exporta o router direto (sem factory)
//
//  No server.js:
//    const pagamentosRoutes = require('./routes/pagamentos-mp');
//    app.use('/api/pagamentos', pagamentosRoutes);
//
//  Requer a tabela pagamentos_mp e:
//    npm install mercadopago
//    .env: MP_ACCESS_TOKEN=TEST-...   PUBLIC_URL=https://SEU-TUNNEL
// ============================================================
const express = require('express');
const router  = express.Router();
const db = require('../db/connection');
const mp = require('../mercadopago');
const { autenticar } = require('../middleware/autenticar');

// URL pública do Dev Tunnel (porta 3000), para o webhook do Mercado Pago.
const PUBLIC_URL = process.env.PUBLIC_URL || '';

// Busca o valor acordado (proposta aceita) e os dados do match.
// Mesma lógica de segurança de matches.js/:id/concluir: o valor NUNCA
// vem do frontend, é sempre recalculado a partir da proposta aceita.
async function buscarMatchParaPagamento(matchId) {
    const [[match]] = await db.query(
        `SELECT m.id, m.projeto_id, m.freelancer_id, m.contratante_id, m.status,
            COALESCE(
              (SELECT pr.valor FROM propostas pr WHERE pr.id = m.proposta_id),
              (SELECT pr.valor FROM propostas pr
                 WHERE pr.projeto_id    = m.projeto_id
                   AND pr.freelancer_id = m.freelancer_id
                   AND pr.status        = 'aceita'
                 ORDER BY pr.id DESC LIMIT 1)
            ) AS valor_acordado
         FROM matches m
         WHERE m.id = ?`,
        [matchId]
    );
    return match;
}

// Quando o Pix é aprovado: encerra o match e libera o projeto.
// É a mesma atualização feita manualmente em matches.js/:id/concluir,
// só que disparada automaticamente pela confirmação de pagamento.
// Idempotente: se o match já estiver concluído, não faz nada de novo
// (evita processar o mesmo pagamento duas vezes via webhook + polling).
async function liberarProjeto(pagamentoRow) {
    const [[match]] = await db.query('SELECT * FROM matches WHERE id = ?', [pagamentoRow.match_id]);
    if (!match || match.status === 'concluido') return;

    await db.query(
        `UPDATE matches
            SET status = 'concluido',
                valor_pago       = ?,
                taxa_plataforma  = ?,
                valor_repassado  = ?,
                metodo_pagamento = 'pix',
                pago_em          = NOW()
          WHERE id = ?`,
        [pagamentoRow.valor_total, pagamentoRow.taxa, pagamentoRow.valor_freelancer, match.id]
    );
    await db.query('UPDATE projetos SET status = "concluido" WHERE id = ?', [match.projeto_id]);

    try {
        await db.query(
            'INSERT INTO mensagens (match_id, remetente_id, conteudo) VALUES (?, ?, ?)',
            [match.id, match.contratante_id, 'Pagamento aprovado via Pix! Projeto concluído.']
        );
    } catch (msgErr) {
        console.error('[pagamentos/liberarProjeto] Falha ao criar mensagem automática:', msgErr);
    }
}

// -- 1) Criar cobranca Pix ----------------------------------
//  POST /api/pagamentos/criar
//  body: { matchId, emailPagador?, descricao? }
//  (valorFreelancer não é mais aceito do body — é sempre lido do banco)
router.post('/criar', autenticar, async (req, res) => {
    try {
        const { matchId, emailPagador, descricao } = req.body;
        if (!matchId) {
            return res.status(400).json({ erro: 'matchId e obrigatorio.' });
        }

        const match = await buscarMatchParaPagamento(matchId);
        if (!match) return res.status(404).json({ erro: 'Match nao encontrado.' });
        if (match.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Apenas o contratante deste match pode pagar.' });
        }
        if (match.status === 'concluido') {
            return res.status(409).json({ erro: 'Este projeto ja foi concluido e pago.' });
        }
        if (!match.valor_acordado || match.valor_acordado <= 0) {
            return res.status(400).json({ erro: 'Nao ha proposta aceita com valor valido para este match.' });
        }

        const { valorFreelancer: v, taxa, total } = mp.calcularValores(match.valor_acordado);

        const [ins] = await db.query(
            `INSERT INTO pagamentos_mp
               (match_id, valor_freelancer, taxa, valor_total, status)
             VALUES (?, ?, ?, ?, 'pendente')`,
            [matchId, v, taxa, total]
        );
        const pagamentoId = ins.insertId;

        const notificationUrl = PUBLIC_URL ? `${PUBLIC_URL}/api/pagamentos/webhook` : undefined;
        const cobranca = await mp.criarCobrancaPix({
            valorTotal: total,
            descricao: descricao || `FreelaFree - projeto (match ${matchId})`,
            emailPagador: emailPagador || req.usuario.email,
            referenciaInterna: pagamentoId,
            notificationUrl,
        });

        await db.query(
            `UPDATE pagamentos_mp SET mp_payment_id = ? WHERE id = ?`,
            [cobranca.mpPaymentId, pagamentoId]
        );

        return res.json({
            pagamentoId,
            mpPaymentId: cobranca.mpPaymentId,
            status: cobranca.status,
            valorFreelancer: v,
            taxa,
            valorTotal: total,
            qrCode: cobranca.qrCode,
            qrCodeBase64: cobranca.qrCodeBase64,
            ticketUrl: cobranca.ticketUrl,
        });
    } catch (err) {
        console.error('[pagamentos/criar]', err.message, JSON.stringify(err.cause, null, 2));
        return res.status(500).json({ erro: 'Falha ao criar cobranca Pix.' });
    }
});

// -- 2) Webhook do Mercado Pago -----------------------------
router.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    try {
        const tipo = req.body?.type || req.query?.type || req.body?.action?.split('.')[0];
        const mpId = req.body?.data?.id || req.query?.['data.id'];
        if (tipo !== 'payment' || !mpId) return;

        const info = await mp.consultarPagamento(mpId);
        const novoStatus = traduzirStatus(info.status);

        await db.query(
            `UPDATE pagamentos_mp
                SET status = ?, atualizado_em = NOW()
              WHERE mp_payment_id = ?`,
            [novoStatus, mpId]
        );

        if (novoStatus === 'aprovado') {
            const [[pagamento]] = await db.query(
                'SELECT * FROM pagamentos_mp WHERE mp_payment_id = ?', [mpId]
            );
            if (pagamento) await liberarProjeto(pagamento);
        }

        console.log(`[pagamentos/webhook] ${mpId} -> ${novoStatus}`);
    } catch (err) {
        console.error('[pagamentos/webhook]', err);
    }
});

// -- 3) Consultar status (polling do frontend) --------------
//  GET /api/pagamentos/status/:mpPaymentId
router.get('/status/:mpPaymentId', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        const [[pagAtual]] = await db.query(
            'SELECT * FROM pagamentos_mp WHERE mp_payment_id = ?', [req.params.mpPaymentId]
        );

        // Já processado antes (via webhook, por exemplo) — evita nova
        // chamada à API do MP e novo processamento de liberarProjeto.
        if (pagAtual && pagAtual.status === 'aprovado') {
            return res.json({ status: 'aprovado', mpStatus: 'approved' });
        }

        const info = await mp.consultarPagamento(req.params.mpPaymentId);
        const status = traduzirStatus(info.status);

        await db.query(
            `UPDATE pagamentos_mp SET status = ?, atualizado_em = NOW() WHERE mp_payment_id = ?`,
            [status, req.params.mpPaymentId]
        );

        if (status === 'aprovado' && pagAtual) {
            await liberarProjeto({ ...pagAtual, status });
        }

        return res.json({ status, mpStatus: info.status });
    } catch (err) {
        console.error('[pagamentos/status]', err);
        return res.status(500).json({ erro: 'Falha ao consultar status.' });
    }
});

// -- Helpers ------------------------------------------------
function traduzirStatus(mpStatus) {
    if (mpStatus === 'approved')  return 'aprovado';
    if (mpStatus === 'rejected')  return 'rejeitado';
    if (mpStatus === 'cancelled') return 'cancelado';
    return 'pendente';
}

module.exports = router;
