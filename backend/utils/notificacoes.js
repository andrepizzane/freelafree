// ============================================================
//  FreelaFree — Helper de criação de notificações
//  utils/notificacoes.js
//  Uso em qualquer rota:
//    const { criarNotificacao, criarNotificacaoParaAdmins } = require('../utils/notificacoes');
//    await criarNotificacao(usuarioId, 'proposta_recebida', 'Texto...', 'propostas-recebidas.html');
// ============================================================

const db = require('../db/connection');

// Nunca deixa uma falha ao notificar derrubar a ação principal (proposta,
// denúncia, pagamento etc.) — por isso captura o erro e só loga.
async function criarNotificacao(usuarioId, tipo, mensagem, link = null) {
    try {
        await db.query(
            'INSERT INTO notificacoes (usuario_id, tipo, mensagem, link) VALUES (?, ?, ?, ?)',
            [usuarioId, tipo, mensagem, link]
        );
    } catch (err) {
        console.error('[notificacoes] Falha ao criar notificação:', err);
    }
}

async function criarNotificacaoParaAdmins(tipo, mensagem, link = null) {
    try {
        const [admins] = await db.query("SELECT id FROM usuarios WHERE perfil = 'admin'");
        await Promise.all(admins.map(a => criarNotificacao(a.id, tipo, mensagem, link)));
    } catch (err) {
        console.error('[notificacoes] Falha ao notificar admins:', err);
    }
}

module.exports = { criarNotificacao, criarNotificacaoParaAdmins };
