/**
 * CEQUI — API Client
 * Substitui o MockAPI por chamadas HTTP reais ao backend Node.js.
 * Mantém exatamente a mesma interface do MockAPI.
 * Usa localStorage como cache — o banco é a fonte de verdade.
 */

(function () {

    // URL base do backend
    // Desenvolvimento: 'http://localhost:3000/api'
    // Produção: URL do Render
    var BASE_URL = 'https://cequi-backend.onrender.com/api';

    // ── Helpers ──────────────────────────────────────────────────────────
    function getToken() {
        return sessionStorage.getItem('cequi_token') || null;
    }

    function headers() {
        var h = { 'Content-Type': 'application/json' };
        var t = getToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        return h;
    }

    async function req(method, path, body) {
        var opts = { method: method, headers: headers() };
        if (body !== undefined) opts.body = JSON.stringify(body);
        var res  = await fetch(BASE_URL + path, opts);
        var data = await res.json();
        if (res.status === 401) {
            sessionStorage.removeItem('cequi_session');
            sessionStorage.removeItem('cequi_token');
            var inPages = window.location.pathname.includes('/pages/');
            window.location.href = inPages ? '../login.html' : 'login.html';
            return { success: false, message: 'Sessão expirada.' };
        }
        return data;
    }

    // Versão silenciosa — não redireciona em caso de 401 (usada no cache init)
    async function reqSilent(method, path, body) {
        try {
            var opts = { method: method, headers: headers() };
            if (body !== undefined) opts.body = JSON.stringify(body);
            var res  = await fetch(BASE_URL + path, opts);
            if (!res.ok) return { success: false };
            return await res.json();
        } catch (e) {
            return { success: false };
        }
    }

    // ── Login ─────────────────────────────────────────────────────────────
    async function login(ponto, senha) {
        var data = await req('POST', '/colaboradores/login', { ponto: parseInt(ponto), senha: senha });
        if (data.success && data.token) {
            sessionStorage.setItem('cequi_token', data.token);
            var session = {
                userId:    data.usuario.id,
                ponto:     data.usuario.ponto,
                nome:      data.usuario.nome,
                area:      data.usuario.area,
                role:      data.usuario.role,
                loginTime: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
            };
            sessionStorage.setItem('cequi_session', JSON.stringify(session));
        }
        return data;
    }

    // ── Inicialização: popular cache com dados do banco ───────────────────
    async function inicializarCache() {
        var token = getToken();
        if (!token) return;

        try {
            var session = JSON.parse(sessionStorage.getItem('cequi_session') || '{}');
            var isAdmin = session.role === 'admin';

            // Usa reqSilent para não redirecionar em caso de 401
            var colsUrl = isAdmin ? '/colaboradores/todos' : '/colaboradores';
            var cols = await reqSilent('GET', colsUrl);
            if (cols.success) DataStore.cacheColaboradores(cols.data);

            var fers = await reqSilent('GET', '/feriados');
            if (fers.success) DataStore.cacheFeriados(fers.data);

            if (session.userId) {
                var pres = await reqSilent('GET', '/presencas/' + session.userId);
                if (pres.success) DataStore.cachePresenca(session.userId, pres.data);
            }

            console.log('✅ Cache sincronizado com o banco');
        } catch (e) {
            console.warn('⚠️ Falha ao sincronizar cache:', e.message);
        }
    }

    // ── Substituição do MockAPI ───────────────────────────────────────────

    MockAPI.getColaboradores = async function () {
        var data = await req('GET', '/colaboradores');
        if (data.success) DataStore.cacheColaboradores(data.data);
        return data;
    };
    MockAPI.getColaborador = async function (id) {
        return await req('GET', '/colaboradores/' + id);
    };
    MockAPI.createColaborador = async function (data) {
        var result = await req('POST', '/colaboradores', data);
        if (result.success) {
            var cols = DataStore.getColaboradores();
            cols.push(result.data);
            DataStore.cacheColaboradores(cols);
        }
        return result;
    };
    MockAPI.updateColaborador = async function (id, data) {
        var result = await req('PUT', '/colaboradores/' + id, data);
        if (result.success) DataStore.updateColaborador(id, data);
        return result;
    };
    MockAPI.deleteColaborador = async function (id) {
        var result = await req('DELETE', '/colaboradores/' + id);
        if (result.success) DataStore.deleteColaborador(id);
        return result;
    };

    MockAPI.getProdutos = async function (servidorId) {
        var qs   = servidorId ? '?servidorId=' + servidorId : '';
        var data = await req('GET', '/produtos' + qs);
        if (data.success) DataStore.cacheProdutos(data.data);
        return data;
    };
    MockAPI.getProduto = async function (id) {
        return await req('GET', '/produtos/' + id);
    };
    MockAPI.createProduto = async function (data) {
        var result = await req('POST', '/produtos', data);
        if (result.success) {
            var lista = DataStore.getProdutos();
            lista.push(result.data);
            DataStore.cacheProdutos(lista);
        }
        return result;
    };
    MockAPI.updateProduto = async function (id, data) {
        var result = await req('PUT', '/produtos/' + id, data);
        if (result.success) DataStore.updateProduto(id, result.data || data);
        return result;
    };
    MockAPI.deleteProduto = async function (id) {
        var result = await req('DELETE', '/produtos/' + id);
        if (result.success) DataStore.deleteProduto(id);
        return result;
    };

    MockAPI.getAtividades = async function (categoria) {
        var qs   = categoria ? '?categoria=' + categoria : '';
        var data = await req('GET', '/atividades' + qs);
        return data;
    };
    MockAPI.createAtividade = async function (data) {
        return await req('POST', '/atividades', data);
    };
    MockAPI.updateAtividade = async function (id, data) {
        return await req('PUT', '/atividades/' + id, data);
    };
    MockAPI.deleteAtividade = async function (id) {
        return await req('DELETE', '/atividades/' + id);
    };

    MockAPI.getFeriados = async function () {
        var data = await req('GET', '/feriados');
        if (data.success) DataStore.cacheFeriados(data.data);
        return data;
    };

    // ── Presença ──────────────────────────────────────────────────────────
    MockAPI.getPresenca = async function (servidorId) {
        var data = await req('GET', '/presencas/' + servidorId);
        if (data.success) DataStore.cachePresenca(servidorId, data.data);
        return data;
    };
    MockAPI.syncPresenca = async function (servidorId, presencaMap) {
        return await req('PUT', '/presencas/' + servidorId, presencaMap);
    };
    MockAPI.setPresencaDia = async function (servidorId, data, status) {
        var result = await req('PUT', '/presencas/' + servidorId + '/dia', { data: data, status: status });
        // Atualizar cache local imediatamente
        if (result.success) {
            var mapa  = DataStore.get('presenca_' + servidorId) || {};
            var partes = data.split('-'); // YYYY-MM-DD
            var mes   = partes[0] + '-' + partes[1];
            var dia   = partes[2];
            if (!mapa[mes]) mapa[mes] = {};
            mapa[mes][dia] = status;
            DataStore.cachePresenca(servidorId, mapa);
        }
        return result;
    };

    // ── Interceptar salvamento de presença no DataStore ───────────────────
    // Quando controle-presenca.js salvar presença no localStorage,
    // sincroniza automaticamente com o banco
    var _setOriginal = DataStore.set.bind(DataStore);
    DataStore.set = function (key, value) {
        var result = _setOriginal(key, value);
        if (key && key.startsWith('presenca_') && typeof value === 'object') {
            var sid = parseInt(key.replace('presenca_', ''));
            if (sid) {
                MockAPI.syncPresenca(sid, value).catch(function (e) {
                    console.warn('Falha ao sincronizar presença:', e);
                });
            }
        }
        return result;
    };

    // ── Login async no AuthManager ────────────────────────────────────────
    if (typeof AuthManager !== 'undefined') {
        AuthManager.prototype.login = function (ponto, senha) {
            return login(ponto, senha).then(function (data) {
                if (!data.success) {
                    return { success: false, message: data.message || 'Credenciais inválidas.' };
                }
                var u       = data.usuario;
                var session = JSON.parse(sessionStorage.getItem('cequi_session') || '{}');
                if (typeof CurrentServer !== 'undefined') CurrentServer.set(u);
                return { success: true, servidor: u, session: session };
            }).catch(function () {
                return { success: false, message: 'Erro de conexão com o servidor.' };
            });
        };
    }

    // ── Ativar modo backend e popular cache ───────────────────────────────
    if (typeof DataStore !== 'undefined') DataStore.ativarModoBackend();
    // Inicializar cache assim que a página carregar
    document.addEventListener('DOMContentLoaded', function () {
        inicializarCache();
    });

    console.log('✅ API Client ativado — backend: ' + BASE_URL);

})();
