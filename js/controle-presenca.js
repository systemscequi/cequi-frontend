/**
 * CEQUI - Controle de Presença
 * Gerenciamento de dias trabalhados, ausências e dispensas
 */

let currentDate = new Date();
let servidorAtual = null;
let presencaData = {}; // { "2026-01": { "01": "trabalhado", ... } }
let feriados = [];

// ── Configuração de status ────────────────────────────────────────────────────
const STATUS_CONFIG = {
    trabalhado: { label: 'Trabalhado',          color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.2)', border: 'var(--success)', cssClass: 'trabalhado' },
    ausente:    { label: 'Ausência Justificada', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.2)', border: 'var(--warning)', cssClass: 'ausente' },
    dispensa:   { label: 'Dispensa',             color: '#3B82F6',        bg: 'rgba(59, 130, 246, 0.2)',  border: '#3B82F6',        cssClass: 'dispensa' }
};

// ── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    popularSelectAno();
    sincronizarSelects();

    await loadFeriados();
    await loadServidores(); // carrega servidor, presença e renderiza calendário internamente
});

function popularSelectAno() {
    const select = document.getElementById('selectAno');
    if (!select) return;
    const anoAtual = new Date().getFullYear();
    select.innerHTML = '';
    for (let ano = anoAtual - 5; ano <= anoAtual + 2; ano++) {
        const opt = document.createElement('option');
        opt.value = ano;
        opt.textContent = ano;
        if (ano === anoAtual) opt.selected = true;
        select.appendChild(opt);
    }
}

async function loadServidores() {
    const result = await MockAPI.getTodosColaboradores();
    if (result.success) {
        const select   = document.getElementById('serverSelect');
        const group    = document.getElementById('serverGroup');
        const session  = typeof Auth !== 'undefined' ? Auth.getSession() : null;
        const isAdmin  = session && session.role === 'admin';

        select.innerHTML = '<option value="">Selecione um servidor...</option>';
        result.data.forEach(servidor => {
            const option = document.createElement('option');
            option.value = servidor.id;
            option.textContent = `${servidor.nome} (Ponto ${servidor.ponto})`;
            select.appendChild(option);
        });

        let servidorFinal;

        if (!isAdmin && session) {
            // Usuário comum: ocultar seletor e usar o próprio servidor
            if (group) group.style.display = 'none';
            const uid = parseInt(session.userId);
            // Tentar por id, depois por ponto, depois CurrentServer
            servidorFinal = result.data.find(s => parseInt(s.id) === uid)
                         || result.data.find(s => parseInt(s.ponto) === parseInt(session.ponto));
            // Último fallback: CurrentServer já populado pelo auth.js
            if (!servidorFinal) {
                const saved = CurrentServer.get();
                if (saved) servidorFinal = result.data.find(s => parseInt(s.id) === parseInt(saved.id)) || saved;
            }
        } else {
            // Admin: mostrar seletor
            if (group) group.style.display = '';
            const saved = CurrentServer.get();
            servidorFinal = (saved && result.data.find(s => parseInt(s.id) === parseInt(saved.id))) || result.data[0];
        }

        if (servidorFinal) {
            select.value = servidorFinal.id;
            CurrentServer.set(servidorFinal);
            servidorAtual = servidorFinal.id;
            await loadPresencaData();
            renderCalendar();
            if (typeof carregarRelatorio === 'function') carregarRelatorio();
        }

        select.addEventListener('change', async function () {
            if (this.value) {
                servidorAtual = parseInt(this.value);
                const servidor = result.data.find(s => s.id === servidorAtual);
                CurrentServer.set(servidor);
                await loadPresencaData();
                renderCalendar();
                if (typeof carregarRelatorio === 'function') carregarRelatorio();
            }
        });
    }
}

// ── Cache de feriados por ano ─────────────────────────────────────────────────
const feriadosCache = {};
let feriadosNomes = {}; // { "YYYY-MM-DD": "Nome do Feriado" }

async function loadFeriados() {
    const ano = currentDate.getFullYear();
    await carregarFeriadosAno(ano);
}

