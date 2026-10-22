// ============================================================
//  FreelaFree — Rotas de Denúncias (moderação)
//  routes/denuncias.js
//  Adicione no server.js:
//    const denunciasRoutes = require('./routes/denuncias');
//    app.use('/api/denuncias', denunciasRoutes);
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');
const { criarNotificacaoParaAdmins } = require('../utils/notificacoes');

// Middleware: só admins gerenciam denúncias
function soAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'admin') {
        return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    }
    next();
}

const TIPOS   = ['projeto', 'usuario', 'mensagem'];
const MOTIVOS = ['spam', 'fraude', 'ofensivo', 'conteudo_inadequado', 'fora_da_plataforma', 'outro'];

// ── POST /api/denuncias — qualquer usuário logado denuncia ───
router.post('/', autenticar, async (req, res) => {
    try {
        const { tipo, alvo_id, motivo, descricao } = req.body;

        if (!TIPOS.includes(tipo)) {
            return res.status(400).json({ erro: 'Tipo de denúncia inválido.' });
        }
        if (!MOTIVOS.includes(motivo)) {
            return res.status(400).json({ erro: 'Motivo inválido.' });
        }
        if (!alvo_id || isNaN(Number(alvo_id))) {
            return res.status(400).json({ erro: 'Alvo da denúncia inválido.' });
        }
        if (!descricao || String(descricao).trim().length < 10) {
            return res.status(400).json({ erro: 'Descreva a denúncia com pelo menos 10 caracteres.' });
        }

        // Confere se o alvo existe de verdade
        const tabelas = { projeto: 'projetos', usuario: 'usuarios', mensagem: 'mensagens' };
        const [[alvo]] = await db.query(
            `SELECT id FROM ${tabelas[tipo]} WHERE id = ?`, [Number(alvo_id)]
        );
        if (!alvo) return res.status(404).json({ erro: 'O item denunciado não existe.' });

        // Ninguém denuncia a si mesmo
        if (tipo === 'usuario' && Number(alvo_id) === req.usuario.id) {
            return res.status(400).json({ erro: 'Você não pode denunciar a si mesmo.' });
        }

        // Evita denúncia duplicada do mesmo usuário para o mesmo alvo
        const [[dup]] = await db.query(
            `SELECT id FROM denuncias
             WHERE denunciante_id = ? AND tipo = ? AND alvo_id = ? AND status = 'pendente'`,
            [req.usuario.id, tipo, Number(alvo_id)]
        );
        if (dup) {
            return res.status(409).json({ erro: 'Você já denunciou este item. Estamos analisando.' });
        }

        const [r] = await db.query(
            `INSERT INTO denuncias (denunciante_id, tipo, alvo_id, motivo, descricao)
             VALUES (?, ?, ?, ?, ?)`,
            [req.usuario.id, tipo, Number(alvo_id), motivo, String(descricao).trim()]
        );

        await criarNotificacaoParaAdmins(
            'denuncia_enviada',
            `Nova denúncia (${motivo}) sobre ${tipo}.`,
            'admin.html'
        );

        return res.status(201).json({ mensagem: 'Denúncia registrada. Nossa equipe vai analisar.', id: r.insertId });
    } catch (err) {
        console.error('[denuncias/POST]', err);
        return res.status(500).json({ erro: 'Erro ao registrar a denúncia.' });
    }
});

// ── GET /api/denuncias — lista para o admin ─────────────────
router.get('/', autenticar, soAdmin, async (req, res) => {
    try {
        const status = req.query.status || 'pendente';
        const filtro = ['pendente', 'resolvida', 'arquivada'].includes(status) ? status : 'pendente';

        const [linhas] = await db.query(
            `SELECT d.*,
                    u.nome      AS denunciante_nome,
                    u.sobrenome AS denunciante_sobrenome,
                    p.titulo    AS projeto_titulo,
                    p.status    AS projeto_status,
                    a.nome      AS alvo_nome,
                    a.sobrenome AS alvo_sobrenome,
                    a.ativo     AS alvo_ativo,
                    m.conteudo  AS mensagem_conteudo,
                    m.remetente_id AS mensagem_autor_id
             FROM denuncias d
             JOIN usuarios u  ON u.id = d.denunciante_id
             LEFT JOIN projetos  p ON d.tipo = 'projeto'  AND p.id = d.alvo_id
             LEFT JOIN usuarios  a ON d.tipo = 'usuario'  AND a.id = d.alvo_id
             LEFT JOIN mensagens m ON d.tipo = 'mensagem' AND m.id = d.alvo_id
             WHERE d.status = ?
             ORDER BY d.criado_em DESC`,
            [filtro]
        );

        // Contadores por status (para as abas)
        const [contagem] = await db.query(
            `SELECT status, COUNT(*) AS total FROM denuncias GROUP BY status`
        );

        return res.json({ denuncias: linhas, contagem });
    } catch (err) {
        console.error('[denuncias/GET]', err);
        return res.status(500).json({ erro: 'Erro ao listar denúncias.' });
    }
});

