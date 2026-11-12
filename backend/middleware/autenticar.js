// ============================================================
//  FreelaFree — Middleware de Autenticação JWT
//  middleware/autenticar.js
// ============================================================

const jwt = require('jsonwebtoken');
const db  = require('../db/connection');

async function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
        }
        return res.status(403).json({ erro: 'Token inválido.' });
    }

    // Usuário desativado pela moderação perde acesso na hora,
    // mesmo com token ainda válido.
    try {
        const [[u]] = await db.query('SELECT ativo FROM usuarios WHERE id = ?', [payload.id]);
        if (!u || !u.ativo) {
            return res.status(403).json({ erro: 'Conta desativada. Entre em contato com o suporte.' });
        }
    } catch (err) {
        console.error('[autenticar] erro ao checar usuário ativo:', err);
        return res.status(500).json({ erro: 'Erro ao validar a sessão.' });
    }

    req.usuario = {
        id:       payload.id,
        perfil:   payload.perfil,
        tipo_doc: payload.tipo_doc
    };
    next();
}

function autenticarOpcional(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (token) {
        try {
            req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        } catch (_) {}
    }
    next();
}

module.exports = { autenticar, autenticarOpcional };
