// ============================================================
//  FreelaFree — Transições de página fluidas
//  frontend/transitions.js
//  Fade + deslize suave ao entrar e sair de cada página.
// ============================================================
(function () {
    var DURACAO_SAIDA = 280; // ms

    // ── Estilos da transição (injetados aqui para não depender de CSS externo)
    var css = document.createElement('style');
    css.textContent =
        'body{opacity:1;transition:opacity .45s ease,transform .45s ease;will-change:opacity,transform;}' +
        'body.pg-enter{opacity:0;transform:translateY(14px);}' +
        'body.pg-exit{opacity:0;transform:translateY(-10px);pointer-events:none;}' +
        '@media (prefers-reduced-motion: reduce){body{transition:none !important;transform:none !important;opacity:1 !important;}}';
    document.head.appendChild(css);

    // ── ENTRADA: começa invisível e revela suave
    document.body.classList.add('pg-enter');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            document.body.classList.remove('pg-enter');
        });
    });

    // Voltar pelo histórico (bfcache): garante página visível
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            document.body.classList.remove('pg-exit', 'pg-enter');
        }
    });

    // ── SAÍDA: intercepta cliques em links internos e anima antes de navegar
    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        var href = link.getAttribute('href');

        // Ignora: âncoras da mesma página, externos, nova aba, mailto/tel
        if (!href || href.charAt(0) === '#') return;
        if (link.target === '_blank') return;
        if (/^(https?:)?\/\//.test(href) && link.hostname !== window.location.hostname) return;
        if (/^(mailto:|tel:)/.test(href)) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        document.body.classList.add('pg-exit');
        setTimeout(function () {
            window.location.href = href;
        }, DURACAO_SAIDA);
    });

    // ── SAÍDA também em navegações feitas por JS (login, publicar etc.)
    window.addEventListener('beforeunload', function () {
        document.body.classList.add('pg-exit');
    });
})();
