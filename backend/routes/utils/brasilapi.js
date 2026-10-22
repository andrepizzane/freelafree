// ============================================================
//  FreelaFree — Integração BrasilAPI (consulta de CNPJ)
//  utils/brasilapi.js
// ============================================================
//  Usado por routes/auth.js para confirmar, no backend, que um
//  CNPJ existe e está ATIVO antes de liberar o cadastro.
//  Nunca lança exceção: sempre resolve com { ok, motivo?, ... }
//  para que a rota decida o status HTTP sem derrubar o servidor.
// ============================================================

const BRASILAPI_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1/';
const TIMEOUT_MS = 8000;

async function consultarCNPJ(cnpjLimpo) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const resposta = await fetch(BRASILAPI_CNPJ_URL + cnpjLimpo, {
            signal: controller.signal,
            headers: {
                // A BrasilAPI bloqueia (403) requisições sem User-Agent no
                // endpoint de CNPJ — ver github.com/BrasilAPI/BrasilAPI/discussions/446
                'User-Agent': 'FreelaFree/1.0 (+https://freelafree.app)',
                'Accept': 'application/json'
            }
        });

        if (resposta.status === 404) {
            return { ok: false, motivo: 'nao_encontrado' };
        }

        if (!resposta.ok) {
            console.error('[brasilapi] status inesperado:', resposta.status);
            return { ok: false, motivo: 'erro_consulta' };
        }

        const dados = await resposta.json();
        const situacao = String(dados.descricao_situacao_cadastral || '').toUpperCase().trim();

        return {
            ok: true,
            ativo: situacao === 'ATIVA',
            dados: {
                razao_social: dados.razao_social || null,
                nome_fantasia: dados.nome_fantasia || null,
                situacao_cadastral: dados.descricao_situacao_cadastral || null
            }
        };

    } catch (err) {
        // Timeout (AbortError), DNS/rede fora do ar, JSON inválido, etc.
        // Nunca propaga — quem chamou trata como "não deu pra validar agora".
        console.error('[brasilapi] falha na consulta:', err.message || err);
        return { ok: false, motivo: 'erro_consulta' };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { consultarCNPJ };
