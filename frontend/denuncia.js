// ============================================================
//  FreelaFree — Componente de Denúncia
//  denuncia.js
//  Inclua nas páginas DEPOIS do api.js e ui.js:
//    <script src="denuncia.js"></script>
//
//  Uso:
//    ffDenunciar('projeto', 12)     → abre o modal
//    ffDenunciar('usuario', 5)
//    ffDenunciar('mensagem', 33)
//
//  Ou use o botão pronto:
//    ffBotaoDenuncia('projeto', 12) → devolve o HTML de um botão
// ============================================================
(function () {
  const MOTIVOS = [
    { v: 'spam',                t: 'Spam ou propaganda' },
    { v: 'fraude',              t: 'Fraude ou golpe' },
    { v: 'ofensivo',            t: 'Conteúdo ofensivo ou assédio' },
    { v: 'conteudo_inadequado', t: 'Conteúdo inadequado' },
    { v: 'fora_da_plataforma',  t: 'Tentativa de negociar fora da plataforma' },
    { v: 'outro',               t: 'Outro motivo' }
  ];
  const ROTULOS = { projeto: 'projeto', usuario: 'usuário', mensagem: 'mensagem' };

  const css = `
  .ffd-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;animation:ffdF .2s ease;}
  @keyframes ffdF{from{opacity:0}to{opacity:1}}
  .ffd-cx{background:#fff;border-radius:16px;max-width:460px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto;}
  .ffd-cx h4{margin:0 0 6px;font-size:19px;color:#1e293b;}
  .ffd-cx .ffd-sub{margin:0 0 18px;font-size:14px;color:#64748b;}
  .ffd-campo{margin-bottom:14px;}
  .ffd-campo label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;}
  .ffd-campo select,.ffd-campo textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:9px;padding:10px 12px;font-size:14px;font-family:inherit;color:#1e293b;background:#fff;}
  .ffd-campo textarea{min-height:96px;resize:vertical;}
  .ffd-campo select:focus,.ffd-campo textarea:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12);}
  .ffd-acoes{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;}
  .ffd-btn{border:none;padding:10px 20px;border-radius:9px;font-weight:600;cursor:pointer;font-size:14px;font-family:inherit;}
  .ffd-cancel{background:#f1f5f9;color:#475569;}
  .ffd-cancel:hover{background:#e2e8f0;}
  .ffd-enviar{background:#dc2626;color:#fff;}
  .ffd-enviar:hover{background:#b91c1c;}
  .ffd-enviar:disabled{opacity:.6;cursor:not-allowed;}
  .btn-denunciar{background:none;border:none;color:#94a3b8;font-size:12.5px;cursor:pointer;padding:4px 8px;border-radius:6px;font-family:inherit;text-decoration:underline;}
  .btn-denunciar:hover{color:#dc2626;background:#fef2f2;text-decoration:none;}
  `;
  const st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  function aviso(msg, tipo) {
    if (typeof ffToast === 'function') ffToast(msg, tipo);
    else alert(msg);
  }

  window.ffDenunciar = function (tipo, alvoId) {
    if (typeof Auth === 'undefined' || !Auth.logado()) {
      aviso('Faça login para denunciar.', 'erro');
      return;
    }
    if (!ROTULOS[tipo]) { console.error('Tipo de denúncia inválido:', tipo); return; }

    const ov = document.createElement('div');
    ov.className = 'ffd-ov';
    ov.innerHTML = `
      <div class="ffd-cx" role="dialog" aria-modal="true" aria-labelledby="ffdTit">
        <h4 id="ffdTit">Denunciar ${ROTULOS[tipo]}</h4>
        <p class="ffd-sub">Sua denúncia será analisada pela nossa equipe. Denúncias falsas podem levar à suspensão da conta.</p>
        <div class="ffd-campo">
          <label for="ffdMotivo">Motivo</label>
          <select id="ffdMotivo">
            ${MOTIVOS.map(m => `<option value="${m.v}">${m.t}</option>`).join('')}
          </select>
        </div>
        <div class="ffd-campo">
          <label for="ffdDesc">O que aconteceu?</label>
          <textarea id="ffdDesc" placeholder="Descreva com pelo menos 10 caracteres..." maxlength="600"></textarea>
        </div>
        <div class="ffd-acoes">
          <button class="ffd-btn ffd-cancel" type="button">Cancelar</button>
          <button class="ffd-btn ffd-enviar" type="button">Enviar denúncia</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const fechar = () => ov.remove();
    ov.querySelector('.ffd-cancel').onclick = fechar;
    ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
    });

    const btn = ov.querySelector('.ffd-enviar');
    btn.onclick = async () => {
      const motivo = ov.querySelector('#ffdMotivo').value;
      const desc   = ov.querySelector('#ffdDesc').value.trim();
      if (desc.length < 10) {
        aviso('Descreva a denúncia com pelo menos 10 caracteres.', 'erro');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        await ApiDenuncias.criar(tipo, alvoId, motivo, desc);
        fechar();
        aviso('Denúncia registrada. Nossa equipe vai analisar.', 'ok');
      } catch (err) {
        aviso(err.message || 'Não foi possível registrar a denúncia.', 'erro');
        btn.disabled = false;
        btn.textContent = 'Enviar denúncia';
      }
    };

    ov.querySelector('#ffdDesc').focus();
  };

  // Devolve o HTML de um botão de denúncia pronto para inserir
  window.ffBotaoDenuncia = function (tipo, alvoId, texto) {
    return `<button class="btn-denunciar" type="button" onclick="ffDenunciar('${tipo}', ${alvoId})">` +
           (texto || '⚑ Denunciar') + `</button>`;
  };
})();