// ── PATCH /api/denuncias/:id/arquivar — sem providência ─────
router.patch('/:id/arquivar', autenticar, soAdmin, async (req, res) => {
    try {
        const [r] = await db.query(
            `UPDATE denuncias SET status='arquivada', resolvido_em=NOW(), resolvido_por=?
             WHERE id = ? AND status='pendente'`,
            [req.usuario.id, req.params.id]
        );
        if (!r.affectedRows) return res.status(404).json({ erro: 'Denúncia não encontrada ou já tratada.' });
        return res.json({ mensagem: 'Denúncia arquivada.' });
    } catch (err) {
        console.error('[denuncias/arquivar]', err);
        return res.status(500).json({ erro: 'Erro ao arquivar.' });
    }
});

// ── PATCH /api/denuncias/:id/resolver — com providência ─────
//  acao: 'nenhuma' | 'desativar_usuario' | 'cancelar_projeto'
router.patch('/:id/resolver', autenticar, soAdmin, async (req, res) => {
    try {
        const acao = req.body.acao || 'nenhuma';
        if (!['nenhuma', 'desativar_usuario', 'cancelar_projeto'].includes(acao)) {
            return res.status(400).json({ erro: 'Ação inválida.' });
        }

        const [[d]] = await db.query('SELECT * FROM denuncias WHERE id = ?', [req.params.id]);
        if (!d) return res.status(404).json({ erro: 'Denúncia não encontrada.' });
        if (d.status !== 'pendente') return res.status(400).json({ erro: 'Esta denúncia já foi tratada.' });

        // Executa a providência
        if (acao === 'desativar_usuario') {
            // Descobre quem desativar: o próprio alvo, ou o autor da mensagem
            let usuarioId = null;
            if (d.tipo === 'usuario')  usuarioId = d.alvo_id;
            if (d.tipo === 'projeto') {
                const [[p]] = await db.query('SELECT contratante_id FROM projetos WHERE id = ?', [d.alvo_id]);
                usuarioId = p ? p.contratante_id : null;
            }
            if (d.tipo === 'mensagem') {
                const [[m]] = await db.query('SELECT remetente_id FROM mensagens WHERE id = ?', [d.alvo_id]);
                usuarioId = m ? m.remetente_id : null;
            }
            if (!usuarioId) return res.status(400).json({ erro: 'Não foi possível identificar o usuário.' });
            if (usuarioId === req.usuario.id) {
                return res.status(400).json({ erro: 'Você não pode desativar a si mesmo.' });
            }
            await db.query('UPDATE usuarios SET ativo = 0 WHERE id = ?', [usuarioId]);
        }

        if (acao === 'cancelar_projeto') {
            let projetoId = null;
            if (d.tipo === 'projeto') projetoId = d.alvo_id;
            if (!projetoId) return res.status(400).json({ erro: 'Esta denúncia não é sobre um projeto.' });
            await db.query("UPDATE projetos SET status='cancelado' WHERE id = ?", [projetoId]);
        }

        await db.query(
            `UPDATE denuncias SET status='resolvida', acao_tomada=?, resolvido_em=NOW(), resolvido_por=?
             WHERE id = ?`,
            [acao, req.usuario.id, req.params.id]
        );

        return res.json({ mensagem: 'Denúncia resolvida.', acao });
    } catch (err) {
        console.error('[denuncias/resolver]', err);
        return res.status(500).json({ erro: 'Erro ao resolver a denúncia.' });
    }
});

// ── PATCH /api/denuncias/usuario/:id/reativar — desfaz o ban ─
router.patch('/usuario/:id/reativar', autenticar, soAdmin, async (req, res) => {
    try {
        const [r] = await db.query('UPDATE usuarios SET ativo = 1 WHERE id = ?', [req.params.id]);
        if (!r.affectedRows) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        return res.json({ mensagem: 'Usuário reativado.' });
    } catch (err) {
        console.error('[denuncias/reativar]', err);
        return res.status(500).json({ erro: 'Erro ao reativar usuário.' });
    }
});

module.exports = router;
