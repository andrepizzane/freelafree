// ============================================================
//  FreelaFree — Rotas de Notificações
//  routes/notificacoes.js
//  Adicione no server.js:
//    const notificacoesRoutes = require('./routes/notificacoes');
//    app.use('/api/notificacoes', notificacoesRoutes);
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');

// GET /api/notificacoes/nao-lidas — usado pelo polling do frontend
router.get('/nao-lidas', autenticar, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM notificacoes WHERE usuario_id = ? AND lida = 0 ORDER BY criado_em DESC LIMIT 50',
            [req.usuario.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[notificacoes/nao-lidas]', err);
        return res.status(500).json({ erro: 'Erro ao buscar notificações.' });
    }
});

// GET /api/notificacoes — histórico completo (lidas + não lidas)
router.get('/', autenticar, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM notificacoes WHERE usuario_id = ? ORDER BY criado_em DESC LIMIT 50',
            [req.usuario.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[notificacoes/GET]', err);
        return res.status(500).json({ erro: 'Erro ao buscar notificações.' });
    }
});

// PATCH /api/notificacoes/marcar-todas-lidas — precisa vir ANTES de /:id/marcar-lida
router.patch('/marcar-todas-lidas', autenticar, async (req, res) => {
    try {
        await db.query('UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0', [req.usuario.id]);
        return res.json({ mensagem: 'Todas as notificações foram marcadas como lidas.' });
    } catch (err) {
        console.error('[notificacoes/marcar-todas-lidas]', err);
        return res.status(500).json({ erro: 'Erro ao marcar notificações.' });
    }
});

// PATCH /api/notificacoes/:id/marcar-lida
router.patch('/:id/marcar-lida', autenticar, async (req, res) => {
    try {
        const [r] = await db.query(
            'UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.usuario.id]
        );
        if (!r.affectedRows) return res.status(404).json({ erro: 'Notificação não encontrada.' });
        return res.json({ mensagem: 'Notificação marcada como lida.' });
    } catch (err) {
        console.error('[notificacoes/marcar-lida]', err);
        return res.status(500).json({ erro: 'Erro ao marcar notificação.' });
    }
});

module.exports = router;
