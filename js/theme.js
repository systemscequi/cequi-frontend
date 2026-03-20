/**
 * CEQUI — ThemeManager
 * Ícones SVG desenhados à mão. Botão no header-right fixo.
 */
(function () {
    var STORAGE_KEY = 'cequi_theme';

    // ── Ícone SOL — mostrado no tema escuro (clicar → vai para claro)
    // Design: sol minimalista com raios angulados, estilo técnico/militar
    var ICON_SUN  = '☀️';
    var ICON_MOON = '🌙';

    function loadTheme() {
        return localStorage.getItem(STORAGE_KEY) || 'dark';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateButton(theme);
        updateLogos(theme);
    }

    function updateLogos(theme) {
        // Detecta se estamos em /pages/ ou na raiz
        var isSubpage = window.location.pathname.includes('/pages/');
        var base = isSubpage ? '../assets/' : 'assets/';
        var src = theme === 'light'
            ? base + 'logo_clara.png'
            : base + 'logo_escura.png';
        document.querySelectorAll('.logo-img').forEach(function(img) {
            img.src = src;
        });
    }

    function updateButton(theme) {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        btn.innerHTML = (theme === 'dark') ? ICON_SUN : ICON_MOON;
        btn.setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
        btn.title = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
    }

    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        if (window.Notify) {
            Notify.info(next === 'light' ? 'Tema claro' : 'Tema escuro', 1400);
        }
    }

    function bindButton() {
        var btn = document.getElementById('themeToggle');
        if (btn) {
            btn.onclick = toggleTheme;
            updateButton(loadTheme());
        }
    }

    // Aplicar antes do DOMContentLoaded para evitar flash
    applyTheme(loadTheme());
    document.addEventListener('DOMContentLoaded', bindButton);

    window.ThemeManager = { toggle: toggleTheme, apply: applyTheme, current: loadTheme };
})();
