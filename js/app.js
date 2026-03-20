/**
 * CEQUI - Sistema de Controle de Produtividade
 * Arquivo: app.js
 * Descrição: Funções utilitárias e configuração da API
 */

// ========== CONFIGURAÇÃO DA API ==========
const API_CONFIG = {
    baseURL: 'http://localhost:3000/api',
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json'
    }
};

// ========== CLASSE API ==========
class API {
    static async request(endpoint, options = {}) {
        const url = `${API_CONFIG.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...API_CONFIG.headers,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Colaboradores
    static async getColaboradores() {
        return this.request('/colaboradores');
    }

    static async getColaborador(id) {
        return this.request(`/colaboradores/${id}`);
    }

    static async createColaborador(data) {
        return this.request('/colaboradores', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateColaborador(id, data) {
        return this.request(`/colaboradores/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deleteColaborador(id) {
        return this.request(`/colaboradores/${id}`, {
            method: 'DELETE'
        });
    }

    // Atividades Padrão
    static async getAtividades(categoria = null) {
        const endpoint = categoria ? `/atividades?categoria=${categoria}` : '/atividades';
        return this.request(endpoint);
    }

    static async getAtividade(id) {
        return this.request(`/atividades/${id}`);
    }

    static async createAtividade(data) {
        return this.request('/atividades', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateAtividade(id, data) {
        return this.request(`/atividades/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deleteAtividade(id) {
        return this.request(`/atividades/${id}`, {
            method: 'DELETE'
        });
    }

    // Produtos
    static async getProdutos(servidorId = null) {
        const endpoint = servidorId ? `/produtos?servidor=${servidorId}` : '/produtos';
        return this.request(endpoint);
    }

    static async getProduto(id) {
        return this.request(`/produtos/${id}`);
    }

    static async createProduto(data) {
        return this.request('/produtos', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateProduto(id, data) {
        return this.request(`/produtos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deleteProduto(id) {
        return this.request(`/produtos/${id}`, {
            method: 'DELETE'
        });
    }

    // Relatórios
    static async getRelatorio(servidorId, periodo) {
        return this.request(`/relatorios/${servidorId}?periodo=${periodo}`);
    }

    static async getRelatorioEquipe(periodo) {
        return this.request(`/relatorios/equipe?periodo=${periodo}`);
    }
}

// ========== STORAGE LOCAL (MOCK - Substituir por API) ==========
class LocalStorage {
    static get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('LocalStorage get error:', error);
            return null;
        }
    }

    static set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('LocalStorage set error:', error);
            return false;
        }
    }

    static remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('LocalStorage remove error:', error);
            return false;
        }
    }

    static clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('LocalStorage clear error:', error);
            return false;
        }
    }
}

// ========== FUNÇÕES UTILITÁRIAS ==========
const Utils = {
    // Formatar data BR
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('pt-BR');
    },

    // Formatar data ISO
    formatDateISO(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    },

    // Calcular dias úteis
    calcularDiasUteis(dataInicio, dataFim, feriados = []) {
        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        let diasUteis = 0;

        for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
            const diaSemana = d.getDay();
            const dataStr = d.toISOString().split('T')[0];
            
            // Verifica se não é fim de semana e não é feriado
            if (diaSemana !== 0 && diaSemana !== 6 && !feriados.includes(dataStr)) {
                diasUteis++;
            }
        }

        return diasUteis;
    },

    // Calcular pontos
    calcularPontos(peso, complexidade) {
        return peso * complexidade;
    },

    // Validar email
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    // Validar campos obrigatórios
    validateRequired(fields) {
        for (const [key, value] of Object.entries(fields)) {
            if (!value || value.toString().trim() === '') {
                return { valid: false, field: key };
            }
        }
        return { valid: true };
    },

    // Debounce para busca
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Mostrar mensagem de sucesso
    showSuccess(message) {
        if (typeof Notify !== 'undefined') Notify.success(message);
        else alert('✓ ' + message);
    },

    showError(message) {
        if (typeof Notify !== 'undefined') Notify.error(message);
        else alert('✗ ' + message);
    },

    confirm(message, onConfirm, onCancel) {
        Notify.confirm(message, onConfirm, onCancel);
    },

    // Gerar ID único (temporário - backend gerará IDs reais)
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Capitalizar texto
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    // Truncar texto
    truncate(str, length) {
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    }
};

