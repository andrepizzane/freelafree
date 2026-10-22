// ============================================================
//  FreelaFree — Rotas de Autenticação
//  routes/auth.js
// ============================================================

const express    = require('express');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const router     = express.Router();

const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');  // ← atualizado
const { consultarCNPJ } = require('./utils/brasilapi');      // ← validação real de CNPJ (BrasilAPI)

// ── Transporter de e-mail (usa as variáveis SMTP_ do .env) ───
const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,          // smtp.gmail.com
    port: Number(process.env.SMTP_PORT),  // 587
    secure: false,                        // 587 = STARTTLS
    auth: {
        user: process.env.SMTP_USER,      // freelafree3@gmail.com
        pass: process.env.SMTP_PASS       // senha de app
    }
});

// ── Helpers ──────────────────────────────────────────────────

function gerarToken(usuario) {
    return jwt.sign(
        { id: usuario.id, perfil: usuario.perfil, tipo_doc: usuario.tipo_doc },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

function sanitizarUsuario(u) {
    const { senha_hash, ...safe } = u;
    return safe;
}

// ── Validação REAL de CPF/CNPJ (dígitos verificadores) ───────
//  O frontend também valida, mas pode ser burlado enviando a
//  requisição direto à API. O backend é a fonte confiável.
function cpfValido(c) {
    if (!/^\d{11}$/.test(c)) return false;
    if (/^(\d)\1{10}$/.test(c)) return false;          // rejeita 111.111.111-11 etc.
    let s = 0;
    for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i);
    let r = (s * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== Number(c[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i);
    r = (s * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    return r === Number(c[10]);
}

function cnpjValido(c) {
    if (!/^\d{14}$/.test(c)) return false;
    if (/^(\d)\1{13}$/.test(c)) return false;
    const calc = (n, len) => {
        let s = 0, pos = len - 7;
        for (let i = len; i >= 1; i--) {
            s += Number(n[len - i]) * pos--;
            if (pos < 2) pos = 9;
        }
        return s % 11 < 2 ? 0 : 11 - (s % 11);
    };
    return calc(c, 12) === Number(c[12]) && calc(c, 13) === Number(c[13]);
}

function emailValido(e) {
    return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

// ── POST /api/auth/validar-cnpj ──────────────────────────────
//  Usada pelo formulário de cadastro para consultar o CNPJ na
//  Receita Federal (via BrasilAPI) e preencher Razão Social /
//  Nome Fantasia automaticamente ANTES do envio do cadastro.
//  Isto é só para UX — a validação que realmente autoriza a
//  criação da conta acontece de novo, no backend, em /cadastro.
router.post('/validar-cnpj', async (req, res) => {
    const { cnpj } = req.body;
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');

    if (cnpjLimpo.length !== 14) {
        return res.status(400).json({ erro: 'CNPJ deve conter 14 números.' });
    }
    if (!cnpjValido(cnpjLimpo)) {
        return res.status(400).json({ erro: 'CNPJ inválido.' });
    }

    const resultado = await consultarCNPJ(cnpjLimpo);

    if (!resultado.ok) {
        if (resultado.motivo === 'nao_encontrado') {
            return res.status(404).json({ erro: 'CNPJ não encontrado na Receita Federal.' });
        }
        return res.status(503).json({ erro: 'Não foi possível consultar o CNPJ agora. Tente novamente em instantes.' });
    }

    if (!resultado.ativo) {
        return res.status(422).json({
            erro: 'Este CNPJ não está ATIVO na Receita Federal.',
            situacao_cadastral: resultado.dados.situacao_cadastral
        });
    }

    return res.json({
        mensagem: 'CNPJ válido e ativo.',
        razao_social: resultado.dados.razao_social,
        nome_fantasia: resultado.dados.nome_fantasia,
        situacao_cadastral: resultado.dados.situacao_cadastral
    });
});

// ── POST /api/auth/cadastro ──────────────────────────────────
router.post('/cadastro', async (req, res) => {
    const {
        tipo_doc, documento, nome, sobrenome,
        email, telefone, senha, perfil
    } = req.body;

    if (!tipo_doc || !documento || !nome || !email || !senha) {
        return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
    }
    if (!['cpf', 'cnpj'].includes(tipo_doc)) {
        return res.status(400).json({ erro: 'Tipo de documento inválido.' });
    }
    if (senha.length < 8) {
        return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    if (!emailValido(email)) {
        return res.status(400).json({ erro: 'E-mail inválido.' });
    }
    if (String(nome).trim().length < 2) {
        return res.status(400).json({ erro: 'Nome inválido.' });
    }

    // Validação REAL do documento — confere os dígitos verificadores,
    // não apenas a quantidade de dígitos.
    const docLimpo = String(documento).replace(/\D/g, '');
    if (tipo_doc === 'cpf'  && !cpfValido(docLimpo))  return res.status(400).json({ erro: 'CPF inválido.'  });
    if (tipo_doc === 'cnpj' && !cnpjValido(docLimpo)) return res.status(400).json({ erro: 'CNPJ inválido.' });

    // Para CNPJ, o backend SEMPRE confirma na BrasilAPI antes de salvar —
    // nunca confia em razão social / nome fantasia enviados pelo frontend,
    // pois esses valores poderiam ser forjados via DevTools.
    let razaoSocial = null, nomeFantasia = null, situacaoCadastral = null;
    let nomeFinal = nome;

    if (tipo_doc === 'cnpj') {
        const resultado = await consultarCNPJ(docLimpo);

        if (!resultado.ok) {
            if (resultado.motivo === 'nao_encontrado') {
                return res.status(404).json({ erro: 'CNPJ não encontrado na Receita Federal. Cadastro bloqueado.' });
            }
            return res.status(503).json({ erro: 'Não foi possível validar o CNPJ agora. Tente novamente em instantes.' });
        }

        if (!resultado.ativo) {
            return res.status(422).json({
                erro: 'Este CNPJ não está ATIVO na Receita Federal. Cadastro bloqueado.',
                situacao_cadastral: resultado.dados.situacao_cadastral
            });
        }

        razaoSocial        = resultado.dados.razao_social;
        nomeFantasia       = resultado.dados.nome_fantasia;
        situacaoCadastral  = resultado.dados.situacao_cadastral;
        nomeFinal          = razaoSocial || nome;   // razão social da Receita é a fonte de verdade
    }

    try {
        const [existentes] = await db.query(
            'SELECT id FROM usuarios WHERE documento = ? OR email = ? LIMIT 1',
            [documento, email]
        );
        if (existentes.length > 0) {
            return res.status(409).json({ erro: 'CPF/CNPJ ou e-mail já cadastrado.' });
        }

        const senha_hash = await bcrypt.hash(senha, 12);

        const [result] = await db.query(
            `INSERT INTO usuarios
             (tipo_doc, documento, nome, sobrenome, email, telefone, senha_hash, perfil,
              razao_social, nome_fantasia, situacao_cadastral)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tipo_doc, documento, nomeFinal,
                sobrenome || null, email,
                telefone  || null, senha_hash,
                perfil    || 'ambos',
                razaoSocial, nomeFantasia, situacaoCadastral
            ]
        );

        const [[usuario]] = await db.query(
            'SELECT * FROM usuarios WHERE id = ?', [result.insertId]
        );

        const token = gerarToken(usuario);

        return res.status(201).json({
            mensagem: 'Conta criada com sucesso!',
            token,
            usuario: sanitizarUsuario(usuario)
        });

    } catch (err) {
        console.error('[auth/cadastro]', err);
        return res.status(500).json({ erro: 'Erro ao criar conta. Tente novamente.' });
    }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
    const { documento, senha, lembrar } = req.body;

    if (!documento || !senha) {
        return res.status(400).json({ erro: 'Informe o documento e a senha.' });
    }

    try {
        const [[usuario]] = await db.query(
            'SELECT * FROM usuarios WHERE documento = ? AND ativo = 1 LIMIT 1',
            [documento]
        );

        if (!usuario) {
            return res.status(401).json({ erro: 'CPF/CNPJ ou senha incorretos.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'CPF/CNPJ ou senha incorretos.' });
        }

        const token = gerarToken(usuario);

        const expiraEm = lembrar
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() +  7 * 24 * 60 * 60 * 1000);

        const tokenSessao = crypto.randomBytes(64).toString('hex');
        await db.query(
            `INSERT INTO sessoes (usuario_id, token, ip, user_agent, expira_em)
             VALUES (?, ?, ?, ?, ?)`,
            [
                usuario.id, tokenSessao,
                req.ip,
                req.headers['user-agent']?.slice(0, 255) || null,
                expiraEm
            ]
        );

        return res.json({
            mensagem: 'Login realizado com sucesso!',
            token,
            usuario: sanitizarUsuario(usuario)
        });

    } catch (err) {
        console.error('[auth/login]', err);
        return res.status(500).json({ erro: 'Erro ao fazer login. Tente novamente.' });
    }
});

// ── POST /api/auth/recuperar/enviar ──────────────────────────
router.post('/recuperar/enviar', async (req, res) => {
    const { documento } = req.body;
    if (!documento) return res.status(400).json({ erro: 'Informe o CPF ou CNPJ.' });

    try {
        const [[usuario]] = await db.query(
            'SELECT id, email FROM usuarios WHERE documento = ? AND ativo = 1 LIMIT 1',
            [documento]
        );

        if (!usuario) {
            return res.json({ mensagem: 'Se o documento estiver cadastrado, você receberá um e-mail.' });
        }

        const codigo   = String(Math.floor(100000 + Math.random() * 900000));
        const expiraEm = new Date(Date.now() + 15 * 60 * 1000);

        await db.query(
            'UPDATE tokens_recuperacao SET usado = 1 WHERE usuario_id = ? AND usado = 0',
            [usuario.id]
        );

        await db.query(
            'INSERT INTO tokens_recuperacao (usuario_id, codigo, expira_em) VALUES (?, ?, ?)',
            [usuario.id, codigo, expiraEm]
        );

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] Código de recuperação para ${documento}: ${codigo}`);
        }

        // Envia o e-mail com o código. Se falhar, apenas registra no log
        // (não revela ao usuário se o documento existe ou se o envio deu erro).
        try {
            await mailer.sendMail({
                from: '"FreelaFree" <' + process.env.SMTP_USER + '>',
                to: usuario.email,
                subject: 'Código de recuperação - FreelaFree',
                html: `
                    <p>Você solicitou a recuperação da sua senha na FreelaFree.</p>
                    <p>Seu código de verificação é:</p>
                    <p style="font-size:26px;font-weight:bold;letter-spacing:4px;">${codigo}</p>
                    <p>Ele expira em 15 minutos. Se não foi você, ignore este e-mail.</p>
                `
            });
        } catch (mailErr) {
            console.error('[auth/recuperar/enviar] FALHA AO ENVIAR E-MAIL:', mailErr);
        }

        const emailMascarado = usuario.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        return res.json({
            mensagem: 'Se o documento estiver cadastrado, você receberá um e-mail.',
            emailMascarado
        });

    } catch (err) {
        console.error('[auth/recuperar/enviar]', err);
        return res.status(500).json({ erro: 'Erro ao processar solicitação.' });
    }
});

// ── POST /api/auth/recuperar/verificar ───────────────────────
router.post('/recuperar/verificar', async (req, res) => {
    const { documento, codigo } = req.body;
    if (!documento || !codigo) return res.status(400).json({ erro: 'Dados incompletos.' });

    try {
        const [[token]] = await db.query(
            `SELECT tr.id, tr.usuario_id
             FROM tokens_recuperacao tr
             JOIN usuarios u ON u.id = tr.usuario_id
             WHERE u.documento = ?
               AND tr.codigo   = ?
               AND tr.usado    = 0
               AND tr.expira_em > NOW()
             ORDER BY tr.criado_em DESC
             LIMIT 1`,
            [documento, codigo]
        );

        if (!token) {
            return res.status(400).json({ erro: 'Código inválido ou expirado.' });
        }

        return res.json({ mensagem: 'Código válido.', tokenId: token.id });

    } catch (err) {
        console.error('[auth/recuperar/verificar]', err);
        return res.status(500).json({ erro: 'Erro ao verificar código.' });
    }
});

// ── POST /api/auth/recuperar/senha ───────────────────────────
router.post('/recuperar/senha', async (req, res) => {
    const { documento, codigo, novaSenha } = req.body;
    if (!documento || !codigo || !novaSenha) return res.status(400).json({ erro: 'Dados incompletos.' });
    if (novaSenha.length < 8) return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' });

    try {
        const [[token]] = await db.query(
            `SELECT tr.id, tr.usuario_id
             FROM tokens_recuperacao tr
             JOIN usuarios u ON u.id = tr.usuario_id
             WHERE u.documento = ?
               AND tr.codigo   = ?
               AND tr.usado    = 0
               AND tr.expira_em > NOW()
             ORDER BY tr.criado_em DESC
             LIMIT 1`,
            [documento, codigo]
        );

        if (!token) {
            return res.status(400).json({ erro: 'Código inválido ou expirado.' });
        }

        const nova_hash = await bcrypt.hash(novaSenha, 12);

        await Promise.all([
            db.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [nova_hash, token.usuario_id]),
            db.query('UPDATE tokens_recuperacao SET usado = 1 WHERE id = ?', [token.id])
        ]);

        return res.json({ mensagem: 'Senha atualizada com sucesso!' });

    } catch (err) {
        console.error('[auth/recuperar/senha]', err);
        return res.status(500).json({ erro: 'Erro ao redefinir senha.' });
    }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', autenticar, async (req, res) => {
    await db.query('DELETE FROM sessoes WHERE usuario_id = ?', [req.usuario.id]);
    return res.json({ mensagem: 'Logout realizado.' });
});

module.exports = router;
