// Teste real de envio de e-mail (usa o SMTP do .env).
// Uso:  node scripts/testar-email.js seu@email.com
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { mailer, enviarEmail } = require('../utils/email');

(async () => {
    const para = process.argv[2];
    if (!para) return console.log('Uso: node scripts/testar-email.js seu@email.com');

    for (const v of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'])
        if (!process.env[v]) return console.log('❌ Falta', v, 'no .env');

    try { await mailer.verify(); console.log('✔ Conexão/login SMTP ok'); }
    catch (e) { return console.log('❌ SMTP falhou:', e.message, '\n   (Gmail: use "senha de app", não a senha normal)'); }

    const ok = await enviarEmail({
        para, assunto: 'Teste de notificação - FreelaFree', nome: 'teste',
        mensagem: 'Se você recebeu este e-mail, as notificações por e-mail estão funcionando!',
        link: 'index.html'
    });
    console.log(ok ? '✔ E-mail enviado — confira a caixa de entrada (e o spam).' : '❌ Não enviou (veja o erro acima).');
})();
