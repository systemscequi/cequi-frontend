/**
 * CEQUI - Autenticação e Controle de Acesso
 * role "admin" → acesso total ao sistema
 * role "user"  → acesso restrito ao próprio servidor
 */

// Páginas exclusivas para admin (redireciona user para dashboard)
var ADMIN_ONLY_PAGES = [
    "visao-equipe.html",
    "cadastro-colaboradores.html"
];

// Links de nav que user comum não deve ver
var ADMIN_NAV_PAGES = [
    "visao-equipe.html",
    "cadastro-colaboradores.html"
];

// ───────────────────────────────────────────────────────────────────────
class AuthManager {
    constructor() {
        this.SESSION_KEY = "cequi_session";
        this.TOKEN_KEY   = "cequi_token";
    }

    // ── Armazena em sessionStorage (limpa ao fechar o navegador) ─────
    // Token JWT nunca vai para o localStorage
    _salvarSessao(session, token) {
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        sessionStorage.setItem(this.TOKEN_KEY,   token);
    }

    _limparSessao() {
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem(this.TOKEN_KEY);
    }

    // ── Retorna o token JWT para uso nas chamadas à API ────────────────
    getToken() {
        return sessionStorage.getItem(this.TOKEN_KEY) || null;
    }

    login(ponto, senha) {
        // SEMPRE usar MOCK_COLABORADORES para autenticar
        // (garante que role e senha estejam presentes, independente do localStorage)
        var colaboradores = window.MOCK_COLABORADORES || [];

        var servidor = null;
        for (var i = 0; i < colaboradores.length; i++) {
            if (colaboradores[i].ponto === parseInt(ponto)) {
                servidor = colaboradores[i];
                break;
            }
        }

        if (!servidor) {
            return { success: false, message: "Ponto não encontrado. Verifique o número." };
        }

        var senhaEsperada = servidor.senha || "cequi2026";
        if (senha !== senhaEsperada) {
            return { success: false, message: "Senha incorreta." };
        }

        var session = {
            userId:    servidor.id,
            ponto:     servidor.ponto,
            nome:      servidor.nome,
            area:      servidor.area,
            role:      servidor.role || "user",
            loginTime: new Date().toISOString(),
            // Expiração da sessão: 8 horas
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        };

        // Usar sessionStorage em vez de localStorage
        // (dados de sessão são apagados ao fechar o navegador)
        this._salvarSessao(session, 'mock-token-' + servidor.id);
        CurrentServer.set(servidor);
        return { success: true, servidor: servidor, session: session };
    }

    logout() {
        this._limparSessao();
        // Limpar também localStorage de dados do servidor atual
        localStorage.removeItem('cequi_current_server');
        CurrentServer.clear();
        var inPages = window.location.pathname.includes("/pages/");
        window.location.href = inPages ? "../login.html" : "login.html";
    }

