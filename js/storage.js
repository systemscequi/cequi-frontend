/**
 * CEQUI - Sistema de Persistência
 * Modo mock: dados no localStorage
 * Modo backend: localStorage como cache, banco como fonte de verdade
 */

class DataStorage {
    constructor() {
        this.KEYS = {
            COLABORADORES: 'cequi_colaboradores',
            ATIVIDADES:    'cequi_atividades',
            PRODUTOS:      'produtos_todos',
            FERIADOS:      'cequi_feriados',
            CURRENT_SERVER:'cequi_current_server'
        };
        // Flag: true quando api-client.js já substituiu os métodos MockAPI
        this.backendAtivo = false;
        this.initializeData();
    }

    initializeData() {
        var DATA_VERSION   = '8';
        var storedVersion  = localStorage.getItem('cequi_data_version');

        if (storedVersion !== DATA_VERSION) {
            this.set(this.KEYS.COLABORADORES, MOCK_COLABORADORES);
            this.set(this.KEYS.PRODUTOS,      window.MOCK_PRODUTOS_INICIAIS || []);
            this.set(this.KEYS.FERIADOS,      MOCK_FERIADOS);
            for (var i = 1; i <= 11; i++) {
                localStorage.removeItem('presenca_' + i);
            }
            localStorage.setItem('cequi_data_version', DATA_VERSION);
        } else {
            if (!this.get(this.KEYS.COLABORADORES)) this.set(this.KEYS.COLABORADORES, MOCK_COLABORADORES);
            if (!this.get(this.KEYS.PRODUTOS))      this.set(this.KEYS.PRODUTOS, window.MOCK_PRODUTOS_INICIAIS || []);
            if (!this.get(this.KEYS.FERIADOS))      this.set(this.KEYS.FERIADOS, MOCK_FERIADOS);
        }
        this.set(this.KEYS.ATIVIDADES, MOCK_ATIVIDADES);
    }

    // Chamado pelo api-client.js após substituir os métodos MockAPI
    ativarModoBackend() {
        this.backendAtivo = true;
        console.log('✅ DataStore: modo backend ativado — localStorage usado como cache');
    }

    get(key) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Erro ao ler do storage:', e);
            return null;
        }
    }

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Erro ao salvar no storage:', e);
            return false;
        }
    }

    // ── Cache helpers: atualiza localStorage com dados vindos do banco ──
    cacheColaboradores(lista) { this.set(this.KEYS.COLABORADORES, lista); }
    cacheProdutos(lista)      { this.set(this.KEYS.PRODUTOS, lista); }
    cacheFeriados(lista)      { this.set(this.KEYS.FERIADOS, lista); }
    cachePresenca(sid, mapa)  { this.set('presenca_' + sid, mapa); }

    // ── Colaboradores ────────────────────────────────────────────────────
    getColaboradores()            { return this.get(this.KEYS.COLABORADORES) || []; }
    saveColaboradores(lista)      { return this.set(this.KEYS.COLABORADORES, lista); }
    addColaborador(col) {
        var lista  = this.getColaboradores();
        col.id     = lista.length > 0 ? Math.max(...lista.map(c => c.id)) + 1 : 1;
        lista.push(col);
        return this.saveColaboradores(lista);
    }
    updateColaborador(id, data) {
        var lista = this.getColaboradores();
        var idx   = lista.findIndex(c => c.id === id);
        if (idx !== -1) { lista[idx] = { ...lista[idx], ...data }; return this.saveColaboradores(lista); }
        return false;
    }
    deleteColaborador(id) {
        return this.saveColaboradores(this.getColaboradores().filter(c => c.id !== id));
    }

    // ── Atividades ───────────────────────────────────────────────────────
    getAtividades()        { return this.get(this.KEYS.ATIVIDADES) || {}; }
    saveAtividades(a)      { return this.set(this.KEYS.ATIVIDADES, a); }

    // ── Produtos ─────────────────────────────────────────────────────────
    getProdutos()          { return this.get(this.KEYS.PRODUTOS) || []; }
    saveProdutos(lista)    { return this.set(this.KEYS.PRODUTOS, lista); }
    addProduto(p) {
        var lista = this.getProdutos();
        p.id      = lista.length > 0 ? Math.max(...lista.map(x => x.id)) + 1 : 1;
        p.createdAt = new Date().toISOString();
        lista.push(p);
        return this.saveProdutos(lista);
    }
    updateProduto(id, data) {
        var lista = this.getProdutos();
        var idx   = lista.findIndex(p => p.id === id);
        if (idx !== -1) {
            lista[idx] = { ...lista[idx], ...data, updatedAt: new Date().toISOString() };
            return this.saveProdutos(lista);
        }
        return false;
    }
    deleteProduto(id) {
        return this.saveProdutos(this.getProdutos().filter(p => p.id !== id));
    }

    // ── Feriados ─────────────────────────────────────────────────────────
    getFeriados()          { return this.get(this.KEYS.FERIADOS) || []; }
    saveFeriados(lista)    { return this.set(this.KEYS.FERIADOS, lista); }

    // ── Backup & Restore ─────────────────────────────────────────────────
    exportAllData() {
        return {
            colaboradores: this.getColaboradores(),
            atividades:    this.getAtividades(),
            produtos:      this.getProdutos(),
            feriados:      this.getFeriados(),
            exportDate:    new Date().toISOString(),
            version:       '1.0'
        };
    }
    importAllData(data) {
        try {
            if (data.colaboradores) this.saveColaboradores(data.colaboradores);
            if (data.atividades)    this.saveAtividades(data.atividades);
            if (data.produtos)      this.saveProdutos(data.produtos);
            if (data.feriados)      this.saveFeriados(data.feriados);
            return true;
        } catch (e) { return false; }
    }
    clearAllData() {
        Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
        this.initializeData();
    }
    getStorageSize() {
        var total = 0;
        for (var k in localStorage) {
            if (localStorage.hasOwnProperty(k)) total += localStorage[k].length + k.length;
        }
        return (total / 1024).toFixed(2);
    }
}

window.DataStore = new DataStorage();

// ── MockAPI sobre localStorage (modo sem backend) ─────────────────────
MockAPI.getColaboradores = async function() {
    await this.delay();
    var todos = DataStore.getColaboradores();
    return { success: true, data: todos.filter(c => c.role === 'user') };
};
MockAPI.getProdutos = async function(servidorId) {
    await this.delay();
    var lista = DataStore.getProdutos();
    return { success: true, data: servidorId ? lista.filter(p => p.servidorId === parseInt(servidorId)) : lista };
};
MockAPI.createProduto = async function(data) {
    await this.delay();
    DataStore.addProduto(data);
    return { success: true, data };
};
MockAPI.getAtividades = async function(categoria) {
    await this.delay();
    var atividades = DataStore.getAtividades();
    if (categoria) return { success: true, data: atividades[categoria] || [] };
    return { success: true, data: atividades };
};
MockAPI.getFeriados = async function() {
    await this.delay();
    return { success: true, data: DataStore.getFeriados() };
};

console.log('✅ Sistema de persistência ativado! Tamanho: ' + DataStore.getStorageSize() + ' KB');
