// ============================================================
//  FreelaFree — Rotas de Matches
//  routes/matches.js
// ============================================================

const express = require('express');
const router  = express.Router();
const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');
const { criarNotificacao } = require('../utils/notificacoes');

// ── MODELO DE NEGÓCIO ───────────────────────────────────────
// A taxa de 5% é cobrada do CONTRATANTE (acréscimo sobre o valor da proposta).
// O FREELANCER RECEBE 100% do valor que propôs — este é o diferencial da
// plataforma frente a concorrentes (~20%), que descontam do freelancer.
//
//   Valor acordado na proposta ...... R$ 350,00
//   Freelancer recebe (100%) ........ R$ 350,00
//   Taxa FreelaFree (5%) ............ R$  17,50  (paga pelo contratante)
//   Total desembolsado .............. R$ 367,50
//
const TAXA_PLATAFORMA = 0.05; // 5% sobre o valor da proposta, cobrado do contratante

// O valor cobrado é o da PROPOSTA ACEITA (o contrato), e não o orçamento
// anunciado no projeto — que é apenas um teto de referência.
//
// Fonte primária: matches.proposta_id (vínculo direto criado no aceite).
// Fallback: registros antigos com proposta_id NULL → busca pela proposta
// aceita do mesmo projeto/freelancer.
const SUB_PROPOSTA = `
  COALESCE(
    (SELECT pr.valor FROM propostas pr WHERE pr.id = m.proposta_id),
    (SELECT pr.valor FROM propostas pr
       WHERE pr.projeto_id    = m.projeto_id
         AND pr.freelancer_id = m.freelancer_id
         AND pr.status        = 'aceita'
       ORDER BY pr.id DESC LIMIT 1)
  ) AS valor_acordado,
  COALESCE(
    (SELECT pr.prazo_proposto FROM propostas pr WHERE pr.id = m.proposta_id),
    (SELECT pr.prazo_proposto FROM propostas pr
       WHERE pr.projeto_id    = m.projeto_id
         AND pr.freelancer_id = m.freelancer_id
         AND pr.status        = 'aceita'
       ORDER BY pr.id DESC LIMIT 1)
  ) AS prazo_acordado
`;

// Reputação: média e total de avaliações de cada ponta do match.
const SUB_REPUTACAO = `
  (SELECT ROUND(AVG(a.nota),2) FROM avaliacoes a WHERE a.avaliado_id = m.freelancer_id)  AS freelancer_nota,
  (SELECT COUNT(*)             FROM avaliacoes a WHERE a.avaliado_id = m.freelancer_id)  AS freelancer_avaliacoes,
  (SELECT ROUND(AVG(a.nota),2) FROM avaliacoes a WHERE a.avaliado_id = m.contratante_id) AS contratante_nota,
  (SELECT COUNT(*)             FROM avaliacoes a WHERE a.avaliado_id = m.contratante_id) AS contratante_avaliacoes,
  (SELECT COUNT(*) FROM avaliacoes a WHERE a.match_id = m.id AND a.avaliador_id = ?)     AS ja_avaliei
`;