// ========== NAVEGAÇÃO ==========
const Navigation = {
    navigate(page) {
        if (page.startsWith('http')) {
            window.location.href = page;
        } else {
            window.location.href = `pages/${page}.html`;
        }
    },

    goHome() {
        window.location.href = '../index.html';
    },

    reload() {
        window.location.reload();
    },

    back() {
        window.history.back();
    }
};

// ========== GESTÃO DE SERVIDOR ATUAL ==========
const CurrentServer = {
    get() {
        return LocalStorage.get('currentServer') || null;
    },

    set(server) {
        LocalStorage.set('currentServer', server);
    },

    clear() {
        LocalStorage.remove('currentServer');
    },

    getId() {
        const server = this.get();
        return server ? server.id : null;
    },

    getName() {
        const server = this.get();
        return server ? server.nome : null;
    }
};

// ========== VALIDAÇÃO DE FORMULÁRIOS ==========
class FormValidator {
    constructor(formId) {
        this.form = document.getElementById(formId);
        this.errors = {};
    }

    validate() {
        this.errors = {};
        const inputs = this.form.querySelectorAll('[required]');
        
        inputs.forEach(input => {
            if (!input.value || input.value.trim() === '') {
                this.errors[input.name || input.id] = 'Campo obrigatório';
            }
        });

        return Object.keys(this.errors).length === 0;
    }

    showErrors() {
        for (const [field, message] of Object.entries(this.errors)) {
            const input = this.form.querySelector(`[name="${field}"], #${field}`);
            if (input) {
                input.style.borderColor = 'var(--danger)';
                // TODO: Adicionar mensagem de erro visual
            }
        }
    }

    clearErrors() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.style.borderColor = '';
        });
        this.errors = {};
    }

    getValues() {
        const formData = new FormData(this.form);
        const values = {};
        for (const [key, value] of formData.entries()) {
            values[key] = value;
        }
        return values;
    }
}

// ========== RENDERIZADORES ==========
const Renderers = {
    // Renderizar tabela genérica
    renderTable(tableId, data, columns) {
        const tbody = document.getElementById(tableId);
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${columns.length}" class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p>Nenhum registro encontrado</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = data.map(row => `
            <tr>
                ${columns.map(col => `<td>${col.render ? col.render(row) : row[col.field]}</td>`).join('')}
            </tr>
        `).join('');
    },

    // Renderizar opções de select
    renderSelectOptions(selectId, options, labelField, valueField) {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.innerHTML = '<option value="">Selecione...</option>';
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option[valueField];
            opt.textContent = option[labelField];
            select.appendChild(opt);
        });
    }
};

// ========== EXPORTAÇÃO GLOBAL ==========
window.API = API;
window.LocalStorage = LocalStorage;

window.Utils = Utils;

// ─── Resolve status efetivo do produto ───────────────────────────────
// Regra: produto só pode ser finalizado no mesmo mês de criação.
// Se virar o mês sem finalizar → 'nao-concluido'
window.resolverStatus = function(produto) {
    if (!produto) return 'em-andamento';
    if (produto.status === 'finalizado') return 'finalizado';
    if (!produto.dataInicio) return produto.status || 'em-andamento';
    const mesInicio = produto.dataInicio.substring(0, 7); // YYYY-MM
    const mesHoje   = new Date().toISOString().substring(0, 7);
    if (mesHoje > mesInicio) return 'nao-concluido';
    return 'em-andamento';
};

window.STATUS_MAP = {
    'finalizado':    { classe: 'completed',     label: 'Finalizado' },
    'em-andamento':  { classe: 'in-progress',   label: 'Em Andamento' },
    'nao-concluido': { classe: 'nao-concluido', label: 'Não Concluído' }
};

window.statusBadge = function(status) {
    const s = window.STATUS_MAP[status] || { classe: 'in-progress', label: status };
    return '<span class="status-badge ' + s.classe + '">' + s.label + '</span>';
};
window.Navigation = Navigation;
window.CurrentServer = CurrentServer;
window.FormValidator = FormValidator;
window.Renderers = Renderers;

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('CEQUI System initialized');
    
    // Destacar item de navegação ativo
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
        const btnPage = btn.getAttribute('href') || btn.getAttribute('onclick');
        if (btnPage && btnPage.includes(currentPage)) {
            btn.classList.add('active');
        }
    });
});
