// ============================================================
//  FreelaFree — UI: avisos e confirmações bonitas
//  Inclua em todas as páginas DEPOIS do api.js:
//    <script src="ui.js"></script>
//  - Substitui automaticamente todos os alert() por um toast estilizado
//  - Fornece ffConfirm(msg) que retorna uma Promise<boolean>
// ============================================================
(function () {
  // ── Estilos (injetados uma vez) ──────────────────────────
  const css = `
  .ff-toast-wrap{position:fixed;top:20px;left:0;right:0;z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;padding:0 12px;}
  .ff-toast{pointer-events:auto;background:#fff;color:#1e293b;border:1px solid #e5e7eb;border-left:5px solid #2563eb;border-radius:12px;padding:14px 18px;box-shadow:0 10px 30px rgba(0,0,0,.14);font-size:14.5px;line-height:1.4;max-width:460px;display:flex;gap:10px;align-items:flex-start;animation:ffToastIn .25s ease;}
  .ff-toast.ok{border-left-color:#16a34a;} .ff-toast.erro{border-left-color:#dc2626;} .ff-toast.info{border-left-color:#2563eb;}
  .ff-toast .ff-ic{font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;}
  .ff-toast.saindo{animation:ffToastOut .25s ease forwards;}
  @keyframes ffToastIn{from{opacity:0;}to{opacity:1;}}
  @keyframes ffToastOut{to{opacity:0;}}

  .ff-modal-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;animation:ffFade .2s ease;}
  @keyframes ffFade{from{opacity:0;}to{opacity:1;}}
  .ff-modal-cx{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:ffPop .2s ease;}
  @keyframes ffPop{from{opacity:0;transform:scale(.96);}to{opacity:1;transform:scale(1);}}
  .ff-modal-cx h4{margin:0 0 8px;font-size:18px;color:#1e293b;}
  .ff-modal-cx p{margin:0 0 20px;font-size:15px;color:#475569;line-height:1.5;}
  .ff-modal-acoes{display:flex;gap:10px;justify-content:flex-end;}
  .ff-btn{border:none;padding:10px 20px;border-radius:9px;font-weight:600;cursor:pointer;font-size:14px;font-family:inherit;}
  .ff-btn-cancel{background:#f1f5f9;color:#475569;}
  .ff-btn-cancel:hover{background:#e2e8f0;}
  .ff-btn-ok{background:#2563eb;color:#fff;}
  .ff-btn-ok:hover{background:#1d4ed8;}

  /* Foto de perfil dentro do avatar (nav, perfil, onde mais usar .ff-avatar) */
  .ff-avatar-foto{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}

  /* Modo apresentação: borra nomes de empresas (marcados com .ff-empresa) */
  html.ff-apresentacao .ff-empresa{
    filter:blur(7px);
    user-select:none;
    -webkit-user-select:none;
    transition:filter .15s ease;
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // ── Modo apresentação ─────────────────────────────────────
  //  Liga/desliga via localStorage, pra persistir enquanto o
  //  apresentador navega entre páginas. Qualquer elemento com a
  //  classe "ff-empresa" fica borrado enquanto o modo tá ativo.
  const FF_APRESENTACAO_KEY = 'ff_apresentacao';

  // Permite ligar/desligar via URL (?apresentacao=1 ou ?apresentacao=0),
  // assim o modo funciona em QUALQUER computador que abrir o link,
  // sem depender do localStorage local de cada máquina.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('apresentacao')) {
      localStorage.setItem(FF_APRESENTACAO_KEY, params.get('apresentacao') === '0' ? '0' : '1');
    }
  } catch (e) { /* ignora se URLSearchParams não estiver disponível */ }

  window.ffApresentacaoAtiva = function () {
    return localStorage.getItem(FF_APRESENTACAO_KEY) === '1';
  };

  window.ffAplicarApresentacao = function () {
    document.documentElement.classList.toggle('ff-apresentacao', window.ffApresentacaoAtiva());
  };

  window.ffSetApresentacao = function (ativo) {
    localStorage.setItem(FF_APRESENTACAO_KEY, ativo ? '1' : '0');
    window.ffAplicarApresentacao();
  };

  // Aplica assim que o script carrega (evita "piscar" o nome real antes do DOMContentLoaded)
  window.ffAplicarApresentacao();
  document.addEventListener('DOMContentLoaded', window.ffAplicarApresentacao);

  // ── Toast ────────────────────────────────────────────────
  function garantirWrap() {
    let w = document.querySelector('.ff-toast-wrap');
    if (!w) {
      w = document.createElement('div');
      w.className = 'ff-toast-wrap';
    }
    // Sempre como último filho direto do <body>: garante que nenhum
    // container com transform/overflow quebre o position:fixed.
    if (w.parentElement !== document.body) {
      document.body.appendChild(w);
    }
    // Força o posicionamento inline com !important
    w.style.setProperty('position', 'fixed', 'important');
    w.style.setProperty('top', '20px', 'important');
    w.style.setProperty('left', '0', 'important');
    w.style.setProperty('right', '0', 'important');
    w.style.setProperty('bottom', 'auto', 'important');
    w.style.setProperty('transform', 'none', 'important');
    w.style.setProperty('z-index', '2147483647', 'important');
    w.style.setProperty('display', 'flex', 'important');
    w.style.setProperty('flex-direction', 'column', 'important');
    w.style.setProperty('align-items', 'center', 'important');
    w.style.setProperty('pointer-events', 'none', 'important');
    w.style.setProperty('margin', '0', 'important');

    ativarModoResgate(w);
    return w;
  }

  // ── Modo de resgate ─────────────────────────────────────
  //  Se algum ancestral tiver transform/filter/perspective, o
  //  position:fixed do navegador para de funcionar (vira "absolute"
  //  em relação a esse ancestral) e o toast rola junto com a página.
  //  Detectamos isso e reposicionamos manualmente a cada scroll.
  let resgateAtivo = false;
  function ativarModoResgate(w) {
    if (resgateAtivo) return;
    resgateAtivo = true;

    const reposicionar = () => {
      if (!w.isConnected || !w.children.length) return;
      const r = w.getBoundingClientRect();
      // Se o topo do wrap saiu de perto dos 20px da viewport, o fixed
      // quebrou → corrigimos usando "absolute" + o scroll atual.
      if (Math.abs(r.top - 20) > 2) {
        const y = window.pageYOffset || document.documentElement.scrollTop || 0;
        w.style.setProperty('position', 'absolute', 'important');
        w.style.setProperty('top', (y + 20) + 'px', 'important');
      }
    };

    window.addEventListener('scroll', reposicionar, { passive: true });
    window.addEventListener('resize', reposicionar);
    // corrige logo após o toast entrar na tela
    requestAnimationFrame(reposicionar);
    setTimeout(reposicionar, 60);
  }
  const ICONES = { ok: '✓', erro: '✕', info: 'ℹ' };
  window.ffToast = function (msg, tipo) {
    tipo = tipo || 'info';
    const wrap = garantirWrap();
    // volta para fixed a cada novo toast; o modo resgate corrige se quebrar
    wrap.style.setProperty('position', 'fixed', 'important');
    wrap.style.setProperty('top', '20px', 'important');
    const t = document.createElement('div');
    t.className = 'ff-toast ' + tipo;
    t.innerHTML = '<span class="ff-ic">' + (ICONES[tipo] || 'ℹ') + '</span><span></span>';
    t.lastChild.textContent = String(msg);
    wrap.appendChild(t);
    // checa imediatamente se o fixed pegou; se não, o resgate ajusta
    requestAnimationFrame(() => {
      const r = wrap.getBoundingClientRect();
      if (Math.abs(r.top - 20) > 2) {
        const y = window.pageYOffset || document.documentElement.scrollTop || 0;
        wrap.style.setProperty('position', 'absolute', 'important');
        wrap.style.setProperty('top', (y + 20) + 'px', 'important');
      }
    });
    setTimeout(() => {
      t.classList.add('saindo');
      setTimeout(() => t.remove(), 250);
    }, 5000);
  };

  // ── Substitui o alert() nativo por um toast ──────────────
  //  Detecta o tom pela mensagem (sucesso/erro) automaticamente.
  window.alert = function (msg) {
    const s = String(msg).toLowerCase();
    let tipo = 'info';
    if (/sucesso|aceit|publicad|enviad|conclu|realizad|salv/.test(s)) tipo = 'ok';
    else if (/erro|inv[aá]lid|falh|incorret|obrigat|precisa|n[aã]o\s|informe|deve|apenas/.test(s)) tipo = 'erro';
    window.ffToast(msg, tipo);
  };

  // ── Confirmação bonita (Promise<boolean>) ────────────────
  window.ffConfirm = function (msg, titulo) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'ff-modal-ov';
      ov.innerHTML = `
        <div class="ff-modal-cx" role="dialog" aria-modal="true">
          <h4>${titulo ? String(titulo) : 'Confirmar'}</h4>
          <p></p>
          <div class="ff-modal-acoes">
            <button class="ff-btn ff-btn-cancel" type="button">Cancelar</button>
            <button class="ff-btn ff-btn-ok" type="button">Confirmar</button>
          </div>
        </div>`;
      ov.querySelector('p').textContent = String(msg);
      document.body.appendChild(ov);

      const fechar = (val) => { ov.remove(); resolve(val); };
      ov.querySelector('.ff-btn-cancel').onclick = () => fechar(false);
      ov.querySelector('.ff-btn-ok').onclick    = () => fechar(true);
      ov.addEventListener('click', (e) => { if (e.target === ov) fechar(false); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { fechar(false); document.removeEventListener('keydown', esc); }
      });
      ov.querySelector('.ff-btn-ok').focus();
    });
  };
})();

// ============================================================
//  Navegação global — funciona em TODAS as páginas
//  (corrige: menu hambúrguer só abria na home; logo não voltava)
// ============================================================
(function () {
  // toggleMenu global: se o script.js já definiu, não sobrescreve
  if (typeof window.toggleMenu !== 'function') {
    window.toggleMenu = function () {
      const nav = document.querySelector('nav');
      if (nav) nav.classList.toggle('nav-aberto');
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Fecha o menu ao clicar em qualquer link do nav
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        document.querySelector('nav')?.classList.remove('nav-aberto');
      });
    });

    // Logo clicável → volta para a home (em toda página)
    const logo = document.querySelector('header h1');
    if (logo && !logo.dataset.linkHome) {
      logo.dataset.linkHome = '1';
      // Se ainda não for um link, transforma o conteúdo num link real
      // (mais confiável que só um clique — funciona no mobile sem JS).
      if (!logo.querySelector('a')) {
        const txt = logo.textContent.trim();
        logo.innerHTML = '<a href="index.html" style="color:inherit;text-decoration:none;cursor:pointer;">' + txt + '</a>';
      }
      logo.style.cursor = 'pointer';
      logo.setAttribute('title', 'Voltar ao início');
      logo.addEventListener('click', () => { window.location.href = 'index.html'; });
    }
  });
})();