// GET /api/matches/meus
router.get('/meus', autenticar, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT m.*,
               p.titulo AS projeto_titulo, p.categoria, p.descricao AS projeto_descricao,
               p.orcamento, p.prazo,
               ${SUB_PROPOSTA},
               ${SUB_REPUTACAO},
               uf.nome AS freelancer_nome, uf.email AS freelancer_email, uf.foto_url AS freelancer_foto_url,
               uc.nome AS contratante_nome, uc.email AS contratante_email, uc.foto_url AS contratante_foto_url,
               (SELECT COUNT(*) FROM mensagens ms WHERE ms.match_id = m.id) AS total_mensagens,
               (SELECT COUNT(*) FROM mensagens ms WHERE ms.match_id = m.id AND ms.lida = 0 AND ms.remetente_id <> ?) AS nao_lidas
             FROM matches m
             JOIN projetos p  ON p.id = m.projeto_id
             JOIN usuarios uf ON uf.id = m.freelancer_id
             JOIN usuarios uc ON uc.id = m.contratante_id
             WHERE m.freelancer_id = ? OR m.contratante_id = ?
             ORDER BY m.criado_em DESC`,
            [req.usuario.id, req.usuario.id, req.usuario.id, req.usuario.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[matches/meus]', err);
        return res.status(500).json({ erro: 'Erro ao buscar matches.' });
    }
});

// GET /api/matches/:id
router.get('/:id', autenticar, async (req, res) => {
    try {
        const [[match]] = await db.query(
            `SELECT m.*,
               p.titulo AS projeto_titulo, p.categoria, p.descricao AS projeto_descricao,
               p.orcamento, p.prazo,
               ${SUB_PROPOSTA},
               uf.nome AS freelancer_nome, uf.email AS freelancer_email, uf.foto_url AS freelancer_foto_url,
               uc.nome AS contratante_nome, uc.email AS contratante_email, uc.foto_url AS contratante_foto_url
             FROM matches m
             JOIN projetos p  ON p.id = m.projeto_id
             JOIN usuarios uf ON uf.id = m.freelancer_id
             JOIN usuarios uc ON uc.id = m.contratante_id
             WHERE m.id = ? AND (m.freelancer_id = ? OR m.contratante_id = ?)`,
            [req.params.id, req.usuario.id, req.usuario.id]
        );
        if (!match) return res.status(404).json({ erro: 'Match não encontrado.' });
        return res.json(match);
    } catch (err) {
        console.error('[matches/:id]', err);
        return res.status(500).json({ erro: 'Erro ao buscar match.' });
    }
});

// PATCH /api/matches/:id/concluir
// Encerra o projeto e registra o pagamento simulado.
// A comissão é calculada AQUI (servidor) — nunca no cliente.
router.patch('/:id/concluir', autenticar, async (req, res) => {
    try {
        const [[match]] = await db.query(
            `SELECT m.*, ${SUB_PROPOSTA} FROM matches m WHERE m.id = ?`,
            [req.params.id]
        );
        if (!match) return res.status(404).json({ erro: 'Match não encontrado.' });

        // Só o CONTRATANTE encerra e paga.
        if (match.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Apenas o contratante pode encerrar e pagar.' });
        }
        if (match.status === 'concluido') {
            return res.status(409).json({ erro: 'Este projeto já foi concluído.' });
        }

        // O valor cobrado é o da PROPOSTA ACEITA — não o orçamento do projeto,
        // e não um valor arbitrário vindo do frontend.
        const valorAcordado = Number(match.valor_acordado);
        if (!valorAcordado || valorAcordado <= 0) {
            return res.status(400).json({
                erro: 'Não há proposta aceita com valor válido para este match.'
            });
        }

        const metodo = ['pix', 'transferencia', 'boleto', 'cartao']
            .includes(req.body?.metodo_pagamento) ? req.body.metodo_pagamento : 'pix';

        // Taxa é ACRÉSCIMO cobrado do contratante — não desconto do freelancer.
        const taxa      = Number((valorAcordado * TAXA_PLATAFORMA).toFixed(2));
        const repassado = valorAcordado;                        // freelancer recebe 100%
        const totalPago = Number((valorAcordado + taxa).toFixed(2)); // contratante desembolsa

        await db.query(
            `UPDATE matches
                SET status = 'concluido',
                    valor_pago       = ?,
                    taxa_plataforma  = ?,
                    valor_repassado  = ?,
                    metodo_pagamento = ?,
                    pago_em          = NOW()
              WHERE id = ?`,
            [totalPago, taxa, repassado, metodo, req.params.id]
        );
        await db.query('UPDATE projetos SET status = "concluido" WHERE id = ?', [match.projeto_id]);

        const valorFmt = 'R$ ' + repassado.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        await criarNotificacao(
            match.freelancer_id,
            'pagamento_liberado',
            `Pagamento de ${valorFmt} liberado — projeto concluído!`,
            'mensagens.html?match=' + match.id
        );

        return res.json({
            mensagem: 'Projeto concluído e pagamento registrado!',
            valor_acordado:  valorAcordado, // valor da proposta
            valor_repassado: repassado,     // freelancer recebe integral
            taxa_plataforma: taxa,          // paga pelo contratante
            valor_pago:      totalPago,     // total desembolsado
            metodo_pagamento: metodo
        });
    } catch (err) {
        console.error('[matches/concluir]', err);
        return res.status(500).json({ erro: 'Erro ao concluir projeto.' });
    }
});

module.exports = router;
