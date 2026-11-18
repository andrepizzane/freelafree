// ============================================================
//  FreelaFree — Helper de criação de notificações
//  utils/notificacoes.js
//  Cada notificação é salva no sistema E enviada por e-mail para o
//  usuário (conta CPF ou CNPJ — o e-mail vem do cadastro).
//  Uso em qualquer rota:
//    const { criarNotificacao, criarNotificacaoParaAdmins } = require('../utils/notificacoes');
//    await criarNotificacao(usuarioId, 'proposta_recebida', 'Texto...', 'propostas-recebidas.html');
// ============================================================

const db = require('../db/connection');
const { enviarEmail } = require('./email');

const ASSUNTOS = {
    proposta_recebida:  'Nova proposta recebida - FreelaFree',
    proposta_aceita:    'Sua proposta foi aceita! - FreelaFree',
    proposta_recusada:  'Atualização da sua proposta - FreelaFree',
    pagamento_liberado: 'Pagamento liberado - FreelaFree',
    pagamento_aprovado: 'Pagamento confirmado - FreelaFree',
    denuncia_enviada:   'Nova denúncia recebida - FreelaFree'
};

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

    // E-mail para a conta (CPF ou CNPJ) — independente de a notificação interna ter dado certo
    try {
        const [[usuario]] = await db.query(
            'SELECT nome, email FROM usuarios WHERE id = ? AND ativo = 1',
            [usuarioId]
        );
        if (usuario && usuario.email) {
            await enviarEmail({
                para: usuario.email,
                assunto: ASSUNTOS[tipo] || 'Nova notificação - FreelaFree',
                nome: usuario.nome,
                mensagem,
                link
            });
        }
    } catch (err) {
        console.error('[notificacoes] Falha ao enviar e-mail da notificação:', err);
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