async function carregarFeriadosAno(ano) {
    if (feriadosCache[ano]) {
        feriados = feriadosCache[ano].datas;
        feriadosNomes = { ...feriadosNomes, ...feriadosCache[ano].nomes };
        return;
    }

    // Tentar buscar da API pública de feriados nacionais do Brasil
    try {
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (resp.ok) {
            const data = await resp.json();
            const datas = data.map(f => f.date);
            const nomes = {};
            data.forEach(f => { nomes[f.date] = f.name; });
            feriadosCache[ano] = { datas, nomes };
            feriados = datas;
            feriadosNomes = { ...feriadosNomes, ...nomes };
            return;
        }
    } catch (e) {
        console.warn('BrasilAPI indisponível, usando feriados locais.');
    }

    // Fallback: feriados nacionais fixos + móveis calculados
    const { datas, nomes } = calcularFeriadosNacionais(ano);
    feriadosCache[ano] = { datas, nomes };
    feriados = datas;
    feriadosNomes = { ...feriadosNomes, ...nomes };
}

function calcularFeriadosNacionais(ano) {
    // Páscoa (algoritmo de Butcher)
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31);
    const diaPascoa = ((h + l - 7 * m + 114) % 31) + 1;
    const pascoa = new Date(ano, mesPascoa - 1, diaPascoa);

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const add = (base, dias) => { const d = new Date(base); d.setDate(d.getDate() + dias); return d; };

    const lista = [
        { date: `${ano}-01-01`, name: 'Ano Novo' },
        { date: `${ano}-04-21`, name: 'Tiradentes' },
        { date: `${ano}-05-01`, name: 'Dia do Trabalho' },
        { date: `${ano}-09-07`, name: 'Independência do Brasil' },
        { date: `${ano}-10-12`, name: 'Nossa Sra. Aparecida' },
        { date: `${ano}-11-02`, name: 'Finados' },
        { date: `${ano}-11-15`, name: 'Proclamação da República' },
        { date: `${ano}-11-20`, name: 'Consciência Negra' },
        { date: `${ano}-12-25`, name: 'Natal' },
        { date: fmt(add(pascoa, -48)), name: 'Carnaval (Segunda)' },
        { date: fmt(add(pascoa, -47)), name: 'Carnaval (Terça)' },
        { date: fmt(add(pascoa, -2)),  name: 'Sexta-feira Santa' },
        { date: fmt(pascoa),           name: 'Páscoa' },
        { date: fmt(add(pascoa, 60)),  name: 'Corpus Christi' },
    ];

    const datas = lista.map(f => f.date);
    const nomes = {};
    lista.forEach(f => { nomes[f.date] = f.name; });
    return { datas, nomes };
}


async function loadPresencaData() {
    if (!servidorAtual) return;
    const key = `presenca_${servidorAtual}`;

    // Se backend ativo, busca do banco e atualiza cache
    if (DataStore.backendAtivo && typeof MockAPI.getPresenca === 'function') {
        try {
            const result = await MockAPI.getPresenca(servidorAtual);
            if (result.success) {
                presencaData = result.data || {};
                DataStore.cachePresenca(servidorAtual, presencaData);
                return;
            }
        } catch (e) {
            console.warn('Falha ao carregar presença do banco, usando cache local:', e);
        }
    }

    // Fallback: lê do localStorage
    const data = DataStore.get(key);
    presencaData = data || {};
}

async function savePresencaData() {
    if (!servidorAtual) return;
    const key = `presenca_${servidorAtual}`;
    DataStore.set(key, presencaData);
}

