// ============================================================
//  FreelaFree — Rotas de Projetos
//  routes/projetos.js
// ============================================================

const express = require('express');
const router  = express.Router();

const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');  // ← atualizado

// Middleware: só contas CNPJ podem publicar/editar/cancelar projetos
function exigirContratante(req, res, next) {
    if (req.usuario.tipo_doc !== 'cnpj') {
        return res.status(403).json({ erro: 'Apenas contas com CNPJ (contratantes) podem publicar projetos.' });
    }
    next();
}

// ── GET /api/projetos ────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const {
            busca, categoria, orcamento_max,
            prazo, urgencia, ordenar,
            pagina = 1, limite = 12
        } = req.query;

        let where  = ['p.status = "aberto"'];
        let params = [];

        if (busca) {
            where.push('(p.titulo LIKE ? OR p.descricao LIKE ?)');
            params.push(`%${busca}%`, `%${busca}%`);
        }
        if (categoria && categoria !== 'Todos') {
            where.push('p.categoria = ?');
            params.push(categoria);
        }
        if (orcamento_max && orcamento_max !== 'todos') {
            if (orcamento_max === '9999') {
                where.push('p.orcamento > 1500');
            } else {
                where.push('p.orcamento <= ?');
                params.push(Number(orcamento_max));
            }
        }
        if (prazo && prazo !== 'todos') {
            const mapa = { urgente: 'Até 3 dias', semana: '1 semana', mes: '1 mês+' };
            if (mapa[prazo]) { where.push('p.prazo = ?'); params.push(mapa[prazo]); }
        }
        if (urgencia) {
            where.push('p.urgencia = ?');
            params.push(urgencia);
        }

        const ordMap = {
            'recente':      'p.criado_em DESC',
            'valor-maior':  'p.orcamento DESC',
            'valor-menor':  'p.orcamento ASC',
            'urgente':      "FIELD(p.urgencia,'Alta','Normal','Baixa'), p.criado_em DESC"
        };
        const order = ordMap[ordenar] || 'p.criado_em DESC';

        const offset = (Math.max(1, Number(pagina)) - 1) * Number(limite);
        const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM projetos p ${whereStr}`,
            params
        );

        const [projetos] = await db.query(
            `SELECT
               p.id, p.titulo, p.descricao, p.categoria,
               p.orcamento, p.tipo_orcamento, p.prazo, p.urgencia,
               p.status, p.criado_em,
               u.nome AS contratante_nome,
               (SELECT COUNT(*) FROM propostas pr WHERE pr.projeto_id = p.id AND pr.status = 'pendente') AS total_propostas
             FROM projetos p
             JOIN usuarios u ON u.id = p.contratante_id
             ${whereStr}
             ORDER BY ${order}
             LIMIT ? OFFSET ?`,
            [...params, Number(limite), offset]
        );

        return res.json({
            projetos,
            total,
            pagina:        Number(pagina),
            total_paginas: Math.ceil(total / Number(limite))
        });

    } catch (err) {
        console.error('[projetos/GET]', err);
        return res.status(500).json({ erro: 'Erro ao buscar projetos.' });
    }
});

// ── GET /api/projetos/meus (projetos do contratante logado) ──
//  IMPORTANTE: precisa vir ANTES de /:id, senão o Express trata
//  "meus" como um id.
router.get('/meus', autenticar, async (req, res) => {
    try {
        const [projetos] = await db.query(
            `SELECT p.*,
               (SELECT COUNT(*) FROM propostas pr WHERE pr.projeto_id = p.id AND pr.status = 'pendente') AS propostas_pendentes,
               (SELECT COUNT(*) FROM propostas pr WHERE pr.projeto_id = p.id) AS total_propostas
             FROM projetos p
             WHERE p.contratante_id = ?
             ORDER BY p.criado_em DESC`,
            [req.usuario.id]
        );
        return res.json(projetos);
    } catch (err) {
        console.error('[projetos/meus]', err);
        return res.status(500).json({ erro: 'Erro ao buscar seus projetos.' });
    }
});

// ── GET /api/projetos/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const [[projeto]] = await db.query(
            `SELECT
               p.*,
               u.nome AS contratante_nome, u.email AS contratante_email,
               (SELECT COUNT(*) FROM propostas pr WHERE pr.projeto_id = p.id) AS total_propostas
             FROM projetos p
             JOIN usuarios u ON u.id = p.contratante_id
             WHERE p.id = ?`,
            [req.params.id]
        );

        if (!projeto) return res.status(404).json({ erro: 'Projeto não encontrado.' });
        return res.json(projeto);

    } catch (err) {
        console.error('[projetos/GET/:id]', err);
        return res.status(500).json({ erro: 'Erro ao buscar projeto.' });
    }
});

// ── POST /api/projetos ───────────────────────────────────────
router.post('/', autenticar, exigirContratante, async (req, res) => {
    const { titulo, descricao, categoria, orcamento, tipo_orcamento, prazo, urgencia } = req.body;

    if (!titulo || !descricao || !categoria) {
        return res.status(400).json({ erro: 'Título, descrição e categoria são obrigatórios.' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO projetos
             (contratante_id, titulo, descricao, categoria, orcamento, tipo_orcamento, prazo, urgencia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.usuario.id,
                titulo.slice(0, 80),
                descricao.slice(0, 1000),
                categoria,
                orcamento      ? Number(orcamento) : null,
                tipo_orcamento || 'fixo',
                prazo          || '1 semana',
                urgencia       || 'Normal'
            ]
        );

        const [[projeto]] = await db.query('SELECT * FROM projetos WHERE id = ?', [result.insertId]);
        return res.status(201).json({ mensagem: 'Projeto publicado com sucesso!', projeto });

    } catch (err) {
        console.error('[projetos/POST]', err);
        return res.status(500).json({ erro: 'Erro ao publicar projeto.' });
    }
});

// ── PUT /api/projetos/:id ────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
    try {
        const [[projeto]] = await db.query(
            'SELECT contratante_id FROM projetos WHERE id = ?', [req.params.id]
        );
        if (!projeto) return res.status(404).json({ erro: 'Projeto não encontrado.' });
        if (projeto.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Sem permissão para editar este projeto.' });
        }

        const campos = [], vals = [];
        const permitidos = ['titulo','descricao','categoria','orcamento','tipo_orcamento','prazo','urgencia','status'];
        for (const campo of permitidos) {
            if (req.body[campo] !== undefined) {
                campos.push(`${campo} = ?`);
                vals.push(req.body[campo]);
            }
        }
        if (!campos.length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

        vals.push(req.params.id);
        await db.query(`UPDATE projetos SET ${campos.join(', ')} WHERE id = ?`, vals);

        const [[atualizado]] = await db.query('SELECT * FROM projetos WHERE id = ?', [req.params.id]);
        return res.json({ mensagem: 'Projeto atualizado.', projeto: atualizado });

    } catch (err) {
        console.error('[projetos/PUT]', err);
        return res.status(500).json({ erro: 'Erro ao atualizar projeto.' });
    }
});

// ── DELETE /api/projetos/:id ─────────────────────────────────
router.delete('/:id', autenticar, async (req, res) => {
    try {
        const [[projeto]] = await db.query(
            'SELECT contratante_id FROM projetos WHERE id = ?', [req.params.id]
        );
        if (!projeto) return res.status(404).json({ erro: 'Projeto não encontrado.' });
        if (projeto.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Sem permissão.' });
        }

        await db.query('UPDATE projetos SET status = "cancelado" WHERE id = ?', [req.params.id]);
        return res.json({ mensagem: 'Projeto cancelado.' });

    } catch (err) {
        console.error('[projetos/DELETE]', err);
        return res.status(500).json({ erro: 'Erro ao cancelar projeto.' });
    }
});

module.exports = router;