    getSession() {
        var d = sessionStorage.getItem(this.SESSION_KEY);
        if (!d) return null;
        try {
            var session = JSON.parse(d);
            // Verificar expiração
            if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
                this._limparSessao();
                return null;
            }
            return session;
        } catch (e) {
            this._limparSessao();
            return null;
        }
    }

    isAuthenticated()  { return this.getSession() !== null; }
    isAdmin()          { var s = this.getSession(); return s && s.role === "admin"; }

    // Protege a página atual — redireciona se sem permissão
    requireAuth() {
        var session = this.getSession();
        var inPages = window.location.pathname.includes("/pages/");
        var loginUrl = inPages ? "../login.html" : "login.html";
        var dashUrl  = inPages ? "../index.html"  : "index.html";

        if (!session) { window.location.href = loginUrl; return false; }

        var page = window.location.pathname.split("/").pop();
        if (ADMIN_ONLY_PAGES.indexOf(page) !== -1 && session.role !== "admin") {
            window.location.href = dashUrl;
            return false;
        }

        // Garantir que CurrentServer está setado com os dados do usuário logado
        if (typeof CurrentServer !== "undefined") {
            var cs = CurrentServer.get();
            var sessionUser = session.userId;
            // Para user comum: sempre forçar CurrentServer para o próprio servidor
            if (session.role !== "admin" || !cs) {
                // Usar cache do banco (DataStore) primeiro, depois MOCK_COLABORADORES
                var colabs = (typeof DataStore !== "undefined" ? DataStore.getColaboradores() : null)
                          || window.MOCK_COLABORADORES || [];
                var found = false;
                for (var i = 0; i < colabs.length; i++) {
                    if (parseInt(colabs[i].id) === parseInt(sessionUser)) {
                        CurrentServer.set(colabs[i]);
                        found = true;
                        break;
                    }
                }
                // Se ainda não encontrou, criar objeto básico da sessão
                if (!found && session.role !== "admin") {
                    CurrentServer.set({
                        id:    session.userId,
                        ponto: session.ponto,
                        nome:  session.nome,
                        area:  session.area,
                        role:  session.role
                    });
                }
            }
        }

        return true;
    }

    // Aplica restrições visuais e funcionais após carregar a página
    applyRoleUI() {
        var session = this.getSession();
        if (!session) return;
        var isAdmin = session.role === "admin";

        this._addHeaderElements(session, isAdmin);
        this._filterNav(isAdmin);

        if (!isAdmin) {
            this._lockDashboardSelector(session);
            this._restrictRelatorios(session);
            this._restrictConfiguracoes();
            this._restrictListaProdutos(session);
            this._lockAllServerSelects(session);
            this._hideAdminButtons();
        }
    }

    // ── Header: badge de role + nome + botão sair ─────────────────────
    _addHeaderElements(session, isAdmin) {
        // Injetar no #headerRight (zona direita reservada) — zero layout shift
        var right = document.getElementById("headerRight");
        if (!right) return;

        // Badge de role removido

        // Nome do usuário (primeiros 2 nomes)
        var nomeEl = document.createElement("span");
        nomeEl.className = "header-username";
        nomeEl.textContent = session.nome;
        right.appendChild(nomeEl);

        // Separador visual
        var sep = document.createElement("span");
        sep.className = "header-sep";
        right.appendChild(sep);

        // Botão sair
        var logoutBtn = document.createElement("button");
        logoutBtn.className = "nav-btn sair";
        logoutBtn.textContent = "Sair";
        logoutBtn.onclick = function() {
            Notify.confirm("Deseja sair do sistema?", () => Auth.logout());
        };
        right.appendChild(logoutBtn);
    }

    // ── Oculta itens de nav que user não pode ver ─────────────────────
    _filterNav(isAdmin) {
        var links = document.querySelectorAll(".header-nav a, .mobile-nav a");
        links.forEach(function(link) {
            var href = link.getAttribute("href") || "";
            var page = href.split("/").pop().split("?")[0];
            // Hide admin-only pages from users
            if (!isAdmin && ADMIN_NAV_PAGES.indexOf(page) !== -1) {
                link.style.display = "none";
            }
            // Hide items marked admin-only via class
            if (!isAdmin && link.classList.contains("nav-admin-only")) {
                link.style.display = "none";
            }
            // Hide items marked user-only from admin
            if (isAdmin && link.classList.contains("nav-user-only")) {
                link.style.display = "none";
            }
        });
    }

    // ── Dashboard: trava seletor no próprio servidor ──────────────────
    // (dashboard.js já faz isso no init() — auth apenas garante o visual)
    _lockDashboardSelector(session) {
        var sel = document.getElementById("serverSelect");
        if (!sel) return;
        var attempts = 0;
        var interval = setInterval(function() {
            if (sel.options.length > 1 || attempts++ > 20) {
                clearInterval(interval);
                if (sel.value !== String(session.userId)) {
                    sel.value = String(session.userId);
                }
                sel.disabled = true;
                sel.style.opacity = "0.7";
                sel.style.cursor  = "not-allowed";
            }
        }, 200);
    }

    // ── Relatórios: remove opção "Equipe" e trava servidor ───────────
    _restrictRelatorios(session) {
        // Remover opção equipe do select de tipo
        var tipoSel = document.getElementById("tipoRelatorio");
        if (tipoSel) {
            for (var i = tipoSel.options.length - 1; i >= 0; i--) {
                if (tipoSel.options[i].value === "equipe") {
                    tipoSel.remove(i);
                }
            }
            // Sempre individual para user
            tipoSel.value = "individual";
            tipoSel.disabled = true;
        }

        // Forçar seleção do próprio servidor e bloquear
        var srvSel = document.getElementById("servidorSelect");
        if (srvSel) {
            var attempts = 0;
            var interval = setInterval(function() {
                if (srvSel.options.length > 1 || attempts++ > 20) {
                    clearInterval(interval);
                    srvSel.value = String(session.userId);
                    srvSel.disabled = true;
                    srvSel.style.opacity = "0.7";
                }
            }, 150);
        }

        // Mostrar grupo do servidor (forçar visível pois tipo é sempre "individual")
        var srvGroup = document.getElementById("servidorGroup");
        if (srvGroup) srvGroup.style.display = "block";

        // Ocultar botões de exportação Excel/PDF (user só pode CSV do próprio)
        document.addEventListener("relatorio-rendered", function() {
            var btns = document.querySelectorAll(".btn-exportar-admin");
            btns.forEach(function(b) { b.style.display = "none"; });
        });
    }

    // ── Configurações: oculta seção Backup & Dados ────────────────────
    _restrictConfiguracoes() {
        var sec = document.getElementById("secaoBackup");
        if (sec) sec.style.display = "none";

        var adminCards = document.querySelectorAll("[data-admin-only]");
        adminCards.forEach(function(c) { c.style.display = "none"; });
    }

    // ── Lista de produtos: garante que user só vê os próprios ─────────
    _restrictListaProdutos(session) {
        var sel = document.getElementById("serverSelect");
        if (sel) {
            sel.value    = String(session.userId);
            sel.disabled = true;
        }
    }

    // ── Trava QUALQUER serverSelect para user ──────────────────────────
    _lockAllServerSelects(session) {
        var attempts = 0;
        var interval = setInterval(function() {
            var sel = document.getElementById("serverSelect");
            if (sel && sel.options.length > 1) {
                clearInterval(interval);
                sel.value    = String(session.userId);
                sel.disabled = true;
                sel.style.opacity    = "0.7";
                sel.style.cursor     = "not-allowed";
                sel.style.pointerEvents = "none";
            } else if (attempts++ > 20) {
                clearInterval(interval);
            }
        }, 150);
    }

    // ── Oculta botões que não fazem sentido para user ─────────────────
    _hideAdminButtons() {
        var btnTrocar = document.getElementById("btnTrocarServidor");
        if (btnTrocar) btnTrocar.style.display = "none";
    }

}

