// ============================================================
//  FreelaFree — Serviço Mercado Pago (Pix via Orders API)
//  Requer Node 18+ (usa o fetch nativo, sem precisar de axios/node-fetch).
//
//  O SDK oficial `mercadopago` (pacote npm) ainda não cobre bem a Orders
//  API, então aqui a gente chama o endpoint REST diretamente — é o mesmo
//  jeito que a documentação oficial de teste de Pix recomenda.
//
//  IMPORTANTE (sandbox): para simular Pix em teste, o Access Token
//  precisa ser o de uma CONTA DE TESTE (vendedor), não da sua conta
//  pessoal — ele também começa com APP_USR-, só que pertence à conta
//  de teste. Em produção, é o mesmo formato, só que da sua conta real.
// ============================================================
const crypto = require('crypto');

const MP_BASE = 'https://api.mercadopago.com';

// Comissão FreelaFree: 5% cobrados POR CIMA do valor do freelancer.
// freelancer combina 100 → contratante paga 105 → plataforma retém 5.
function calcularValores(valorFreelancer) {
  const valor = Number(valorFreelancer);
  const taxa = Math.round(valor * 0.05 * 100) / 100;      // 5%
  const total = Math.round((valor + taxa) * 100) / 100;   // o que o contratante paga
  return { valorFreelancer: valor, taxa, total };
}

// Em sandbox, o pagador precisa ser o e-mail de teste oficial do MP
// (test_user_br@testuser.com) e first_name "APRO" força aprovação
// automática. Em produção, usa o e-mail real do contratante.
const EH_SANDBOX = process.env.MP_SANDBOX !== 'false'; // true por padrão — mude para 'false' no .env em produção
const EMAIL_COMPRADOR_TESTE = 'test_user_br@testuser.com';

// Cria uma order Pix. Retorna o id (usado como "mpPaymentId" daqui pra
// frente, pra não precisar mudar nada nas rotas/frontend) + dados do QR.
async function criarCobrancaPix({ valorTotal, descricao, emailPagador, referenciaInterna, notificationUrl }) {
  const valorFmt = Number(valorTotal).toFixed(2);
  const body = {
    type: 'online',
    external_reference: String(referenciaInterna),
    total_amount: valorFmt,
    payer: {
      email: EH_SANDBOX ? EMAIL_COMPRADOR_TESTE : (emailPagador || 'cliente@freelafree.com'),
      first_name: EH_SANDBOX ? 'APRO' : undefined,
    },
    transactions: {
      payments: [
        { amount: valorFmt, payment_method: { id: 'pix', type: 'bank_transfer' } }
      ]
    }
  };
  if (notificationUrl) body.notification_url = notificationUrl;

  const resp = await fetch(`${MP_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.message || 'Falha ao criar order Pix');
    err.cause = data;
    throw err;
  }

  const pagamento = data.transactions?.payments?.[0] || {};
  return {
    mpPaymentId: data.id,           // id da ORDER — usado nas consultas de status
    status: pagamento.status,       // costuma vir "action_required" no início
    qrCode: pagamento.payment_method?.qr_code,
    qrCodeBase64: pagamento.payment_method?.qr_code_base64,
    ticketUrl: pagamento.payment_method?.ticket_url,
  };
}

// Consulta o status atual de uma order pelo id (GET /v1/orders/{id}).
async function consultarPagamento(mpOrderId) {
  const resp = await fetch(`${MP_BASE}/v1/orders/${mpOrderId}`, {
    headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.message || 'Falha ao consultar order.');
    err.cause = data;
    throw err;
  }

  const pagamento = data.transactions?.payments?.[0] || {};

  // A Orders API usa um vocabulário diferente da antiga Payment API:
  // status "processed" + status_detail "accredited" = pagamento aprovado.
  let statusNormalizado = pagamento.status || data.status;
  if (pagamento.status === 'processed' && pagamento.status_detail === 'accredited') {
    statusNormalizado = 'approved';
  } else if (pagamento.status === 'rejected' || data.status === 'rejected') {
    statusNormalizado = 'rejected';
  } else if (pagamento.status === 'cancelled' || data.status === 'cancelled') {
    statusNormalizado = 'cancelled';
  }

  return {
    mpPaymentId: data.id,
    status: statusNormalizado, // approved | rejected | cancelled | action_required...
    externalReference: data.external_reference,
    valor: data.total_amount,
  };
}

module.exports = { calcularValores, criarCobrancaPix, consultarPagamento };
