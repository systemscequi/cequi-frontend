/**
 * CEQUI — API Client
 * Conecta o sistema ao backend Node.js.
 * Estratégia: expõe window.BackendAuth para o auth.js usar diretamente.
 */

(function () {

    var BASE_URL = 'https://cequi-backend.onrender.com/api';

    function getToken() {
        return sessionStorage.getItem('cequi_token') || null;
    }

    function makeHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var t = getToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        return h;
    }

    async function req(method, path, body) {
        try {
            var opts = { method: method, headers: makeHeaders() };
            if (body !== undefined) opts.body = JSON.stringify(body);
            var res  = await fetch(BASE_URL + path, opts);
            var data = await res.json();
            if (res.status === 401) {
                var pg = window.location.pathname.split('/').pop();
                if (pg !== 'login.html') {
                    sessionStorage.removeItem('cequi_session');
                    sessionStorage.removeItem('cequi_token');
                    var inPages = window.location.pathname.includes('/pages/');
                    window.location.href = inPages ? '../login.html' : 'login.html';
                }
                return { success: false, message: 'Sessão expirada.' };
            }
            return data;
        } catch (e) {
            return { success: false, message: 'Erro de conexão.' };
        }
    }

    async function reqSilent(method, path, body) {
        try {
            var opts = { method: method, headers: makeHeaders() };
            if (body !== undefined) opts.body = JSON.stringify(body);
            var res  = await fetch(BASE_URL + path, opts);
            if (!res.ok) return { success: false };
            return await res.json();
        } catch (e) {
            return { success: false };
        }
    }

    // ── Login exposto globalmente — auth.js vai chamar isso ───────────────
    window.BackendAuth = {
        login: async function(ponto, senha) {
            var data = await reqSilent('POST', '/colaboradores/login', {
                ponto: parseInt(ponto),
                senha: senha
            });

            if (data && data.success && data.token && data.usuario) {
                var u = data.usuario;
                var session = {
                    userId:    u.id,
                    ponto:     u.ponto,
                    nome:      u.nome,
                    area:      u.area,
                    role:      u.role,
                    loginTime: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
                };
                sessionStorage.setItem('cequi_session', JSON.stringify(session));
                sessionStorage.setItem('cequi_token', data.token);
                if (typeof CurrentServer !== 'undefined') CurrentServer.set(u);
                return { success: true, servidor: u, session: session };
            }

            return {
                success: false,
                message: (data && data.message) ? data.message : 'Credenciais inválidas.'
            };
        }
    };

    // ── Cache inicial ─────────────────────────────────────────────────────
    async function inicializarCache() {
        if (!getToken()) return;
        try {
            // Uma única requisição retorna colaboradores + feriados + presença
            var data = await reqSilent('GET', '/init');
            if (data && data.success) {
                if (data.colaboradores) DataStore.cacheColaboradores(data.colaboradores);
                if (data.feriados)      DataStore.cacheFeriados(data.feriados);
                if (data.presenca) {
                    var session = {};
                    try { session = JSON.parse(sessionStorage.getItem('cequi_session') || '{}'); } catch(e) {}
                    if (session.userId) DataStore.cachePresenca(session.userId, data.presenca);
                }
                console.log('✅ Cache sincronizado com o banco');
            }
        } catch (e) {
            console.warn('⚠️ Cache sync falhou:', e.message);
        }
    }

    // ── MockAPI overrides ─────────────────────────────────────────────────
    MockAPI.getColaboradores = async function () {
        var data = await req('GET', '/colaboradores');
        if (data && data.success) DataStore.cacheColaboradores(data.data);
        return data;
    };
    // Para a tela de gestão de colaboradores (admin vê todos)
    MockAPI.getTodosColaboradores = async function () {
        var data = await req('GET', '/colaboradores/todos');
        if (data && data.success) DataStore.cacheColaboradores(data.data);
        return data;
    };
    MockAPI.getColaborador = async function (id) {
        return await req('GET', '/colaboradores/' + id);
    };
    MockAPI.createColaborador = async function (data) {
        var result = await req('POST', '/colaboradores', data);
        if (result && result.success && result.data) {
            var cols = DataStore.getColaboradores();
            cols.push(result.data);
            DataStore.cacheColaboradores(cols);
        }
        return result;
    };
    MockAPI.updateColaborador = async function (id, data) {
        var result = await req('PUT', '/colaboradores/' + id, data);
        if (result && result.success) DataStore.updateColaborador(id, data);
        return result;
    };
    MockAPI.deleteColaborador = async function (id) {
        var result = await req('DELETE', '/colaboradores/' + id);
        if (result && result.success) DataStore.deleteColaborador(id);
        return result;
    };
    MockAPI.getProdutos = async function (servidorId) {
        var qs = servidorId ? '?servidorId=' + servidorId : '';
        var data = await req('GET', '/produtos' + qs);
        if (data && data.success) DataStore.cacheProdutos(data.data);
        return data;
    };
    MockAPI.getProduto = async function (id) {
        return await req('GET', '/produtos/' + id);
    };
    MockAPI.createProduto = async function (data) {
        var result = await req('POST', '/produtos', data);
        if (result && result.success && result.data) {
            var lista = DataStore.getProdutos();
            lista.push(result.data);
            DataStore.cacheProdutos(lista);
        }
        return result;
    };
    MockAPI.updateProduto = async function (id, data) {
        var result = await req('PUT', '/produtos/' + id, data);
        if (result && result.success) DataStore.updateProduto(id, result.data || data);
        return result;
    };
    MockAPI.deleteProduto = async function (id) {
        var result = await req('DELETE', '/produtos/' + id);
        if (result && result.success) DataStore.deleteProduto(id);
        return result;
    };
    MockAPI.getAtividades = async function (categoria) {
        var qs = categoria ? '?categoria=' + categoria : '';
        return await req('GET', '/atividades' + qs);
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
        if (data && data.success) DataStore.cacheFeriados(data.data);
        return data;
    };
    MockAPI.getPresenca = async function (servidorId) {
        var data = await req('GET', '/presencas/' + servidorId);
        if (data && data.success) DataStore.cachePresenca(servidorId, data.data);
        return data;
    };
    MockAPI.syncPresenca = async function (servidorId, presencaMap) {
        return await reqSilent('PUT', '/presencas/' + servidorId, presencaMap);
    };
    MockAPI.setPresencaDia = async function (servidorId, data, status) {
        var result = await req('PUT', '/presencas/' + servidorId + '/dia', { data: data, status: status });
        if (result && result.success) {
            var mapa = DataStore.get('presenca_' + servidorId) || {};
            var partes = data.split('-');
            var mes = partes[0] + '-' + partes[1];
            var dia = partes[2];
            if (!mapa[mes]) mapa[mes] = {};
            mapa[mes][dia] = status;
            DataStore.cachePresenca(servidorId, mapa);
        }
        return result;
    };

    // ── Interceptar presença ──────────────────────────────────────────────
    var _setOriginal = DataStore.set.bind(DataStore);
    DataStore.set = function (key, value) {
        var result = _setOriginal(key, value);
        if (key && key.startsWith('presenca_') && typeof value === 'object') {
            var sid = parseInt(key.replace('presenca_', ''));
            if (sid) reqSilent('PUT', '/presencas/' + sid, value);
        }
        return result;
    };

    if (typeof DataStore !== 'undefined') DataStore.ativarModoBackend();
    document.addEventListener('DOMContentLoaded', inicializarCache);

    console.log('✅ API Client ativado — backend: ' + BASE_URL);

})();