// ── Helpers de chave ──────────────────────────────────────────────────────────
function getMesKey() {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getDiaKey(dia) {
    return String(dia).padStart(2, '0');
}

function getStatus(dia) {
    const mesKey = getMesKey();
    const diaKey = getDiaKey(dia);
    if (!presencaData[mesKey]) return null;
    return presencaData[mesKey][diaKey] || null;
}

function setStatus(dia, status) {
    const mesKey = getMesKey();
    const diaKey = getDiaKey(dia);
    if (!presencaData[mesKey]) presencaData[mesKey] = {};
    if (status === null) {
        delete presencaData[mesKey][diaKey];
    } else {
        presencaData[mesKey][diaKey] = status;
    }
    savePresencaData();
}

// ── Renderização do calendário ────────────────────────────────────────────────
function renderCalendar() {
    if (!servidorAtual) {
        document.getElementById('calendar').innerHTML =
            '<p style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 2rem;">Selecione um servidor para visualizar o calendário.</p>';
        calcularResumo();
        return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    sincronizarSelects();

    const primeiroDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay();

    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';

    // Headers
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(d => {
        const h = document.createElement('div');
        h.className = 'calendar-header';
        h.textContent = d;
        calendar.appendChild(h);
    });

    // Espaços vazios
    for (let i = 0; i < diaSemanaInicio; i++) {
        calendar.appendChild(document.createElement('div'));
    }

    const hoje = new Date();
    const ehMesAtual = hoje.getFullYear() === year && hoje.getMonth() === month;

    for (let dia = 1; dia <= diasNoMes; dia++) {
        const data = new Date(year, month, dia);
        const diaSemana = data.getDay();
        const dataStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const ehFeriado = feriados.includes(dataStr);
        const ehFimSemana = diaSemana === 0 || diaSemana === 6;
        const ehHoje = ehMesAtual && dia === hoje.getDate();
        const status = getStatus(dia);
        const cfg = status ? STATUS_CONFIG[status] : null;

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        if (ehHoje) dayDiv.classList.add('hoje');
        if (ehFimSemana) dayDiv.classList.add('fim-semana');
        if (ehFeriado && !status) dayDiv.classList.add('feriado');
        if (cfg) dayDiv.classList.add(cfg.cssClass);

        const nomeFeriado = ehFeriado ? (feriadosNomes[dataStr] || 'Feriado Nacional') : null;
        if (nomeFeriado) {
            dayDiv.setAttribute('data-feriado', nomeFeriado);
            dayDiv.classList.add('has-tooltip');
        }

        dayDiv.innerHTML = `
            <div class="day-number">${dia}</div>
            <div class="day-status">${getStatusIcon(status, ehFeriado, ehFimSemana)}</div>
        `;

        if (!ehFimSemana) {
            dayDiv.onclick = () => abrirModalStatus(dia, ehFeriado);
        }

        calendar.appendChild(dayDiv);
    }

    calcularResumo();
}

function getStatusIcon(status, ehFeriado, ehFimSemana) {
    return '';
}

// ── Modal de seleção de status ────────────────────────────────────────────────
function abrirModalStatus(dia, ehFeriado) {
    if (!servidorAtual) {
        Notify.warning('Selecione um servidor primeiro!');
        return;
    }

    const currentStatus = getStatus(dia);
    const mesKey = getMesKey();

    const overlay = document.createElement('div');
    overlay.className = 'presenca-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
    `;

    const optionsHTML = Object.entries(STATUS_CONFIG).map(([key, cfg]) => `
        <button onclick="selecionarStatus(${dia}, '${key}')" style="
            padding: 0.85rem 1rem;
            background: ${currentStatus === key ? cfg.bg : 'var(--bg-dark)'};
            border: 2px solid ${cfg.border};
            color: var(--text-primary);
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.9rem;
            text-align: left;
            transition: background 0.2s ease;
            ${currentStatus === key ? 'box-shadow: 0 0 0 2px ' + cfg.color + ';' : ''}
        "
        onmouseover="this.style.background='${cfg.bg}'"
        onmouseout="this.style.background='${currentStatus === key ? cfg.bg : 'var(--bg-dark)'}'">
            ${cfg.label}
        </button>
    `).join('');

    overlay.innerHTML = `
        <div style="
            background: var(--bg-mid); border: 1px solid var(--border);
            border-radius: 12px; padding: 2rem; width: 100%; max-width: 380px;
            animation: scaleIn 0.2s ease;
        ">
            <h3 style="color: var(--text-primary); margin-bottom: 0.25rem; text-align: center; font-size: 1.1rem;">
                Dia ${dia} — ${mesKey}
            </h3>
            <p style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-bottom: 1.5rem;">
                ${ehFeriado ? 'Feriado registrado' : 'Selecione o status do dia'}
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                ${optionsHTML}
                <button onclick="selecionarStatus(${dia}, null)" style="
                    padding: 0.85rem 1rem;
                    background: var(--bg-dark);
                    border: 2px solid var(--border);
                    color: var(--text-muted);
                    border-radius: 8px; cursor: pointer;
                    font-weight: 600; font-size: 0.9rem; text-align: left;
                    transition: background 0.2s ease;
                "
                onmouseover="this.style.background='var(--bg-light)'"
                onmouseout="this.style.background='var(--bg-dark)'">
                    Limpar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    window.selecionarStatus = (dia, status) => {
        setStatus(dia, status);
        renderCalendar();
        overlay.remove();
        delete window.selecionarStatus;
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            delete window.selecionarStatus;
        }
    };
}

// ── Resumo do mês ─────────────────────────────────────────────────────────────
function calcularResumo() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const ultimoDia = new Date(year, month + 1, 0).getDate();

    let diasUteis = 0;
    const contagem = {};
    Object.keys(STATUS_CONFIG).forEach(k => contagem[k] = 0);

    for (let dia = 1; dia <= ultimoDia; dia++) {
        const data = new Date(year, month, dia);
        const diaSemana = data.getDay();
        const dataStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const ehFeriado = feriados.includes(dataStr);
        const ehFimSemana = diaSemana === 0 || diaSemana === 6;

        if (!ehFimSemana && !ehFeriado) diasUteis++;

        const status = getStatus(dia);
        if (status && contagem[status] !== undefined) contagem[status]++;
    }

    document.getElementById('diasUteisMes').textContent = diasUteis;
    document.getElementById('diasTrabalhados').textContent = contagem.trabalhado;
    document.getElementById('ausenciasJustificadas').textContent = contagem.ausente;
    document.getElementById('dispensas').textContent = contagem.dispensa;
}

