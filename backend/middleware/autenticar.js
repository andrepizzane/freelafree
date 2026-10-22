// ============================================================
//  FreelaFree — Middleware de Autenticação JWT
//  middleware/autenticar.js
// ============================================================

const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = {
            id:       payload.id,
            perfil:   payload.perfil,
            tipo_doc: payload.tipo_doc
        };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
        }
        return res.status(403).json({ erro: 'Token inválido.' });
    }
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
