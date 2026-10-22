// ============================================================
//  FreelaFree — Camada de Comunicação com a API
//  frontend/api.js
//  Inclua em todas as páginas: <script src="api.js"></script>
// ============================================================

// const API_BASE = 'https://freelafree-backend-production.up.railway.app/api'; // produção (Railway)
// const API_BASE = 'http://localhost:3000/api'; // local (teste) — descomente para voltar ao normal
const API_BASE = 'https://h56lm10l-3000.brs.devtunnels.ms/api'; // tunnel temporário (mostrar pra alguém)

// ── Notificações: estilos do sininho (injetados uma vez) ────
(function () {
    const css = `
    .ff-sino-wrap{position:relative;margin-right:10px;}
    .ff-sino-btn{position:relative;background:none;border:none;cursor:pointer;padding:8px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#475569;}
    .ff-sino-btn:hover{background:#f1f5f9;}
    .ff-sino-btn svg{width:22px;height:22px;}
    .ff-sino-badge{position:absolute;top:2px;right:2px;background:#dc2626;color:#fff;border-radius:999px;padding:1px 5px;font-size:10px;font-weight:700;line-height:1.4;}
    .ff-sino-drop{position:absolute;top:calc(100% + 8px);right:0;width:320px;max-width:90vw;max-height:420px;overflow-y:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.15);z-index:2000;}
    .ff-sino-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:14px;color:#1e293b;}
    .ff-sino-marcar-todas{background:none;border:none;color:#2563eb;font-size:12.5px;font-weight:600;cursor:pointer;}
    .ff-sino-marcar-todas:hover{text-decoration:underline;}
    .ff-sino-lista{display:flex;flex-direction:column;}
    .ff-sino-item{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f8fafc;padding:12px 14px;font-size:13.5px;color:#334155;cursor:pointer;}
    .ff-sino-item:hover{background:#f8fafc;}
    .ff-sino-vazio{padding:20px 14px;text-align:center;color:#94a3b8;font-size:13.5px;}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
})();

// ── Notificações: som (beep via Web Audio, sem precisar de arquivo .mp3) ──
let _ffAudioCtx = null;
function _ffTocarSom() {
    try {
        _ffAudioCtx = _ffAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (_ffAudioCtx.state === 'suspended') _ffAudioCtx.resume();
        const osc  = _ffAudioCtx.createOscillator();
        const gain = _ffAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, _ffAudioCtx.currentTime);
        osc.frequency.setValueAtTime(660, _ffAudioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, _ffAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _ffAudioCtx.currentTime + 0.35);
        osc.connect(gain).connect(_ffAudioCtx.destination);
        osc.start();
        osc.stop(_ffAudioCtx.currentTime + 0.35);
    } catch (_) {}
}
// Navegadores só liberam áudio depois de alguma interação do usuário —
// isso "destrava" o contexto no primeiro clique/tecla da página.
['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
    if (_ffAudioCtx && _ffAudioCtx.state === 'suspended') _ffAudioCtx.resume();
}, { once: true }));

const Auth = {
    salvar(token, usuario) {
        localStorage.setItem('ff_token', token);
        localStorage.setItem('ff_usuario', JSON.stringify(usuario));
    },
    token()  { return localStorage.getItem('ff_token'); },
    usuario() {
        const u = localStorage.getItem('ff_usuario');
        return u ? JSON.parse(u) : null;
    },
    logado() { return !!this.token(); },
    sair()   {
        localStorage.removeItem('ff_token');
        localStorage.removeItem('ff_usuario');
    }
};

async function req(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
        const token = Auth.token();
        if (!token) throw new Error('Não autenticado.');
        headers['Authorization'] = 'Bearer ' + token;
    }
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
    return data;
}

const get   = (path, auth)       => req('GET',    path, null, auth);
const post  = (path, body, auth) => req('POST',   path, body, auth);
const put   = (path, body, auth) => req('PUT',    path, body, auth);
const patch = (path, body, auth) => req('PATCH',  path, body, auth);
const del   = (path, auth)       => req('DELETE', path, null, auth);

const ApiAuth = {
    async cadastro(dados)                        { return post('/auth/cadastro', dados); },
    async validarCnpj(cnpj)                      { return post('/auth/validar-cnpj', { cnpj }); },
    async login(documento, senha, lembrar)       { return post('/auth/login', { documento, senha, lembrar }); },
    async logout()                               { return post('/auth/logout', {}, true); },
    async recuperarEnviar(doc)                   { return post('/auth/recuperar/enviar', { documento: doc }); },
    async recuperarVerificar(doc, codigo)        { return post('/auth/recuperar/verificar', { documento: doc, codigo }); },
    async recuperarSenha(doc, codigo, novaSenha) { return post('/auth/recuperar/senha', { documento: doc, codigo, novaSenha }); }
};

const ApiProjetos = {
    async meus()               { return get('/projetos/meus', true); },
    async listar(filtros = {}) {
        const qs = new URLSearchParams(filtros).toString();
        return get('/projetos' + (qs ? '?' + qs : ''));
    },
    async buscar(id)           { return get('/projetos/' + id); },
    async publicar(dados)      { return post('/projetos', dados, true); },
    async atualizar(id, dados) { return put('/projetos/' + id, dados, true); },
    async cancelar(id)         { return del('/projetos/' + id, true); }
};

const ApiPropostas = {
    async minhas()             { return get('/propostas/minhas', true); },
    async doProjeto(id)        { return get('/propostas/projeto/' + id, true); },
    async enviar(dados)        { return post('/propostas', dados, true); },
    async aceitar(id)          { return patch('/propostas/' + id + '/aceitar', {}, true); },
    async recusar(id)          { return patch('/propostas/' + id + '/recusar', {}, true); }
};

const ApiMatches = {
    async meus()     { return get('/matches/meus', true); },
    async buscar(id) { return get('/matches/' + id, true); },
    // metodo: 'pix' | 'transferencia' | 'boleto' | 'cartao'
    async concluir(id, metodo_pagamento = 'pix') {
        return patch('/matches/' + id + '/concluir', { metodo_pagamento }, true);
    }
};

const ApiPagamentos = {
    // Gera a cobrança Pix para o match (valor vem do backend, da proposta aceita).
    async criar(matchId, dados = {}) {
        return post('/pagamentos/criar', { matchId, ...dados }, true);
    },
    // Consulta o status atual de um pagamento (usado no polling do QR code).
    async status(mpPaymentId) {
        return get('/pagamentos/status/' + mpPaymentId);
    }
};

const ApiAvaliacoes = {
    // { match_id, nota (1-5), comentario? }
    async criar(dados)   { return post('/avaliacoes', dados, true); },
    // Reputação pública: { media, total, avaliacoes[] }
    async doUsuario(id)  { return get('/avaliacoes/usuario/' + id); },
    async doMatch(id)    { return get('/avaliacoes/match/' + id, true); }
};

const ApiMensagens = {
    async doMatch(matchId)          { return get('/mensagens/' + matchId, true); },
    async enviar(matchId, conteudo) { return post('/mensagens/' + matchId, { conteudo }, true); },
    async marcarLidas(matchId)      { return patch('/mensagens/' + matchId + '/lidas', {}, true); },
    // Upload de anexo (multipart/form-data). onProgress(pct 0-100) é opcional —
    // usa XHR em vez de fetch pra conseguir acompanhar o progresso em arquivos grandes.
    async enviarArquivo(matchId, file, onProgress) {
        const token = Auth.token();
        if (!token) throw new Error('Não autenticado.');
        const formData = new FormData();
        formData.append('arquivo', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_BASE + '/mensagens/' + matchId + '/anexo');
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
            }
            xhr.onload = () => {
                let data = {};
                try { data = JSON.parse(xhr.responseText); } catch (_) {}
                if (xhr.status >= 200 && xhr.status < 300) resolve(data);
                else reject(new Error(data.erro || `Erro ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Falha de rede ao enviar o arquivo.'));
            xhr.send(formData);
        });
    }
};