// ── Renderização do calendário ────────────────────────────────────────────────
function sincronizarSelects() {
    const selectMes = document.getElementById('selectMes');
    const selectAno = document.getElementById('selectAno');
    if (selectMes) selectMes.value = currentDate.getMonth();
    if (selectAno) selectAno.value = currentDate.getFullYear();
}

async function mudarPorSelect() {
    const mes = parseInt(document.getElementById('selectMes').value);
    const ano = parseInt(document.getElementById('selectAno').value);
    currentDate.setFullYear(ano);
    currentDate.setMonth(mes);
    await carregarFeriadosAno(ano);
    renderCalendar();
}

// ── Navegação e ações ─────────────────────────────────────────────────────────
function marcarMesTodo() {
    if (!servidorAtual) {
        Notify.warning('Selecione um servidor primeiro!');
        return;
    }
    Notify.confirm(
        'Registrar todos os dias úteis do mês como trabalhados?',
        () => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const ultimoDia = new Date(year, month + 1, 0).getDate();

            for (let dia = 1; dia <= ultimoDia; dia++) {
                const data = new Date(year, month, dia);
                const diaSemana = data.getDay();
                const dataStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                const ehFeriado = feriados.includes(dataStr);
                const ehFimSemana = diaSemana === 0 || diaSemana === 6;
                if (!ehFimSemana && !ehFeriado) setStatus(dia, 'trabalhado');
            }

            renderCalendar();
            Notify.success('Mês registrado com sucesso!');
        }
    );
}

// ── Salvar dados (backup JSON) ────────────────────────────────────────────────
function salvarDados() {
    if (!servidorAtual) {
        Notify.warning('Selecione um servidor primeiro!');
        return;
    }

    const key = `presenca_${servidorAtual}`;
    const dados = DataStore.get(key) || {};

    if (Object.keys(dados).length === 0) {
        Notify.warning('Nenhum dado de presença registrado para exportar.');
        return;
    }

    const colaboradores = DataStore.getColaboradores();
    const servidor = colaboradores.find(c => c.id === servidorAtual);
    const nomeArquivo = `presenca_${servidor ? servidor.nome.replace(/\s+/g, '_') : servidorAtual}_${new Date().toISOString().split('T')[0]}`;

    Exporter.exportJSON({ servidor: servidor || { id: servidorAtual }, presenca: dados, exportDate: new Date().toISOString() }, nomeArquivo);
    Notify.success('Dados de presença exportados com sucesso!');
}

