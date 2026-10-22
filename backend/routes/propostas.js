// ============================================================
//  FreelaFree — Rotas de Propostas
//  routes/propostas.js
// ============================================================

const express    = require('express');
const router     = express.Router();
const nodemailer = require('nodemailer');
const db = require('../db/connection');
const { autenticar } = require('../middleware/autenticar');  // ← atualizado
const { criarNotificacao } = require('../utils/notificacoes');

// Transporter de e-mail (usa as variáveis SMTP_ do .env)
const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// Middleware: só contas CPF podem enviar propostas
function exigirFreelancer(req, res, next) {
    if (req.usuario.tipo_doc !== 'cpf') {
        return res.status(403).json({ erro: 'Apenas contas com CPF (freelancers) podem enviar propostas.' });
    }
    next();
}

// GET /api/propostas/minhas
router.get('/minhas', autenticar, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT pr.*, p.titulo AS projeto_titulo, p.categoria, u.nome AS contratante_nome
             FROM propostas pr
             JOIN projetos p ON p.id = pr.projeto_id
             JOIN usuarios u ON u.id = p.contratante_id
             WHERE pr.freelancer_id = ?
             ORDER BY pr.criado_em DESC`,
            [req.usuario.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[propostas/minhas]', err);
        return res.status(500).json({ erro: 'Erro ao buscar propostas.' });
    }
});

// GET /api/propostas/projeto/:id
router.get('/projeto/:id', autenticar, async (req, res) => {
    try {
        const [[proj]] = await db.query(
            'SELECT contratante_id FROM projetos WHERE id = ?', [req.params.id]
        );
        if (!proj) return res.status(404).json({ erro: 'Projeto não encontrado.' });
        if (proj.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Sem permissão.' });
        }

        const [rows] = await db.query(
            `SELECT pr.*, u.nome AS freelancer_nome, u.email AS freelancer_email
             FROM propostas pr
             JOIN usuarios u ON u.id = pr.freelancer_id
             WHERE pr.projeto_id = ?
             ORDER BY pr.criado_em DESC`,
            [req.params.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[propostas/projeto]', err);
        return res.status(500).json({ erro: 'Erro ao buscar propostas.' });
    }
});

// POST /api/propostas
router.post('/', autenticar, exigirFreelancer, async (req, res) => {
    const { projeto_id, valor, prazo_proposto, mensagem } = req.body;
    if (!projeto_id || !valor || !prazo_proposto || !mensagem) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    }
    try {
        const [[proj]] = await db.query(
            'SELECT status, contratante_id, orcamento FROM projetos WHERE id = ?', [projeto_id]
        );
        if (!proj || proj.status !== 'aberto') {
            return res.status(400).json({ erro: 'Projeto não disponível para propostas.' });
        }
        if (proj.contratante_id === req.usuario.id) {
            return res.status(400).json({ erro: 'Você não pode se candidatar ao seu próprio projeto.' });
        }
        if (Number(valor) > Number(proj.orcamento)) {
            const orcamentoFmt = 'R$ ' + Number(proj.orcamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            return res.status(400).json({ erro: `Sua proposta não pode ultrapassar o orçamento do projeto (${orcamentoFmt}).` });
        }

        const [result] = await db.query(
            `INSERT INTO propostas (projeto_id, freelancer_id, valor, prazo_proposto, mensagem)
             VALUES (?, ?, ?, ?, ?)`,
            [projeto_id, req.usuario.id, Number(valor), prazo_proposto, mensagem]
        );

        // Notifica o contratante por e-mail (não bloqueia a resposta se falhar)
        try {
            const [[dados]] = await db.query(
                `SELECT p.titulo, uc.email AS contratante_email, uf.nome AS freelancer_nome
                 FROM projetos p
                 JOIN usuarios uc ON uc.id = p.contratante_id
                 JOIN usuarios uf ON uf.id = ?
                 WHERE p.id = ?`,
                [req.usuario.id, projeto_id]
            );
            if (dados && dados.contratante_email) {
                const valorFmt = 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                await mailer.sendMail({
                    from: '"FreelaFree" <' + process.env.SMTP_USER + '>',
                    to: dados.contratante_email,
                    subject: 'Nova proposta recebida - FreelaFree',
                    html: `
                        <p>Você recebeu uma nova proposta no seu projeto <strong>${dados.titulo}</strong>.</p>
                        <p><strong>Freelancer:</strong> ${dados.freelancer_nome}<br>
                           <strong>Valor:</strong> ${valorFmt}<br>
                           <strong>Prazo:</strong> ${prazo_proposto}</p>
                        <p>Acesse a página <strong>Propostas Recebidas</strong> na FreelaFree para aceitar ou recusar.</p>
                    `
                });
            }
            if (dados) {
                await criarNotificacao(
                    proj.contratante_id,
                    'proposta_recebida',
                    `Nova proposta de ${dados.freelancer_nome} no projeto "${dados.titulo}"`,
                    'propostas-recebidas.html'
                );
            }
        } catch (mailErr) {
            console.error('[propostas/POST] Falha ao enviar e-mail:', mailErr);
        }

        return res.status(201).json({ mensagem: 'Proposta enviada!', proposta_id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Você já enviou uma proposta para este projeto.' });
        }
        console.error('[propostas/POST]', err);
        return res.status(500).json({ erro: 'Erro ao enviar proposta.' });
    }
});

// PATCH /api/propostas/:id/aceitar
router.patch('/:id/aceitar', autenticar, async (req, res) => {
    try {
        const [[prop]] = await db.query(
            `SELECT pr.*, p.contratante_id, p.titulo AS projeto_titulo
             FROM propostas pr JOIN projetos p ON p.id = pr.projeto_id
             WHERE pr.id = ?`,
            [req.params.id]
        );
        if (!prop) return res.status(404).json({ erro: 'Proposta não encontrada.' });
        if (prop.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Sem permissão.' });
        }
        if (prop.status !== 'pendente') {
            return res.status(400).json({ erro: 'Proposta não está pendente.' });
        }

        await db.query('UPDATE propostas SET status = "aceita"       WHERE id = ?',         [prop.id]);
        await db.query('UPDATE projetos  SET status = "em_andamento" WHERE id = ?',          [prop.projeto_id]);
        await db.query('UPDATE propostas SET status = "recusada"     WHERE projeto_id = ? AND id <> ?',
                       [prop.projeto_id, prop.id]);

        const [matchResult] = await db.query(
            `INSERT INTO matches (proposta_id, projeto_id, freelancer_id, contratante_id)
             VALUES (?, ?, ?, ?)`,
            [prop.id, prop.projeto_id, prop.freelancer_id, prop.contratante_id]
        );

        // Mensagem automática de boas-vindas na conversa recém-criada
        try {
            const valorFmt = 'R$ ' + Number(prop.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const texto = `✅ Proposta aceita! Valor combinado: ${valorFmt} · Prazo: ${prop.prazo_proposto}. Vamos começar!`;
            await db.query(
                'INSERT INTO mensagens (match_id, remetente_id, conteudo) VALUES (?, ?, ?)',
                [matchResult.insertId, req.usuario.id, texto]
            );
        } catch (msgErr) {
            console.error('[propostas/aceitar] Falha ao criar mensagem automática:', msgErr);
        }

        await criarNotificacao(
            prop.freelancer_id,
            'proposta_aceita',
            `Sua proposta para "${prop.projeto_titulo}" foi aceita!`,
            'mensagens.html?match=' + matchResult.insertId
        );

        return res.json({ mensagem: 'Proposta aceita! Match criado.', match_id: matchResult.insertId });
    } catch (err) {
        console.error('[propostas/aceitar]', err);
        return res.status(500).json({ erro: 'Erro ao aceitar proposta.' });
    }
});

// PATCH /api/propostas/:id/recusar
router.patch('/:id/recusar', autenticar, async (req, res) => {
    try {
        const [[prop]] = await db.query(
            `SELECT pr.*, p.contratante_id, p.titulo AS projeto_titulo FROM propostas pr
             JOIN projetos p ON p.id = pr.projeto_id WHERE pr.id = ?`,
            [req.params.id]
        );
        if (!prop || prop.contratante_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Sem permissão.' });
        }
        await db.query('UPDATE propostas SET status = "recusada" WHERE id = ?', [req.params.id]);
        await criarNotificacao(
            prop.freelancer_id,
            'proposta_recusada',
            `Sua proposta para "${prop.projeto_titulo}" foi recusada.`,
            'index.html'
        );
        return res.json({ mensagem: 'Proposta recusada.' });
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao recusar proposta.' });
    }
});

module.exports = router;
