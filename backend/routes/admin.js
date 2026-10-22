// ============================================================
//  FreelaFree — Rotas de Admin
//  routes/admin.js
//  Adicione no server.js:
//    const adminRoutes = require('./routes/admin');
//    app.use('/api/admin', adminRoutes);
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');

// Middleware: só deixa passar se for admin
function soAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'admin') {
        return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    }
    next();
}

// GET /api/admin/stats
router.get('/stats', autenticar, soAdmin, async (req, res) => {
    try {
        const [[{ total_usuarios }]] = await db.query('SELECT COUNT(*) AS total_usuarios FROM usuarios WHERE ativo = 1');
        const [[{ total_projetos }]] = await db.query('SELECT COUNT(*) AS total_projetos FROM projetos');
        const [[{ total_matches  }]] = await db.query('SELECT COUNT(*) AS total_matches  FROM matches');
        const [[{ total_propostas}]] = await db.query('SELECT COUNT(*) AS total_propostas FROM propostas');
        const [[{ total_mensagens}]] = await db.query('SELECT COUNT(*) AS total_mensagens FROM mensagens');

        // Projetos por categoria
        const [porCategoria] = await db.query(
            `SELECT categoria, COUNT(*) AS total FROM projetos GROUP BY categoria ORDER BY total DESC`
        );

        // Projetos por status
        const [porStatus] = await db.query(
            `SELECT status, COUNT(*) AS total FROM projetos GROUP BY status`
        );

        // Cadastros por dia (últimos 14 dias)
        const [cadastrosPorDia] = await db.query(
            `SELECT DATE(criado_em) AS dia, COUNT(*) AS total
             FROM usuarios
             WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 14 DAY)
             GROUP BY dia ORDER BY dia ASC`
        );

        // Projetos criados por dia (últimos 14 dias)
        const [projetosPorDia] = await db.query(
            `SELECT DATE(criado_em) AS dia, COUNT(*) AS total
             FROM projetos
             WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 14 DAY)
             GROUP BY dia ORDER BY dia ASC`
        );

        // Usuários por perfil
        const [porPerfil] = await db.query(
            `SELECT perfil, COUNT(*) AS total FROM usuarios WHERE ativo = 1 GROUP BY perfil`
        );

        return res.json({
            totais: { total_usuarios, total_projetos, total_matches, total_propostas, total_mensagens },
            porCategoria,
            porStatus,
            cadastrosPorDia,
            projetosPorDia,
            porPerfil
        });

    } catch (err) {
        console.error('[admin/stats]', err);
        return res.status(500).json({ erro: 'Erro ao buscar estatísticas.' });
    }
});

module.exports = router;
