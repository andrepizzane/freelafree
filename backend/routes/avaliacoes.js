// ============================================================
//  FreelaFree — Rotas de Avaliações (reputação)
//  routes/avaliacoes.js
// ============================================================

const express = require('express');
const router  = express.Router();
const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');

// POST /api/avaliacoes
// Body: { match_id, nota (1-5), comentario? }
// Só participantes de um match CONCLUÍDO podem avaliar, uma vez cada.
router.post('/', autenticar, async (req, res) => {
    try {
        const { match_id, nota, comentario } = req.body || {};
        const n = Number(nota);

        if (!match_id)              return res.status(400).json({ erro: 'match_id é obrigatório.' });
        if (!Number.isInteger(n) || n < 1 || n > 5) {
            return res.status(400).json({ erro: 'A nota deve ser um número inteiro de 1 a 5.' });
        }

        const [[match]] = await db.query('SELECT * FROM matches WHERE id = ?', [match_id]);
        if (!match) return res.status(404).json({ erro: 'Match não encontrado.' });

        const eu = req.usuario.id;
        if (match.freelancer_id !== eu && match.contratante_id !== eu) {
            return res.status(403).json({ erro: 'Você não participa desta negociação.' });
        }
        if (match.status !== 'concluido') {
            return res.status(400).json({ erro: 'Só é possível avaliar após a conclusão do projeto.' });
        }

        // Avalia-se a outra ponta do match.
        const avaliado_id = (match.freelancer_id === eu) ? match.contratante_id : match.freelancer_id;

        try {
            const [r] = await db.query(
                `INSERT INTO avaliacoes (match_id, projeto_id, avaliador_id, avaliado_id, nota, comentario)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [match_id, match.projeto_id, eu, avaliado_id, n, (comentario || '').trim() || null]
            );
            return res.status(201).json({ mensagem: 'Avaliação registrada!', id: r.insertId, nota: n });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Você já avaliou esta negociação.' });
            }
            throw e;
        }
    } catch (err) {
        console.error('[avaliacoes/criar]', err);
        return res.status(500).json({ erro: 'Erro ao registrar avaliação.' });
    }
});

// GET /api/avaliacoes/usuario/:id  → reputação pública de um usuário
router.get('/usuario/:id', async (req, res) => {
    try {
        const [[resumo]] = await db.query(
            `SELECT ROUND(AVG(nota), 2) AS media, COUNT(*) AS total
               FROM avaliacoes WHERE avaliado_id = ?`,
            [req.params.id]
        );
        const [lista] = await db.query(
            `SELECT a.nota, a.comentario, a.criado_em,
                    u.nome AS avaliador_nome, p.titulo AS projeto_titulo
               FROM avaliacoes a
               JOIN usuarios u ON u.id = a.avaliador_id
               JOIN projetos p ON p.id = a.projeto_id
              WHERE a.avaliado_id = ?
              ORDER BY a.criado_em DESC
              LIMIT 20`,
            [req.params.id]
        );
        return res.json({
            media: resumo.media ? Number(resumo.media) : null,
            total: Number(resumo.total) || 0,
            avaliacoes: lista
        });
    } catch (err) {
        console.error('[avaliacoes/usuario]', err);
        return res.status(500).json({ erro: 'Erro ao buscar avaliações.' });
    }
});

// GET /api/avaliacoes/match/:id  → avaliações de um match específico
router.get('/match/:id', autenticar, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT a.*, u.nome AS avaliador_nome
               FROM avaliacoes a
               JOIN usuarios u ON u.id = a.avaliador_id
              WHERE a.match_id = ?`,
            [req.params.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[avaliacoes/match]', err);
        return res.status(500).json({ erro: 'Erro ao buscar avaliações do match.' });
    }
});

module.exports = router;
