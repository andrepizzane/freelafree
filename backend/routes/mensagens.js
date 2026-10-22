// ============================================================
//  FreelaFree — Rotas de Mensagens
//  routes/mensagens.js
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');  // ← atualizado

const uploadAnexo = multer({
    storage: multer.diskStorage({
        destination: 'uploads/mensagens/',
        filename: (req, file, cb) => {
            const nome = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
            cb(null, nome);
        }
    }),
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB — precisa bater com MAX_ANEXO_MB do frontend
});

async function verificarParticipante(matchId, usuarioId) {
    const [[match]] = await db.query(
        'SELECT freelancer_id, contratante_id FROM matches WHERE id = ?', [matchId]
    );
    if (!match) return null;
    if (match.freelancer_id !== usuarioId && match.contratante_id !== usuarioId) return null;
    return match;
}

// GET /api/mensagens/:matchId
router.get('/:matchId', autenticar, async (req, res) => {
    try {
        const match = await verificarParticipante(req.params.matchId, req.usuario.id);
        if (!match) return res.status(403).json({ erro: 'Acesso negado.' });

        const [rows] = await db.query(
            `SELECT m.*, u.nome AS remetente_nome
             FROM mensagens m
             JOIN usuarios u ON u.id = m.remetente_id
             WHERE m.match_id = ?
             ORDER BY m.enviado_em ASC`,
            [req.params.matchId]
        );

        await db.query(
            'UPDATE mensagens SET lida = 1 WHERE match_id = ? AND remetente_id <> ? AND lida = 0',
            [req.params.matchId, req.usuario.id]
        );

        return res.json(rows);
    } catch (err) {
        console.error('[mensagens/GET]', err);
        return res.status(500).json({ erro: 'Erro ao buscar mensagens.' });
    }
});

// POST /api/mensagens/:matchId
router.post('/:matchId', autenticar, async (req, res) => {
    const { conteudo } = req.body;
    if (!conteudo || !conteudo.trim()) {
        return res.status(400).json({ erro: 'Conteúdo da mensagem não pode ser vazio.' });
    }

    try {
        const match = await verificarParticipante(req.params.matchId, req.usuario.id);
        if (!match) return res.status(403).json({ erro: 'Acesso negado.' });

        const [result] = await db.query(
            'INSERT INTO mensagens (match_id, remetente_id, conteudo) VALUES (?, ?, ?)',
            [req.params.matchId, req.usuario.id, conteudo.trim()]
        );

        const [[msg]] = await db.query(
            `SELECT m.*, u.nome AS remetente_nome
             FROM mensagens m JOIN usuarios u ON u.id = m.remetente_id
             WHERE m.id = ?`,
            [result.insertId]
        );

        return res.status(201).json(msg);
    } catch (err) {
        console.error('[mensagens/POST]', err);
        return res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
    }
});

// POST /api/mensagens/:matchId/anexo
router.post('/:matchId/anexo', autenticar, uploadAnexo.single('arquivo'), async (req, res) => {
    try {
        const match = await verificarParticipante(req.params.matchId, req.usuario.id);
        if (!match) return res.status(403).json({ erro: 'Acesso negado.' });

        if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });

        const [result] = await db.query(
            `INSERT INTO mensagens
                (match_id, remetente_id, conteudo, tipo, arquivo_nome, arquivo_path, arquivo_tamanho, arquivo_mime)
             VALUES (?, ?, ?, 'arquivo', ?, ?, ?, ?)`,
            [
                req.params.matchId,
                req.usuario.id,
                req.file.originalname, // guarda o nome também em `conteudo`, pra badge/preview de "última mensagem" não ficar vazio
                req.file.originalname,
                req.file.filename,
                req.file.size,
                req.file.mimetype
            ]
        );

        const [[msg]] = await db.query(
            `SELECT m.*, u.nome AS remetente_nome
             FROM mensagens m JOIN usuarios u ON u.id = m.remetente_id
             WHERE m.id = ?`,
            [result.insertId]
        );

        return res.status(201).json(msg);
    } catch (err) {
        console.error('[mensagens/POST anexo]', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ erro: 'Arquivo muito grande (máx. 200MB).' });
        }
        return res.status(500).json({ erro: 'Erro ao enviar o arquivo.' });
    }
});

// PATCH /api/mensagens/:matchId/lidas
router.patch('/:matchId/lidas', autenticar, async (req, res) => {
    try {
        const match = await verificarParticipante(req.params.matchId, req.usuario.id);
        if (!match) return res.status(403).json({ erro: 'Acesso negado.' });

        await db.query(
            'UPDATE mensagens SET lida = 1 WHERE match_id = ? AND remetente_id <> ?',
            [req.params.matchId, req.usuario.id]
        );
        return res.json({ mensagem: 'Mensagens marcadas como lidas.' });
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao marcar mensagens.' });
    }
});

module.exports = router;
