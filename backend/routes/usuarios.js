// ============================================================
//  FreelaFree — Rotas de Usuários
//  routes/usuarios.js
// ============================================================

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');  // ← atualizado

function sanitizar(u) {
    const { senha_hash, ...safe } = u;
    return safe;
}

// GET /api/usuarios/me
router.get('/me', autenticar, async (req, res) => {
    try {
        const [[usuario]] = await db.query(
            'SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]
        );
        if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        return res.json(sanitizar(usuario));
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar perfil.' });
    }
});

// PUT /api/usuarios/me
router.put('/me', autenticar, async (req, res) => {
    const { nome, sobrenome, telefone, bio, habilidades, novaSenha, senhaAtual } = req.body;
    const campos = [], vals = [];

    if (nome)                      { campos.push('nome = ?');        vals.push(nome.trim()); }
    if (sobrenome  !== undefined)  { campos.push('sobrenome = ?');   vals.push(sobrenome?.trim() || null); }
    if (telefone   !== undefined)  { campos.push('telefone = ?');    vals.push(telefone?.trim()  || null); }
    if (bio        !== undefined)  { campos.push('bio = ?');         vals.push(bio?.trim().slice(0, 2000) || null); }
    if (habilidades !== undefined) { campos.push('habilidades = ?'); vals.push(habilidades?.trim().slice(0, 300) || null); }

    if (novaSenha) {
        if (!senhaAtual) return res.status(400).json({ erro: 'Informe sua senha atual para alterá-la.' });
        if (novaSenha.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 8 caracteres.' });

        const [[u]] = await db.query('SELECT senha_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
        const ok = await bcrypt.compare(senhaAtual, u.senha_hash);
        if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta.' });

        campos.push('senha_hash = ?');
        vals.push(await bcrypt.hash(novaSenha, 12));
    }

    if (!campos.length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    try {
        vals.push(req.usuario.id);
        await db.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, vals);
        const [[atualizado]] = await db.query('SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]);
        return res.json({ mensagem: 'Perfil atualizado.', usuario: sanitizar(atualizado) });
    } catch (err) {
        console.error('[usuarios/PUT/me]', err);
        return res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
    }
});

// ── Upload de foto de perfil ─────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'perfil');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `user_${req.usuario.id}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
    fileFilter: (req, file, cb) => {
        const ok = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase());
        cb(ok ? null : new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.'), ok);
    }
});

// POST /api/usuarios/foto
router.post('/foto', autenticar, (req, res) => {
    upload.single('foto')(req, res, async (err) => {
        if (err) return res.status(400).json({ erro: err.message || 'Erro ao enviar imagem.' });
        if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

        try {
            // Remove a foto antiga do disco, se existir
            const [[atual]] = await db.query('SELECT foto_url FROM usuarios WHERE id = ?', [req.usuario.id]);
            if (atual?.foto_url) {
                fs.unlink(path.join(__dirname, '..', atual.foto_url.replace(/^\//, '')), () => {});
            }

            const foto_url = `/uploads/perfil/${req.file.filename}`;
            await db.query('UPDATE usuarios SET foto_url = ? WHERE id = ?', [foto_url, req.usuario.id]);
            return res.json({ mensagem: 'Foto atualizada.', foto_url });
        } catch (e) {
            console.error('[usuarios/foto]', e);
            return res.status(500).json({ erro: 'Erro ao salvar foto.' });
        }
    });
});

// DELETE /api/usuarios/foto
router.delete('/foto', autenticar, async (req, res) => {
    try {
        const [[atual]] = await db.query('SELECT foto_url FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (!atual?.foto_url) {
            return res.status(400).json({ erro: 'Você ainda não tem uma foto de perfil.' });
        }

        fs.unlink(path.join(__dirname, '..', atual.foto_url.replace(/^\//, '')), () => {});
        await db.query('UPDATE usuarios SET foto_url = NULL WHERE id = ?', [req.usuario.id]);

        return res.json({ mensagem: 'Foto removida.' });
    } catch (e) {
        console.error('[usuarios/foto/DELETE]', e);
        return res.status(500).json({ erro: 'Erro ao remover foto.' });
    }
});

// GET /api/usuarios/:id  (perfil público)
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const [[usuario]] = await db.query(
            `SELECT u.id, u.nome, u.sobrenome, u.tipo_doc, u.perfil, u.criado_em,
                    u.bio, u.habilidades, u.foto_url,

               -- Reputação
               (SELECT ROUND(AVG(a.nota),2) FROM avaliacoes a WHERE a.avaliado_id = u.id) AS nota_media,
               (SELECT COUNT(*)             FROM avaliacoes a WHERE a.avaliado_id = u.id) AS total_avaliacoes,

               -- Histórico como CONTRATANTE
               (SELECT COUNT(*) FROM projetos p
                 WHERE p.contratante_id = u.id AND p.status <> 'cancelado')       AS projetos_publicados,
               (SELECT COUNT(*) FROM matches m
                 WHERE m.contratante_id = u.id AND m.status = 'concluido')        AS contratacoes_concluidas,
               (SELECT COALESCE(SUM(m.valor_pago),0) FROM matches m
                 WHERE m.contratante_id = u.id AND m.status = 'concluido')        AS total_investido,

               -- Histórico como FREELANCER
               (SELECT COUNT(*) FROM propostas pr WHERE pr.freelancer_id = u.id)  AS propostas_enviadas,
               (SELECT COUNT(*) FROM matches m
                 WHERE m.freelancer_id = u.id AND m.status = 'concluido')         AS trabalhos_concluidos,
               (SELECT COALESCE(SUM(m.valor_repassado),0) FROM matches m
                 WHERE m.freelancer_id = u.id AND m.status = 'concluido')         AS total_recebido

             FROM usuarios u
             WHERE u.id = ? AND u.ativo = 1`,
            [id]
        );
        if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

        // Comentários das avaliações recebidas (estavam salvos e nunca eram exibidos)
        const [avaliacoes] = await db.query(
            `SELECT a.nota, a.comentario, a.criado_em,
                    u.nome AS avaliador_nome, u.tipo_doc AS avaliador_tipo,
                    p.titulo AS projeto_titulo
               FROM avaliacoes a
               JOIN usuarios u ON u.id = a.avaliador_id
               JOIN projetos p ON p.id = a.projeto_id
              WHERE a.avaliado_id = ?
              ORDER BY a.criado_em DESC
              LIMIT 20`,
            [id]
        );

        usuario.nota_media       = usuario.nota_media ? Number(usuario.nota_media) : null;
        usuario.total_avaliacoes = Number(usuario.total_avaliacoes) || 0;
        usuario.avaliacoes       = avaliacoes;

        return res.json(usuario);
    } catch (err) {
        console.error('[usuarios/:id]', err);
        return res.status(500).json({ erro: 'Erro ao buscar usuário.' });
    }
});

module.exports = router;
