// ============================================================
//  FreelaFree — Serviço central de e-mail
//  utils/email.js
//  Usa as variáveis SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS do .env
//  Opcional: APP_URL (ex.: http://localhost:5500) para os links dos e-mails
// ============================================================

const nodemailer = require('nodemailer');

const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function urlDoApp(link) {
    const base = (process.env.APP_URL || process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
    if (!base || base === '*' || !link) return null;
    return base + '/' + String(link).replace(/^\//, '');
}

function montarHtml({ nome, mensagem, link }) {
    const url = urlDoApp(link);
    const botao = url
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(url)}"
              style="background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;
                     text-decoration:none;font-weight:600;">Abrir na FreelaFree</a></p>`
        : '<p>Acesse a FreelaFree para ver os detalhes.</p>';

    return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
        <h2 style="color:#1d4ed8;margin-bottom:4px;">FreelaFree</h2>
        <p>Olá${nome ? ', ' + escapeHtml(nome) : ''}!</p>
        <p style="font-size:16px;">${escapeHtml(mensagem)}</p>
        ${botao}
        <p style="font-size:12px;color:#64748b;">Você recebeu este e-mail porque tem uma conta na FreelaFree.</p>
    </div>`;
}

// Nunca lança erro: falha de e-mail não pode derrubar a ação principal.
async function enviarEmail({ para, assunto, nome, mensagem, link = null }) {
    if (!para) return false;
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[email] SMTP não configurado no .env — e-mail não enviado.');
        return false;
    }
    try {
        await mailer.sendMail({
            from: '"FreelaFree" <' + process.env.SMTP_USER + '>',
            to: para,
            subject: assunto,
            html: montarHtml({ nome, mensagem, link }),
            text: mensagem
        });
        return true;
    } catch (err) {
        console.error('[email] Falha ao enviar e-mail para', para, err.message);
        return false;
    }
}

module.exports = { mailer, enviarEmail, escapeHtml };