const ApiUsuarios = {
    async meuPerfil()      { return get('/usuarios/me', true); },
    async atualizar(dados) { return put('/usuarios/me', dados, true); },
    // Perfil público: reputação, histórico e avaliações recebidas
    async publico(id)      { return get('/usuarios/' + id); },
    // Upload da foto de perfil (multipart/form-data)
    async enviarFoto(file) {
        const token = Auth.token();
        if (!token) throw new Error('Não autenticado.');
        const formData = new FormData();
        formData.append('foto', file);
        const res  = await fetch(API_BASE + '/usuarios/foto', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
        return data;
    },
    // Remove a foto de perfil atual
    async removerFoto() { return del('/usuarios/foto', true); }
};

const ApiAdmin = {
    async stats() { return get('/admin/stats', true); }
};

const ApiDenuncias = {
    // Qualquer usuário logado
    async criar(tipo, alvo_id, motivo, descricao) {
        return post('/denuncias', { tipo, alvo_id, motivo, descricao }, true);
    },
    // Só admin
    async listar(status = 'pendente') { return get('/denuncias?status=' + status, true); },
    async arquivar(id)                { return patch('/denuncias/' + id + '/arquivar', {}, true); },
    async resolver(id, acao)          { return patch('/denuncias/' + id + '/resolver', { acao }, true); },
    async reativarUsuario(id)         { return patch('/denuncias/usuario/' + id + '/reativar', {}, true); }
};

const ApiNotificacoes = {
    async naoLidas()          { return get('/notificacoes/nao-lidas', true); },
    async listar()             { return get('/notificacoes', true); },
    async marcarLida(id)       { return patch('/notificacoes/' + id + '/marcar-lida', {}, true); },
    async marcarTodasLidas()   { return patch('/notificacoes/marcar-todas-lidas', {}, true); }
};

function _ffIniciais(nome) {
    if (!nome) return 'U';
    const p = nome.trim().split(/\s+/);
    const ini = (p[0]?.[0] || '') + (p.length > 1 ? (p[p.length - 1][0] || '') : '');
    return (ini || nome[0]).toUpperCase();
}
function _ffEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── Foto de perfil: helpers globais reaproveitados em qualquer página ──
function ffFotoUrl(caminho) {
    if (!caminho) return '';
    if (/^https?:\/\//.test(caminho)) return caminho;
    return API_BASE.replace(/\/api\/?$/, '') + caminho;
}
window.ffFotoUrl = ffFotoUrl;

// Mesma lógica do ffFotoUrl, mas pra anexos de mensagem
function ffArquivoUrl(caminho) {
    if (!caminho) return '';
    if (/^https?:\/\//.test(caminho)) return caminho;
    return API_BASE.replace(/\/api\/?$/, '') + caminho;
}
window.ffArquivoUrl = ffArquivoUrl;

// Cor de fundo do avatar — fixa em um tom de azul, pra combinar com a
// identidade visual do site. Usada tanto no menu (nav) quanto no perfil.html.
function ffCorDeId(id) {
    return '#2563eb';
}
window.ffCorDeId = ffCorDeId;

// Retorna o HTML interno do avatar: <img> se o usuário tem foto, senão as iniciais
function ffAvatarConteudo(usuario) {
    if (usuario && usuario.foto_url) {
        return `<img src="${ffFotoUrl(usuario.foto_url)}" alt="" class="ff-avatar-foto">`;
    }
    return _ffEsc(_ffIniciais(usuario ? (usuario.nome || usuario.email) : ''));
}
window.ffAvatarConteudo = ffAvatarConteudo;

function atualizarNavUsuario() {
    const area = document.getElementById('userArea');
    if (!area) return;
    const u = Auth.usuario();

    if (!u) {
        area.innerHTML = `
            <a href="login.html" class="btn-login">Login</a>
            <a href="cadastro.html" class="btn-cadastro">Cadastrar</a>`;
        return;
    }

    const nome  = u.nome || u.email || 'Usuário';
    const email = u.email || '';
    const ehEmpresa = u.tipo_doc === 'cnpj';
    const nomeSpanClasse = ehEmpresa ? ' ff-empresa' : '';
    const caret = '<svg class="ff-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    const iSair = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    const iPerfil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    area.innerHTML = `
        <div class="ff-sino-wrap">
          <button type="button" class="ff-sino-btn" aria-haspopup="true" aria-expanded="false" aria-label="Notificações">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <div class="ff-sino-drop" hidden>
            <div class="ff-sino-head">
              <span>Notificações</span>
              <button type="button" class="ff-sino-marcar-todas">Marcar todas como lidas</button>
            </div>
            <div class="ff-sino-lista"><div class="ff-sino-vazio">Nenhuma notificação nova</div></div>
          </div>
        </div>
        <div class="ff-user">
          <button type="button" class="ff-user-btn" aria-haspopup="true" aria-expanded="false" aria-label="Abrir menu do usuário">
            <span class="ff-avatar" style="background:${ffCorDeId(u.id)};" aria-hidden="true">${ffAvatarConteudo(u)}</span>
            <span class="ff-user-nome${nomeSpanClasse}">${_ffEsc(nome)}</span>
            ${caret}
          </button>
          <div class="ff-menu" role="menu" hidden>
            <div class="ff-menu-head">
              <span class="ff-avatar ff-avatar-lg" style="background:${ffCorDeId(u.id)};" aria-hidden="true">${ffAvatarConteudo(u)}</span>
              <div>
                <div class="ff-menu-nome${nomeSpanClasse}">${_ffEsc(nome)}</div>
                ${email ? `<div class="ff-menu-email">${_ffEsc(email)}</div>` : ''}
              </div>
            </div>
            <div class="ff-menu-sep"></div>
            <a class="ff-menu-item" role="menuitem" href="perfil.html?id=${u.id}"
               style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;">
              ${iPerfil}<span>Meu perfil</span>
            </a>
            <div class="ff-menu-sep"></div>
            <button type="button" class="ff-menu-item ff-sair" role="menuitem" onclick="fazerLogout()">
              ${iSair}<span>Sair</span>
            </button>
          </div>
        </div>`;

    const wrap = area.querySelector('.ff-user');
    const btn  = wrap.querySelector('.ff-user-btn');
    const menu = wrap.querySelector('.ff-menu');
    const abrir  = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true');  wrap.classList.add('open'); };
    const fechar = () => { menu.hidden = true;  btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); };
    btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden ? abrir() : fechar(); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) fechar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

    // ── Sininho de notificações ──
    const sinoWrap = area.querySelector('.ff-sino-wrap');
    const sinoBtn  = sinoWrap.querySelector('.ff-sino-btn');
    const sinoDrop = sinoWrap.querySelector('.ff-sino-drop');
    const abrirSino  = () => { sinoDrop.hidden = false; sinoBtn.setAttribute('aria-expanded', 'true');  _ffRenderizarListaSininho(); };
    const fecharSino = () => { sinoDrop.hidden = true;  sinoBtn.setAttribute('aria-expanded', 'false'); };
    sinoBtn.addEventListener('click', e => { e.stopPropagation(); sinoDrop.hidden ? abrirSino() : fecharSino(); });
    document.addEventListener('click', e => { if (!sinoWrap.contains(e.target)) fecharSino(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharSino(); });
    sinoWrap.querySelector('.ff-sino-marcar-todas').addEventListener('click', async () => {
        try { await ApiNotificacoes.marcarTodasLidas(); } catch (_) {}
        _ffNotifCache = [];
        _ffPintarSininho(0);
        _ffRenderizarListaSininho();
    });
    _ffPintarSininho(_ffNotifCache.length);
}
window.atualizarNavUsuario = atualizarNavUsuario;

async function fazerLogout() {
    try { await ApiAuth.logout(); } catch (_) {}
    Auth.sair();
    window.location.href = 'index.html';
}

// ── Link "Propostas" no menu — só para contratantes (CNPJ), com badge ──
async function configurarLinkPropostas() {
    const u = Auth.usuario();
    const ehContratante = u && u.tipo_doc === 'cnpj';
    const navs = document.querySelectorAll('.nav-links');
    if (!navs.length) return;

    navs.forEach(nav => {
        let link = nav.querySelector('a[href="propostas-recebidas.html"]');
        if (!ehContratante) {
            if (link) link.remove();   // freelancer/deslogado não vê
            return;
        }
        if (!link) {
            link = document.createElement('a');
            link.href = 'propostas-recebidas.html';
            link.textContent = 'Propostas';
            const msg = nav.querySelector('a[href="mensagens.html"]');
            if (msg) nav.insertBefore(link, msg);
            else nav.appendChild(link);
        }
    });

    if (!ehContratante) return;

    // ── Botão "Meus Projetos" ao lado do "Publicar" ──────────
    // Clona o botão de publicar para herdar exatamente o mesmo estilo,
    // seja ele um link do menu ou um botão de destaque na página.
    document.querySelectorAll('a[href*="publicar"], button[onclick*="publicar"]').forEach(orig => {
        if (orig.dataset.ffTemMeusProjetos) return;
        if (orig.closest('#userArea')) return;
        orig.dataset.ffTemMeusProjetos = '1';

        const novo = orig.cloneNode(false);   // mesma tag, mesmas classes, sem os filhos
        delete novo.dataset.ffTemMeusProjetos;
        novo.removeAttribute('id');
        novo.removeAttribute('onclick');
        novo.className = orig.className;
        novo.textContent = 'Meus Projetos';
        if (novo.tagName === 'A') novo.href = 'meus-projetos.html';
        else novo.onclick = () => { window.location.href = 'meus-projetos.html'; };
        novo.classList.add('ff-btn-meus-projetos');

        orig.insertAdjacentElement('afterend', novo);
        // pequeno respiro entre os dois, se estiverem colados
        if (!novo.previousSibling || novo.previousSibling.nodeType !== 3) {
            orig.insertAdjacentText('afterend', ' ');
        }
    });

    // Busca quantas propostas pendentes existem e mostra o badge
    try {
        const projetos = await ApiProjetos.meus();
        const pendentes = projetos.reduce((s, p) => s + (Number(p.propostas_pendentes) || 0), 0);
        if (pendentes > 0) {
            document.querySelectorAll('.nav-links a[href="propostas-recebidas.html"]').forEach(link => {
                if (link.querySelector('.ff-badge-prop')) return;
                const b = document.createElement('span');
                b.className = 'ff-badge-prop';
                b.textContent = pendentes;
                b.style.cssText = 'background:#dc2626;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700;margin-left:6px;';
                link.appendChild(b);
            });
        }
    } catch (_) {}
}

document.addEventListener('DOMContentLoaded', atualizarNavUsuario);
// ── Link "Admin" no menu — só para administradores ──────────
function configurarLinkAdmin() {
    const u = Auth.usuario();
    const ehAdmin = u && u.perfil === 'admin';
    document.querySelectorAll('.nav-links').forEach(nav => {
        let link = nav.querySelector('a[href="admin.html"]');
        if (!ehAdmin) { if (link) link.remove(); return; }
        if (!link) {
            link = document.createElement('a');
            link.href = 'admin.html';
            link.textContent = 'Admin';
            nav.appendChild(link);
        }
    });
}

document.addEventListener('DOMContentLoaded', configurarLinkPropostas);
document.addEventListener('DOMContentLoaded', configurarLinkAdmin);

// ============================================================
//  Notificação de novas mensagens
//  Mesmo padrão do badge de propostas: badge vermelho no menu +
//  contador no título da aba + ffToast quando chega mensagem nova.
//  Funciona em TODAS as páginas que carregam este arquivo.
// ============================================================
const FF_POLL_MSGS_MS = 8000;      // igual ao polling do chat
let _ffTotalMsgsAnterior = null;   // null = primeiro ciclo, não notifica

// O mensagens.html seta isso ao abrir uma conversa: a conversa que está
// na tela não deve gerar badge nem toast.
window.ffConversaAtivaId = null;

function _ffPintarBadgeMsgs(total) {
    document.querySelectorAll('.nav-links a[href="mensagens.html"]').forEach(link => {
        let b = link.querySelector('.ff-badge-msg');
        if (!total) { if (b) b.remove(); return; }
        if (!b) {
            b = document.createElement('span');
            b.className = 'ff-badge-msg';
            b.style.cssText = 'background:#dc2626;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700;margin-left:6px;';
            link.appendChild(b);
        }
        b.textContent = total > 9 ? '9+' : total;
    });

    // Título da aba: "(3) Mensagens - FreelaFree"
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = (total ? '(' + (total > 9 ? '9+' : total) + ') ' : '') + base;
}

async function ffAtualizarBadgeMensagens() {
    if (!Auth.logado()) return;

    let matches = [];
    try {
        matches = await ApiMatches.meus();
    } catch (_) { return; }   // 429 / offline: tenta de novo no próximo ciclo

    // Ignora a conversa aberta na tela — ela já está sendo lida
    const ativa = Number(window.ffConversaAtivaId) || 0;
    const relevantes = matches.filter(m => Number(m.id) !== ativa);

    const total = relevantes.reduce((s, m) => s + (Number(m.nao_lidas) || 0), 0);
    _ffPintarBadgeMsgs(total);

    if (_ffTotalMsgsAnterior !== null && total > _ffTotalMsgsAnterior) {
        const u    = Auth.usuario();
        const nova = relevantes.find(m => Number(m.nao_lidas) > 0);
        let texto  = 'Você tem novas mensagens';
        if (nova) {
            const souFreela = Number(nova.freelancer_id) === Number(u && u.id);
            const ehEmpresa = souFreela; // se eu sou freelancer, quem mandou é o contratante (empresa)
            const nomeExibido = (ehEmpresa && typeof window.ffApresentacaoAtiva === 'function' && window.ffApresentacaoAtiva())
                ? 'uma empresa'
                : ((souFreela ? nova.contratante_nome : nova.freelancer_nome) || 'usuário');
            texto = 'Nova mensagem de ' + nomeExibido + ' · ' + (nova.projeto_titulo || 'projeto');
        }
        if (typeof window.ffToast === 'function') window.ffToast(texto, 'info');
    }
    _ffTotalMsgsAnterior = total;
}
window.ffAtualizarBadgeMensagens = ffAtualizarBadgeMensagens;

document.addEventListener('DOMContentLoaded', () => {
    ffAtualizarBadgeMensagens();
    setInterval(() => { if (!document.hidden) ffAtualizarBadgeMensagens(); }, FF_POLL_MSGS_MS);
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ffAtualizarBadgeMensagens();
});

// ============================================================
//  Notificações gerais (proposta recebida/aceita/recusada,
//  pagamento liberado, denúncia enviada etc.)
//  Mesmo padrão de polling do chat/propostas — som + toast + sininho
//  com badge, em tempo real (ciclo de 8s) em todas as páginas.
// ============================================================
const FF_POLL_NOTIF_MS = 8000;
let _ffNotifCache = [];
let _ffNotifVistas = new Set(JSON.parse(sessionStorage.getItem('ff_notif_vistas') || '[]'));
let _ffNotifPrimeiraChecagem = true; // evita som/toast avalanche no primeiro carregamento da página

function _ffPintarSininho(total) {
    const btn = document.querySelector('.ff-sino-btn');
    if (!btn) return;
    let badge = btn.querySelector('.ff-sino-badge');
    if (!total) { if (badge) badge.remove(); return; }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ff-sino-badge';
        btn.appendChild(badge);
    }
    badge.textContent = total > 9 ? '9+' : total;
}

function _ffRenderizarListaSininho() {
    const lista = document.querySelector('.ff-sino-lista');
    if (!lista) return;
    if (!_ffNotifCache.length) {
        lista.innerHTML = '<div class="ff-sino-vazio">Nenhuma notificação nova</div>';
        return;
    }
    lista.innerHTML = _ffNotifCache.map(n =>
        `<button type="button" class="ff-sino-item" data-id="${n.id}" data-link="${n.link ? _ffEsc(n.link) : ''}">
            <span>${_ffEsc(n.mensagem)}</span>
         </button>`
    ).join('');
    lista.querySelectorAll('.ff-sino-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id   = item.dataset.id;
            const link = item.dataset.link;
            try { await ApiNotificacoes.marcarLida(id); } catch (_) {}
            _ffNotifCache = _ffNotifCache.filter(n => String(n.id) !== id);
            _ffPintarSininho(_ffNotifCache.length);
            _ffRenderizarListaSininho();
            if (link) window.location.href = link;
        });
    });
}

async function ffAtualizarNotificacoes() {
    if (!Auth.logado()) return;
    let notifs = [];
    try {
        notifs = await ApiNotificacoes.naoLidas();
    } catch (_) { return; } // 429 / offline: tenta de novo no próximo ciclo

    _ffNotifCache = notifs;
    _ffPintarSininho(notifs.length);
    const drop = document.querySelector('.ff-sino-drop');
    if (drop && !drop.hidden) _ffRenderizarListaSininho();

    const novas = notifs.filter(n => !_ffNotifVistas.has(n.id));
    if (novas.length && !_ffNotifPrimeiraChecagem) {
        _ffTocarSom();
        novas.slice(0, 3).forEach(n => { if (typeof window.ffToast === 'function') window.ffToast(n.mensagem, 'info'); });
    }
    notifs.forEach(n => _ffNotifVistas.add(n.id));
    sessionStorage.setItem('ff_notif_vistas', JSON.stringify([..._ffNotifVistas]));
    _ffNotifPrimeiraChecagem = false;
}
window.ffAtualizarNotificacoes = ffAtualizarNotificacoes;

document.addEventListener('DOMContentLoaded', () => {
    ffAtualizarNotificacoes();
    setInterval(() => { if (!document.hidden) ffAtualizarNotificacoes(); }, FF_POLL_NOTIF_MS);
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ffAtualizarNotificacoes();
});
