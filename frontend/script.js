// ============================================================
//  FreelaFree — Script principal
//  frontend/script.js
// ============================================================

function toggleMenu() {
    const nav = document.querySelector('nav');
    nav.classList.toggle('nav-aberto');
}

// Fecha o menu ao clicar em um link
document.addEventListener('DOMContentLoaded', function () {
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            document.querySelector('nav').classList.remove('nav-aberto');
        });
    });

    // ── Barra de pesquisa do nav ──────────────────────────────
    const input  = document.querySelector('.search-bar input');
    const btnBusca = document.querySelector('.search-btn');

    if (!input) return;

    function executarBusca() {
        const termo = input.value.trim();
        if (!termo) return;

        const estaEmTrabalhos = window.location.pathname.endsWith('trabalhos.html');

        if (estaEmTrabalhos) {
            // Já está na página de trabalhos — aplica o filtro direto
            const campoBusca = document.getElementById('buscaPrincipal');
            if (campoBusca) {
                campoBusca.value = termo;
                if (typeof carregarProjetos === 'function') carregarProjetos();
                campoBusca.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Redireciona para trabalhos.html com o termo na URL
            window.location.href = 'trabalhos.html?busca=' + encodeURIComponent(termo);
        }
    }

    // Clique no botão de busca
    if (btnBusca) {
        btnBusca.addEventListener('click', executarBusca);
    }

    // Enter no input
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') executarBusca();
    });
});

// ============================================================
//  Rolagem suave garantida para âncoras (#sobre, #servicos...)
//  Captura o clique ANTES de qualquer outro script e anima
//  manualmente — funciona em todos os navegadores.
// ============================================================
(function () {
    var DURACAO = 700; // ms — aumente para rolar mais devagar

    function alturaNav() {
        var nav = document.querySelector('nav');
        return nav ? nav.offsetHeight + 12 : 80;
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function rolarPara(destinoY) {
        var inicioY = window.pageYOffset;
        var delta = destinoY - inicioY;
        var inicio = null;

        function passo(ts) {
            if (inicio === null) inicio = ts;
            var p = Math.min((ts - inicio) / DURACAO, 1);
            window.scrollTo(0, inicioY + delta * easeInOutCubic(p));
            if (p < 1) requestAnimationFrame(passo);
        }
        requestAnimationFrame(passo);
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!link) return;

        var hash = link.getAttribute('href');

        // Impede o pulo instantâneo e qualquer intercepção do transitions.js
        e.preventDefault();
        e.stopPropagation();

        // Fecha o menu mobile, se estiver aberto
        var nav = document.querySelector('nav');
        if (nav) nav.classList.remove('nav-aberto');

        if (hash === '#' || hash === '#top') {
            rolarPara(0);
            return;
        }

        var alvo = document.querySelector(hash);
        if (!alvo) return;

        var y = alvo.getBoundingClientRect().top + window.pageYOffset - alturaNav();
        rolarPara(Math.max(y, 0));

        // Atualiza a URL sem provocar salto
        if (history.pushState) history.pushState(null, '', hash);
    }, true); // true = fase de captura: roda antes dos outros listeners
})();