// ── Limpar mês ────────────────────────────────────────────────────────────────
function limparMesTodo() {
    if (!servidorAtual) {
        Notify.warning('Selecione um servidor primeiro!');
        return;
    }
    const mesKey = getMesKey();
    Notify.confirm(
        `Limpar todos os registros de ${mesKey}? Esta ação não pode ser desfeita.`,
        () => {
            if (presencaData[mesKey]) {
                delete presencaData[mesKey];
                savePresencaData();
            }
            renderCalendar();
            Notify.success('Registros do mês limpos com sucesso!');
        }
    );
}

// ── Aplicar range de ausência ─────────────────────────────────────────────────
function aplicarRange() {
    if (!servidorAtual) {
        Notify.warning('Selecione um servidor primeiro!');
        return;
    }

    const inicioStr = document.getElementById('rangeInicio').value;
    const fimStr    = document.getElementById('rangeFim').value;
    const tipo      = document.getElementById('rangeTipo').value;

    if (!inicioStr || !fimStr) {
        Notify.warning('Preencha as datas de início e fim do período.');
        return;
    }

    const inicio = new Date(inicioStr + 'T12:00:00');
    const fim    = new Date(fimStr    + 'T12:00:00');

    if (inicio > fim) {
        Notify.warning('A data de início deve ser anterior ou igual à data fim.');
        return;
    }

    const tipoLabel = { ausente: 'Ausência Justificada', dispensa: 'Dispensa', trabalhado: 'Trabalhado' }[tipo];
    const diasRange = Math.round((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;

    Notify.confirm(
        `Aplicar "${tipoLabel}" em ${diasRange} dia(s) de ${inicioStr} até ${fimStr}? Fins de semana e feriados serão ignorados.`,
        () => {
            let aplicados = 0;
            const cur = new Date(inicio);

            while (cur <= fim) {
                const ano    = cur.getFullYear();
                const mes    = String(cur.getMonth() + 1).padStart(2, '0');
                const dia    = cur.getDate();
                const diaKey = getDiaKey(dia);
                const mesKey = `${ano}-${mes}`;
                const dataStr = `${ano}-${mes}-${diaKey}`;
                const diaSemana  = cur.getDay();
                const ehFimSemana = diaSemana === 0 || diaSemana === 6;
                const ehFeriado   = feriados.includes(dataStr);

                if (!ehFimSemana && !ehFeriado) {
                    if (!presencaData[mesKey]) presencaData[mesKey] = {};
                    presencaData[mesKey][diaKey] = tipo;
                    aplicados++;
                }

                cur.setDate(cur.getDate() + 1);
            }

            savePresencaData();
            renderCalendar();

            // Limpar campos
            document.getElementById('rangeInicio').value = '';
            document.getElementById('rangeFim').value    = '';

            Notify.success(`${tipoLabel} aplicada em ${aplicados} dia(s) úteis!`);
        }
    );
}

// ── API pública ───────────────────────────────────────────────────────────────
window.PresencaManager = {
    getDiasTrabalhados: function (servidorId, mesAno) {
        const key = `presenca_${servidorId}`;
        const data = DataStore.get(key) || {};
        const mesDados = data[mesAno] || {};
        return Object.values(mesDados).filter(v => v === 'trabalhado').length;
    },

    calcularDiasUteis: function (mesAno) {
        const [year, month] = mesAno.split('-');
        const ultimoDia = new Date(parseInt(year), parseInt(month), 0).getDate();
        let diasUteis = 0;
        for (let dia = 1; dia <= ultimoDia; dia++) {
            const data = new Date(parseInt(year), parseInt(month) - 1, dia);
            const diaSemana = data.getDay();
            const dataStr = `${year}-${month}-${String(dia).padStart(2, '0')}`;
            const ehFeriado = feriados.includes(dataStr);
            if (diaSemana !== 0 && diaSemana !== 6 && !ehFeriado) diasUteis++;
        }
        return diasUteis;
    }
};