window.Auth = new AuthManager();

// ─── PÁGINA DE LOGIN ────────────────────────────────────────────────────
var _currentPage = window.location.pathname.split("/").pop().split("?")[0];
if (_currentPage === "login.html") {

    document.addEventListener("DOMContentLoaded", function() {
        // Se já está autenticado com sessão válida, redirecionar para dashboard
        if (Auth.isAuthenticated()) {
            window.location.href = "index.html";
            return;
        }

        // Limpar sessão inválida/expirada
        sessionStorage.removeItem('cequi_session');
        sessionStorage.removeItem('cequi_token');

        var form = document.getElementById("loginForm");
        if (!form) return;

        form.addEventListener("submit", function(e) {
            e.preventDefault();
            var pontoRaw = document.getElementById("ponto").value.trim().toUpperCase();
            var senha = document.getElementById("senha").value;

            // Aceita P_703150, P703150, ou só 703150
            var pontoNum = pontoRaw.replace(/^P_?/i, '').replace(/\D/g, '');
            var ponto = parseInt(pontoNum);

            if (!pontoNum || isNaN(ponto) || ponto < 1) {
                var errEl = document.getElementById("loginError");
                if (errEl) { errEl.textContent = "Informe o ponto no formato P_703150."; errEl.style.display = "flex"; }
                return;
            }
            if (!senha || senha.length < 4) {
                var errEl = document.getElementById("loginError");
                if (errEl) { errEl.textContent = "Senha inválida."; errEl.style.display = "flex"; }
                return;
            }

            var btn = form.querySelector("button[type=submit]");
            btn.disabled = true;

            function handleResult(result) {
                if (result.success) {
                    window.location.href = "index.html";
                } else {
                    btn.textContent = "🔓 Entrar no Sistema";
                    btn.disabled = false;
                    btn.style.background = "";
                    var errEl = document.getElementById("loginError");
                    if (errEl) {
                        errEl.textContent = result.message;
                        errEl.style.display = "flex";
                        setTimeout(function() { errEl.style.display = "none"; }, 4000);
                    }
                }
            }

            // Usar BackendAuth se disponível (backend real), senão usar mock local
            if (window.BackendAuth) {
                window.BackendAuth.login(ponto, senha).then(handleResult).catch(function() {
                    btn.textContent = "🔓 Entrar no Sistema";
                    btn.disabled = false;
                    var errEl = document.getElementById("loginError");
                    if (errEl) { errEl.textContent = "Erro de conexão com o servidor."; errEl.style.display = "flex"; }
                });
            } else {
                var loginResult = Auth.login(ponto, senha);
                var isPromise = loginResult && typeof loginResult.then === 'function';
                if (isPromise) {
                    loginResult.then(handleResult).catch(function() {
                        btn.textContent = "🔓 Entrar no Sistema";
                        btn.disabled = false;
                    });
                } else {
                    handleResult(loginResult);
                }
            }
        });

        window.quickLogin = function(pontoVal, senhaVal) {
            document.getElementById("ponto").value  = pontoVal;
            document.getElementById("senha").value  = senhaVal || "cequi2026";
            form.dispatchEvent(new Event("submit"));
        };
    });

// ─── DEMAIS PÁGINAS ─────────────────────────────────────────────────────
} else {
    document.addEventListener("DOMContentLoaded", function() {
        var session = Auth.getSession();
        console.log('🔍 requireAuth check — página:', window.location.pathname);
        console.log('🔍 session:', session ? JSON.stringify(session) : 'null');
        console.log('🔍 token:', sessionStorage.getItem('cequi_token') ? 'presente' : 'ausente');
        if (!Auth.requireAuth()) return;
        Auth.applyRoleUI();
    });
}
