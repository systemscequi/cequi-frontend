/**
 * CEQUI - Relatórios
 * Individual e Equipe — KPIs alinhados com dashboard.js e equipe.js
 */

let colaboradores   = [];
let produtosData    = [];
let feriadosCache   = [];
let relatorioGerado = false;

document.addEventListener('DOMContentLoaded', async () => {
    await loadServidores();
    setupEventListeners();
    setDefaultDates();
});

// ─── Carregar servidores ────────────────────────────────────────────────
async function loadServidores() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'admin';

    const r = isAdmin
        ? await MockAPI.getTodosColaboradores()
        : await MockAPI.getColaboradores();
    if (!r || !r.success) return;
    colaboradores = r.data;

    const sel = document.getElementById('servidorSelect');
    sel.innerHTML = '<option value="">Selecione...</option>';
    colaboradores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nome + ' (P' + s.ponto + ')';
        sel.appendChild(opt);
    });

    if (!isAdmin && session) {
        const proprio = colaboradores.find(s => parseInt(s.id) === parseInt(session.userId));
        if (proprio) sel.value = proprio.id;
        // Usuário comum: só relatório individual
        const tipoEl = document.getElementById('tipoRelatorio');
        if (tipoEl) { tipoEl.value = 'individual'; tipoEl.closest('.form-group').style.display = 'none'; }
        document.getElementById('servidorGroup').style.display = 'block';
    } else {
        const saved = CurrentServer.get();
        const pre   = saved && colaboradores.find(s => parseInt(s.id) === parseInt(saved.id));
        sel.value   = (pre || colaboradores[0] || {}).id || '';
    }
}

// ─── Datas padrão ──────────────────────────────────────────────────────
function setDefaultDates() {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = String(hoje.getMonth() + 1).padStart(2, '0');
    const last = new Date(y, hoje.getMonth() + 1, 0).getDate();
    document.getElementById('dataInicio').value = `${y}-${m}-01`;
    document.getElementById('dataFim').value    = `${y}-${m}-${String(last).padStart(2,'0')}`;
}

function setupEventListeners() {
    document.getElementById('tipoRelatorio').addEventListener('change', function() {
        document.getElementById('servidorGroup').style.display =
            this.value === 'individual' ? 'block' : 'none';
    });
}

// ─── Presença ──────────────────────────────────────────────────────────
function getPresenca(servidorId) {
    return DataStore.get('presenca_' + servidorId) || {};
}

function calcDiasUteis(ini, fim, feriados) {
    const ferSet = {};
    (feriados || []).forEach(f => { ferSet[f.data] = true; });
    let count = 0;
    const cur = new Date(ini + 'T12:00:00');
    const end = new Date(fim + 'T12:00:00');
    while (cur <= end) {
        const dow = cur.getDay();
        const iso = cur.toISOString().slice(0, 10);
        if (dow !== 0 && dow !== 6 && !ferSet[iso]) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

// Retorna { trabalhados, ausentes, dispensas }
function calcPresencaPeriodo(servidorId, ini, fim) {
    const presData = getPresenca(servidorId);
    let trabalhados = 0, ausentes = 0, dispensas = 0;
    const cur = new Date(ini + 'T12:00:00');
    const end = new Date(fim + 'T12:00:00');
    while (cur <= end) {
        if (cur.getDay() !== 0 && cur.getDay() !== 6) {
            const mes = cur.toISOString().slice(0, 7);
            const dia = String(cur.getDate()).padStart(2, '0');
            const st  = (presData[mes] || {})[dia];
            if (st === 'trabalhado') trabalhados++;
            else if (st === 'ausente')   ausentes++;
            else if (st === 'dispensa')  dispensas++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return { trabalhados, ausentes, dispensas };
}

// Dias trabalhados num único mês YYYY-MM (usa PresencaManager se disponível)
function getDiasTrabMes(servidorId, mesAno) {
    if (window.PresencaManager) return window.PresencaManager.getDiasTrabalhados(servidorId, mesAno);
    const presData = getPresenca(servidorId);
    return Object.values((presData[mesAno] || {})).filter(v => v === 'trabalhado').length;
}

function ptsProduto(p) {
    return (p.atividades || []).reduce((s, a) => s + (a.pontos || 0), 0);
}

function fmtDate(d) {
    if (!d) return 'Em andamento';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function durDias(p) {
    if (!p.dataInicio || !p.dataFim) return null;
    return Math.max(1, Math.round(
        (new Date(p.dataFim + 'T00:00:00') - new Date(p.dataInicio + 'T00:00:00')) / 86400000
    ) + 1);
}

// ─── MRC: Σpts finalizados equipe / Σdias trab equipe num período ──────
// Exclui area CEQUI (igual equipe.js e dashboard.js)
function calcMRC(todosColabs, todosProdutos, ini, fim) {
    const oper = todosColabs.filter(c => c.area !== 'CEQUI');
    let mrcPts = 0, mrcDias = 0;
    oper.forEach(col => {
        const prods = todosProdutos.filter(p =>
            parseInt(p.servidorId) === parseInt(col.id) &&
            resolverStatus(p) === 'finalizado' &&
            p.dataInicio && p.dataInicio >= ini && p.dataInicio <= fim
        );
        prods.forEach(p => (p.atividades || []).forEach(a => { mrcPts += a.pontos || 0; }));
        // Usar presença por período
        mrcDias += calcPresencaPeriodo(col.id, ini, fim).trabalhados;
    });
    return mrcDias > 0 ? mrcPts / mrcDias : 0;
}

// ─── Gerar Relatório ───────────────────────────────────────────────────
async function gerarRelatorio() {
    const tipo       = document.getElementById('tipoRelatorio').value;
    const servidorId = parseInt(document.getElementById('servidorSelect').value);
    const dataIni    = document.getElementById('dataInicio').value;
    const dataFim    = document.getElementById('dataFim').value;

    if (!dataIni || !dataFim) { Notify.error('Selecione o período'); return; }
    if (dataIni > dataFim)    { Notify.error('Data inicial deve ser antes da data final'); return; }
    if (tipo === 'individual' && !servidorId) { Notify.error('Selecione um servidor'); return; }

    Notify.info('Buscando dados...');

    // Buscar feriados, presença e produtos em paralelo
    if (tipo === 'individual') {
        // Individual: feriados + presença + produtos ao mesmo tempo
        const [ferR, pR, prodR] = await Promise.all([
            MockAPI.getFeriados(),
            MockAPI.getPresenca(servidorId),
            MockAPI.getProdutos(servidorId)
        ]);
        feriadosCache = ferR.success ? ferR.data : [];
        if (pR && pR.success) DataStore.cachePresenca(servidorId, pR.data);
        if (!prodR.success) { Notify.error('Erro ao carregar dados'); return; }
        produtosData = prodR.data.filter(p => p.dataInicio && p.dataInicio >= dataIni && p.dataInicio <= dataFim);

        document.getElementById('relatorioContent').style.display = 'block';

        // MRC: buscar todos produtos em paralelo com o que já temos
        const todosR = await MockAPI.getProdutos();
        const todosProd = todosR.success ? todosR.data : produtosData;
        const mrc = calcMRC(colaboradores, todosProd, dataIni, dataFim);
        renderIndividual(servidorId, produtosData, dataIni, dataFim, mrc);

    } else {
        // Equipe: feriados + presença de todos + produtos em paralelo
        const presPromises = colaboradores.map(col => MockAPI.getPresenca(col.id));
        const [ferR, prodR, ...presResults] = await Promise.all([
            MockAPI.getFeriados(),
            MockAPI.getProdutos(),
            ...presPromises
        ]);
        feriadosCache = ferR.success ? ferR.data : [];
        presResults.forEach((pR, i) => {
            if (pR && pR.success) DataStore.cachePresenca(colaboradores[i].id, pR.data);
        });
        if (!prodR.success) { Notify.error('Erro ao carregar dados'); return; }
        produtosData = prodR.data.filter(p => p.dataInicio && p.dataInicio >= dataIni && p.dataInicio <= dataFim);

        document.getElementById('relatorioContent').style.display = 'block';
        renderEquipe(produtosData, dataIni, dataFim);
    }


    relatorioGerado = true;
    document.getElementById('relatorioContent').scrollIntoView({ behavior: 'smooth' });
    Notify.success('Relatório gerado!');
}

// ─── CARD KPI simples ──────────────────────────────────────────────────
function cardKpi(label, valor, cor, sub) {
    return '<div style="background:var(--bg-dark);padding:1rem;border-radius:8px;text-align:center;">' +
        '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">' + label + '</div>' +
        '<div style="font-size:1.9rem;font-weight:700;color:' + cor + ';font-family:var(--code-font);">' + valor + '</div>' +
        (sub ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.2rem;">' + sub + '</div>' : '') +
    '</div>';
}

function cardKpiBig(label, valor, cor, sub, borderColor) {
    borderColor = borderColor || cor;
    return '<div style="background:transparent;border:2px solid ' + borderColor + ';border-radius:10px;padding:1.25rem;text-align:center;">' +
        '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">' + label + '</div>' +
        '<div style="font-size:2.2rem;font-weight:700;color:' + cor + ';font-family:var(--code-font);">' + valor + '</div>' +
        (sub ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem;">' + sub + '</div>' : '') +
    '</div>';
}

function toggleRow(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

// ─── RELATÓRIO INDIVIDUAL ──────────────────────────────────────────────
function renderIndividual(servidorId, produtos, dataIni, dataFim, mrc) {
    const servidor  = colaboradores.find(c => parseInt(c.id) === parseInt(servidorId)) || null;
    const benchmark = servidor ? ((window.BENCHMARK_AREA || {})[servidor.area] || 8) : 8;
    const mri       = +(mrc * 0.8).toFixed(2);

    const diasUteis = calcDiasUteis(dataIni, dataFim, feriadosCache);
    const pres      = calcPresencaPeriodo(servidorId, dataIni, dataFim);
    const diasTrab  = pres.trabalhados;
    const taxa      = diasUteis > 0 ? ((diasTrab / diasUteis) * 100).toFixed(0) + '%' : '0%';
    const ptsEsperados = (diasTrab * benchmark).toFixed(1);

    const finalizados   = produtos.filter(p => resolverStatus(p) === 'finalizado');
    const emAndamento   = produtos.filter(p => resolverStatus(p) === 'em-andamento');
    const naoConcluidos = produtos.filter(p => resolverStatus(p) === 'nao-concluido');

    const ptsFinalizados = finalizados.reduce((s, p) => s + ptsProduto(p), 0);
    const ptsTotal       = produtos.reduce((s, p) => s + ptsProduto(p), 0);
    const prodMedia      = diasTrab > 0 ? (ptsFinalizados / diasTrab).toFixed(2) : '0.00';
    const prodEsperada   = diasTrab > 0 ? (ptsTotal / diasTrab).toFixed(2) : '0.00';

    const percBench = benchmark > 0 ? ((parseFloat(prodMedia) / benchmark) * 100).toFixed(0) : 0;
    const corBench  = parseFloat(prodMedia) >= benchmark ? 'var(--success)'
                    : parseFloat(prodMedia) >= benchmark * 0.8 ? 'var(--warning)' : 'var(--danger)';

    // Duração média
    const duracoes = finalizados.filter(p => p.dataInicio && p.dataFim).map(p => durDias(p));
    const durMedia = duracoes.length > 0
        ? (duracoes.reduce((s, d) => s + d, 0) / duracoes.length).toFixed(1) : '—';

    // Linhas da tabela de produtos
    let linhasProdutos = '';
    let totalAtivs = 0;
    for (const p of produtos) {
        const pts   = ptsProduto(p);
        const nAtiv = (p.atividades || []).length;
        totalAtivs += nAtiv;
        const dur   = durDias(p);
        const st    = resolverStatus(p);
        const stMap = { finalizado: 'completed', 'em-andamento': 'in-progress', 'nao-concluido': 'nao-concluido' };
        const lbMap = { finalizado: 'Finalizado', 'em-andamento': 'Em Andamento', 'nao-concluido': 'Não Concluído' };
        const corPts = st === 'finalizado' ? 'var(--success)' : 'var(--warning)';

        let linhasAtiv = '';
        for (const a of (p.atividades || [])) {
            linhasAtiv +=
                '<tr style="border-top:1px solid var(--border);">' +
                '<td style="padding:0.3rem 0.5rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.78rem;">' + a.codigo + '</td>' +
                '<td style="padding:0.3rem 0.5rem;font-size:0.78rem;">' + (a.atividade || '').substring(0, 65) + (a.atividade && a.atividade.length > 65 ? '...' : '') + '</td>' +
                '<td style="padding:0.3rem 0.5rem;font-size:0.75rem;color:var(--text-muted);">' + (a.areaAtividade || a.categoria || '') + '</td>' +
                '<td style="padding:0.3rem 0.5rem;text-align:center;font-size:0.78rem;">' + a.peso + '</td>' +
                '<td style="padding:0.3rem 0.5rem;text-align:center;font-size:0.78rem;">' + a.complexidade + '</td>' +
                '<td style="padding:0.3rem 0.5rem;text-align:right;font-family:var(--code-font);color:var(--success);font-weight:700;">' + (a.pontos || 0) + '</td>' +
                '</tr>';
        }

        linhasProdutos +=
            '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="toggleRow(\'sub_' + p.id + '\')">' +
            '<td style="padding:0.7rem 0.75rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.85rem;">' + p.codigo + '</td>' +
            '<td style="padding:0.7rem 0.75rem;font-size:0.85rem;">' + p.nome + '</td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;">' + fmtDate(p.dataInicio) + '</td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;">' + fmtDate(p.dataFim) + '</td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;color:var(--text-muted);font-family:var(--code-font);">' + (dur ? dur + ' d' : '—') + '</td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:center;">' + nAtiv + '</td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:center;"><span class="status-badge ' + (stMap[st] || 'in-progress') + '">' + (lbMap[st] || st) + '</span></td>' +
            '<td style="padding:0.7rem 0.75rem;text-align:right;font-family:var(--code-font);font-weight:700;color:' + corPts + ';">' + pts.toFixed(1) + '</td>' +
            '</tr>';

        if (linhasAtiv) {
            linhasProdutos +=
                '<tr id="sub_' + p.id + '" style="display:none;background:var(--bg-dark);">' +
                '<td colspan="8" style="padding:0.5rem 1.5rem;">' +
                '<table style="width:100%;"><thead><tr style="color:var(--text-muted);">' +
                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Código</th>' +
                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Atividade</th>' +
                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Área</th>' +
                '<th style="padding:0.3rem 0.5rem;text-align:center;font-size:0.75rem;">Peso</th>' +
                '<th style="padding:0.3rem 0.5rem;text-align:center;font-size:0.75rem;">Cx.</th>' +
                '<th style="padding:0.3rem 0.5rem;text-align:right;font-size:0.75rem;">Pts</th>' +
                '</tr></thead><tbody>' + linhasAtiv + '</tbody></table>' +
                '</td></tr>';
        }
    }

    const html =
        // Cabeçalho
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">' +
            '<div style="background:var(--bg-dark);padding:1.25rem;border-radius:8px;border-left:4px solid var(--primary);">' +
                '<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.2rem;">Servidor</div>' +
                '<div style="font-size:1.1rem;font-weight:700;">' + (servidor ? servidor.nome : '—') + '</div>' +
                '<div style="font-size:0.82rem;color:var(--text-secondary);">Ponto ' + (servidor ? servidor.ponto : '—') + ' · ' + (servidor ? servidor.area : '—') + '</div>' +
            '</div>' +
            '<div style="background:var(--bg-dark);padding:1.25rem;border-radius:8px;border-left:4px solid var(--secondary);">' +
                '<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.2rem;">Período de Apuração</div>' +
                '<div style="font-size:1rem;font-weight:600;">' + fmtDate(dataIni) + ' → ' + fmtDate(dataFim) + '</div>' +
                '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem;">' + diasUteis + ' dias úteis</div>' +
            '</div>' +
        '</div>' +

        // KPIs de presença (6 cards — igual dashboard)
        '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0.6rem;margin-bottom:1.25rem;">' +
            cardKpi('Dias Úteis',       diasUteis,       'var(--text-primary)') +
            cardKpi('Dias Trabalhados', diasTrab,        'var(--accent)') +
            cardKpi('Taxa Presença',    taxa,            'var(--success)') +
            cardKpi('Pts Esperados',    ptsEsperados,    'var(--primary-light)', 'dias × ' + benchmark + ' pts') +
            cardKpi('Ausências',        pres.ausentes,   'var(--warning)') +
            cardKpi('Dispensas',        pres.dispensas,  '#3B82F6') +
        '</div>' +

        // KPIs de produtividade (6 cards — igual dashboard)
        '<div style="display:grid;grid-template-columns:repeat(3,1fr) repeat(3,1fr);gap:0.75rem;margin-bottom:1.5rem;">' +
            cardKpiBig('Pontos Finalizados',         ptsFinalizados.toFixed(1),  'var(--success)',         finalizados.length + ' produto(s)',        'var(--success)') +
            cardKpiBig('Prod. Média Diária',         prodMedia,                  'var(--accent)',           percBench + '% da meta (' + benchmark + ' pts/dia)', corBench) +
            cardKpiBig('Prod. Esperada',             prodEsperada,               'var(--secondary-light)', 'pts totais / dias trabalhados',           'var(--secondary)') +
            cardKpiBig('MRI',                        mri > 0 ? mri.toFixed(2) : '—', '#818cf8',            'MRC × 0,8 · meta mínima',                 '#818cf8') +
            cardKpiBig('Pontuação Total',            ptsTotal.toFixed(1),        'var(--warning)',         'todos os produtos',                       'var(--secondary)') +
            '<div style="background:transparent;border:2px solid var(--border);border-radius:10px;padding:1.25rem;text-align:center;">' +
                '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.4rem;">Produtos</div>' +
                '<div style="display:flex;flex-direction:column;gap:0.25rem;">' +
                    '<div style="display:flex;justify-content:space-between;"><span style="font-size:0.72rem;color:var(--warning);">Em Andamento</span><span style="font-weight:700;color:var(--warning);font-family:var(--code-font);">' + emAndamento.length + '</span></div>' +
                    '<div style="display:flex;justify-content:space-between;"><span style="font-size:0.72rem;color:var(--success);">Finalizados</span><span style="font-weight:700;color:var(--success);font-family:var(--code-font);">' + finalizados.length + '</span></div>' +
                    '<div style="display:flex;justify-content:space-between;"><span style="font-size:0.72rem;color:#818cf8;">Não Concluídos</span><span style="font-weight:700;color:#818cf8;font-family:var(--code-font);">' + naoConcluidos.length + '</span></div>' +
                    '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:0.25rem;margin-top:0.1rem;"><span style="font-size:0.72rem;color:var(--text-muted);">Dur. Média</span><span style="font-weight:700;color:var(--text-secondary);font-family:var(--code-font);">' + (durMedia !== '—' ? durMedia + ' d' : '—') + '</span></div>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // Tabela
        '<h4 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;padding-bottom:0.4rem;border-bottom:2px solid var(--border);">Produtos do Período</h4>' +
        '<p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;">Clique em um produto para expandir as atividades</p>' +
        '<div style="overflow-x:auto;">' +
        '<table style="width:100%;min-width:780px;">' +
        '<thead><tr style="background:var(--bg-dark);border-bottom:2px solid var(--border);">' +
            '<th style="padding:0.65rem 0.75rem;text-align:left;font-size:0.78rem;">Cód.</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:left;font-size:0.78rem;">Produto</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Início</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Fim</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Duração</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Atividades</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Status</th>' +
            '<th style="padding:0.65rem 0.75rem;text-align:right;font-size:0.78rem;">Pontos</th>' +
        '</tr></thead>' +
        '<tbody>' +
            linhasProdutos +
            '<tr style="background:rgba(10,77,60,0.12);border-top:2px solid var(--primary);">' +
                '<td colspan="4" style="padding:0.65rem 0.75rem;font-weight:700;font-size:0.88rem;">TOTAIS</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;color:var(--text-muted);font-family:var(--code-font);">~' + durMedia + (durMedia !== '—' ? ' d' : '') + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;font-weight:700;">' + totalAtivs + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;color:var(--text-muted);">' + finalizados.length + ' finalizado(s)</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:right;font-family:var(--code-font);color:var(--accent);font-weight:700;font-size:1.1rem;">' + ptsFinalizados.toFixed(1) + '</td>' +
            '</tr>' +
        '</tbody></table></div>';

    document.getElementById('relatorioData').innerHTML = html;
}

// ─── RELATÓRIO EQUIPE ──────────────────────────────────────────────────
// Idêntico à lógica de equipe.js mas com período livre
function renderEquipe(produtos, dataIni, dataFim) {
    const diasUteis = calcDiasUteis(dataIni, dataFim, feriadosCache);

    // Colaboradores operacionais (excluir CEQUI — igual equipe.js)
    const colabsOper = colaboradores.filter(c => c.area !== 'CEQUI');

    // Agrupar produtos por servidor
    const porSrv = {};
    produtos.forEach(p => {
        const sid = parseInt(p.servidorId);
        if (!porSrv[sid]) porSrv[sid] = { ptsTotal: 0, ptsFin: 0, total: 0, fin: 0, and: 0, nc: 0, duracoes: [] };
        const pts = ptsProduto(p);
        const st  = resolverStatus(p);
        porSrv[sid].total++;
        porSrv[sid].ptsTotal += pts;
        if (st === 'finalizado') {
            porSrv[sid].ptsFin += pts;
            porSrv[sid].fin++;
            const d = durDias(p);
            if (d) porSrv[sid].duracoes.push(d);
        } else if (st === 'nao-concluido') {
            porSrv[sid].nc++;
        } else {
            porSrv[sid].and++;
        }
    });

    // Montar linhas por servidor
    const linhas = colabsOper.map(srv => {
        const d    = porSrv[parseInt(srv.id)] || { ptsTotal: 0, ptsFin: 0, total: 0, fin: 0, and: 0, nc: 0, duracoes: [] };
        const pres = calcPresencaPeriodo(srv.id, dataIni, dataFim);
        const dias = pres.trabalhados;
        const media = dias > 0 ? d.ptsFin / dias : 0;
        const bench = (window.BENCHMARK_AREA || {})[srv.area] || 8;
        const cor   = media >= bench ? 'var(--success)' : media >= bench * 0.8 ? 'var(--warning)' : media > 0 ? 'var(--danger)' : 'var(--text-muted)';
        const perc  = bench > 0 ? Math.min(100, (media / bench) * 100).toFixed(0) : 0;
        const durs  = d.duracoes;
        const durMed = durs.length > 0 ? (durs.reduce((s, v) => s + v, 0) / durs.length).toFixed(1) : null;
        return { srv, d, pres, dias, media, bench, cor, perc, durMed };
    });

    linhas.sort((a, b) => b.d.ptsFin - a.d.ptsFin);

    // KPIs globais
    const totalPts  = linhas.reduce((s, l) => s + l.d.ptsFin, 0);
    const totalAnd  = linhas.reduce((s, l) => s + l.d.and, 0);
    const totalFin  = linhas.reduce((s, l) => s + l.d.fin, 0);
    const totalNC   = linhas.reduce((s, l) => s + l.d.nc, 0);
    const totalProd = linhas.reduce((s, l) => s + l.d.total, 0);
    const totalDias = linhas.reduce((s, l) => s + l.dias, 0);

    // MRC = Σpts finalizados / Σdias trabalhados (igual equipe.js)
    const mrc = totalDias > 0 ? totalPts / totalDias : 0;
    const mri = +(mrc * 0.8).toFixed(2);

    // Médias por área
    const calcMediaArea = (area) => {
        const cols = linhas.filter(l => l.srv.area === area);
        const pts  = cols.reduce((s, l) => s + l.d.ptsFin, 0);
        const dias = cols.reduce((s, l) => s + l.dias, 0);
        return { pts, dias, media: dias > 0 ? (pts / dias).toFixed(2) : '—' };
    };
    const mec  = calcMediaArea('Mecânica');
    const elet = calcMediaArea('Eletrônica');

    // Dur. média dos produtos finalizados
    let somaDur = 0, qtdFin = 0;
    produtos.forEach(p => {
        if (resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim) {
            somaDur += durDias(p); qtdFin++;
        }
    });
    const durMediaProd = qtdFin > 0 ? (somaDur / qtdFin).toFixed(1) : '—';

    // KPIs topo
    const kpisHtml =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.6rem;margin-bottom:1.25rem;">' +
            cardKpi('Total Servidores',   linhas.length,               'var(--text-primary)') +
            cardKpi('Total Produtos',     totalProd,                   'var(--text-secondary)') +
            cardKpi('Em Andamento',       totalAnd,                    'var(--warning)') +
            cardKpi('Finalizados',        totalFin,                    'var(--success)') +
            cardKpi('Não Concluídos',     totalNC,                     '#818cf8') +
            cardKpi('MRC (equipe/dia)',   mrc > 0 ? mrc.toFixed(2) : '—', 'var(--accent)', totalDias + ' dias trab.') +
            cardKpi('MRI (MRC×0,8)',      mri > 0 ? mri.toFixed(2) : '—', '#818cf8', 'meta mínima') +
            cardKpi('Média Mecânica',     mec.media !== '—' ? mec.media + ' pts/d' : '—', 'var(--primary-light)', mec.dias + ' dias') +
            cardKpi('Média Eletrônica',   elet.media !== '—' ? elet.media + ' pts/d' : '—', 'var(--secondary-light)', elet.dias + ' dias') +
            cardKpi('Dur. Média Produtos', durMediaProd !== '—' ? durMediaProd + ' d' : '—', 'var(--text-secondary)', qtdFin + ' finalizado(s)') +
        '</div>';

    // Linhas da tabela
    let tbody = '';
    for (const l of linhas) {
        // Desempenho Relativo vs MRC (igual equipe.js)
        let vsHtml;
        if (mrc === 0 || l.media === 0) {
            vsHtml = '<span style="color:var(--text-muted);">—</span>';
        } else {
            const pct   = (l.media / mrc - 1) * 100;
            const sinal = pct >= 0 ? '+' : '';
            const corVs = pct >= 0 ? 'var(--success)' : 'var(--danger)';
            vsHtml = '<span style="font-weight:700;font-family:var(--code-font);color:' + corVs + ';">' + sinal + pct.toFixed(1) + '%</span>' +
                     '<div style="font-size:0.65rem;color:var(--text-muted);">MRC: ' + mrc.toFixed(2) + '</div>';
        }

        tbody +=
            '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:0.6rem 0.75rem;"><span style="font-family:var(--code-font);font-size:0.8rem;background:var(--bg-light);padding:0.15rem 0.4rem;border-radius:4px;">P' + l.srv.ponto + '</span></td>' +
            '<td style="padding:0.6rem 0.75rem;font-weight:600;font-size:0.88rem;">' + l.srv.nome + '</td>' +
            '<td style="padding:0.6rem 0.75rem;font-size:0.8rem;color:var(--text-muted);">' + l.srv.area + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.d.total > 0 ? l.d.total : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + l.dias + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.pres.ausentes > 0 ? '<span style="color:var(--warning);">' + l.pres.ausentes + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.pres.dispensas > 0 ? '<span style="color:#3B82F6;">' + l.pres.dispensas + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.d.and > 0 ? '<span style="color:var(--warning);font-weight:600;">' + l.d.and + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.d.fin > 0 ? '<span style="color:var(--success);font-weight:600;">' + l.d.fin + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.d.nc > 0 ? '<span style="color:#818cf8;font-weight:600;">' + l.d.nc + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:center;">' + (l.durMed ? '<span style="font-family:var(--code-font);color:var(--text-secondary);">' + l.durMed + ' d</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:right;font-family:var(--code-font);font-weight:700;color:var(--success);">' + l.d.ptsFin.toFixed(1) + '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:right;">' +
                '<span style="font-family:var(--code-font);font-weight:700;color:' + l.cor + ';">' + l.media.toFixed(2) + '</span>' +
                '<div style="font-size:0.65rem;color:var(--text-muted);">' + l.perc + '% da meta</div>' +
            '</td>' +
            '<td style="padding:0.6rem 0.75rem;text-align:right;">' + vsHtml + '</td>' +
            '</tr>';
    }

    const html =
        '<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;">Equipe · ' + fmtDate(dataIni) + ' → ' + fmtDate(dataFim) + '</h3>' +
        kpisHtml +
        '<div style="overflow-x:auto;">' +
        '<table style="width:100%;min-width:1000px;">' +
        '<thead><tr style="background:var(--bg-dark);border-bottom:2px solid var(--border);">' +
            '<th style="padding:0.6rem 0.75rem;text-align:left;font-size:0.75rem;">Ponto</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:left;font-size:0.75rem;">Servidor</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:left;font-size:0.75rem;">Área</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Total Prod.</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Dias Trab.</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Ausências</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Dispensas</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Em And.</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Finalizados</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">N.Conc.</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:center;font-size:0.75rem;">Dur. Média</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:right;font-size:0.75rem;">Pts Finalizados</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:right;font-size:0.75rem;">Média/Dia</th>' +
            '<th style="padding:0.6rem 0.75rem;text-align:right;font-size:0.75rem;">vs MRC</th>' +
        '</tr></thead>' +
        '<tbody>' + tbody + '</tbody>' +
        '</table></div>';

    document.getElementById('relatorioData').innerHTML = html;
}

// ─── SheetJS ───────────────────────────────────────────────────────────
function carregarSheetJS(callback) {
    if (window.XLSX) { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = callback;
    s.onerror = () => Notify.error('Erro ao carregar biblioteca de exportação.');
    document.head.appendChild(s);
}

// ─── EXCEL INDIVIDUAL ──────────────────────────────────────────────────
function exportarExcel() {
    if (!relatorioGerado || !produtosData.length) { Notify.warning('Gere um relatório primeiro!'); return; }
    if (document.getElementById('tipoRelatorio').value === 'equipe') { exportarExcelEquipe(); return; }

    carregarSheetJS(() => {
        const servidorId = parseInt(document.getElementById('servidorSelect').value);
        const servidor   = colaboradores.find(c => parseInt(c.id) === servidorId) || null;
        const nome       = servidor ? servidor.nome : 'Servidor';
        const dataIni    = document.getElementById('dataInicio').value;
        const dataFimVal = document.getElementById('dataFim').value;
        const periodo    = fmtDate(dataIni) + ' → ' + fmtDate(dataFimVal);
        const benchmark  = servidor ? ((window.BENCHMARK_AREA || {})[servidor.area] || 8) : 8;

        const diasUteis = calcDiasUteis(dataIni, dataFimVal, feriadosCache);
        const pres      = calcPresencaPeriodo(servidorId, dataIni, dataFimVal);
        const diasTrab  = pres.trabalhados;
        const taxa      = diasUteis > 0 ? ((diasTrab / diasUteis) * 100).toFixed(0) + '%' : '0%';

        const fin   = produtosData.filter(p => resolverStatus(p) === 'finalizado');
        const and   = produtosData.filter(p => resolverStatus(p) === 'em-andamento');
        const nc    = produtosData.filter(p => resolverStatus(p) === 'nao-concluido');
        const ptsFin  = fin.reduce((s, p) => s + ptsProduto(p), 0);
        const ptsAll  = produtosData.reduce((s, p) => s + ptsProduto(p), 0);
        const media   = diasTrab > 0 ? (ptsFin / diasTrab).toFixed(2) : '0.00';
        const esp     = diasTrab > 0 ? (ptsAll / diasTrab).toFixed(2) : '0.00';

        const durs    = fin.filter(p => p.dataInicio && p.dataFim).map(p => durDias(p));
        const durMedia = durs.length > 0 ? (durs.reduce((s, d) => s + d, 0) / durs.length).toFixed(1) : '-';

        // Aba Produtos
        const cab1 = ['Código', 'Produto / Descrição', 'Observações', 'Entregas', 'Data Início', 'Data Fim', 'Duração (dias)', 'Status', 'Nº Atividades', 'Pontos'];
        const rows1 = produtosData.map(p => {
            const d = durDias(p) || '';
            const st = resolverStatus(p);
            return [
                p.codigo, p.nome, p.observacoes || '', p.entregas || '',
                p.dataInicio ? new Date(p.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
                p.dataFim    ? new Date(p.dataFim    + 'T00:00:00').toLocaleDateString('pt-BR') : 'Em andamento',
                d,
                st === 'finalizado' ? 'Finalizado' : st === 'nao-concluido' ? 'Não Concluído' : 'Em Andamento',
                (p.atividades || []).length,
                +ptsProduto(p).toFixed(1)
            ];
        });
        rows1.push(['TOTAIS', '', '', '', '', '',
            durs.length > 0 ? 'Média: ' + durMedia + ' d' : '',
            'Fin: ' + fin.length + ' | And: ' + and.length + ' | NC: ' + nc.length,
            produtosData.reduce((s, p) => s + (p.atividades || []).length, 0),
            +ptsFin.toFixed(1)
        ]);

        // Aba Atividades
        const cab2 = ['Cód. Produto', 'Produto', 'Cód. Atividade', 'Descrição', 'Categoria', 'Área', 'Peso', 'Complexidade', 'Pontos', 'Observação'];
        const rows2 = [];
        produtosData.forEach(p => {
            (p.atividades || []).forEach(a => {
                rows2.push([p.codigo, p.nome, a.codigo, a.atividade, a.categoria, a.areaAtividade || a.categoria, a.peso, a.complexidade, +(a.pontos || 0), a.observacao || '']);
            });
        });
        rows2.push(['TOTAL', '', '', '', '', '', '', '', +produtosData.reduce((s, p) => s + (p.atividades || []).reduce((ss, a) => ss + (a.pontos || 0), 0), 0).toFixed(1), '']);

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet([
            ['CEQUI — Relatório Individual de Produtividade'],
            ['Servidor: ' + nome + '  |  Ponto: ' + (servidor ? servidor.ponto : '-') + '  |  Área: ' + (servidor ? servidor.area : '-')],
            ['Período: ' + periodo + '  |  Exportado em: ' + new Date().toLocaleDateString('pt-BR')],
            [],
            ['PRESENÇA'],
            ['Dias Úteis', diasUteis, 'Dias Trabalhados', diasTrab, 'Taxa Presença', taxa, 'Pts Esperados', +(diasTrab * benchmark).toFixed(1), 'Ausências', pres.ausentes, 'Dispensas', pres.dispensas],
            [],
            ['PRODUTIVIDADE'],
            ['Pts Finalizados', +ptsFin.toFixed(1), 'Prod. Média/Dia', +parseFloat(media), 'Prod. Esperada', +parseFloat(esp), 'Pts Totais', +ptsAll.toFixed(1), 'Meta (pts/dia)', benchmark],
            ['Total Produtos', produtosData.length, 'Finalizados', fin.length, 'Em Andamento', and.length, 'Não Concluídos', nc.length, 'Dur. Média (dias)', +parseFloat(durMedia) || '-'],
            [],
            cab1, ...rows1
        ]);
        ws1['!cols'] = [10, 45, 30, 30, 14, 14, 14, 18, 14, 10].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws1, 'Produtos');

        const ws2 = XLSX.utils.aoa_to_sheet([
            ['CEQUI — Atividades Detalhadas'],
            ['Servidor: ' + nome + '  |  Período: ' + periodo],
            [], cab2, ...rows2
        ]);
        ws2['!cols'] = [12, 40, 16, 60, 12, 30, 8, 12, 10, 30].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws2, 'Atividades');

        XLSX.writeFile(wb, 'CEQUI_Individual_' + nome.split(' ')[0] + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        Notify.success('Excel exportado!');
    });
}

// ─── EXCEL EQUIPE ──────────────────────────────────────────────────────
function exportarExcelEquipe() {
    carregarSheetJS(() => {
        const dataIni    = document.getElementById('dataInicio').value;
        const dataFim    = document.getElementById('dataFim').value;
        const periodo    = fmtDate(dataIni) + ' → ' + fmtDate(dataFim);
        const dataExport = new Date().toLocaleDateString('pt-BR');

        const colabsOper = colaboradores.filter(c => c.area !== 'CEQUI');

        // Recalcular por servidor
        const porSrv = {};
        produtosData.forEach(p => {
            const sid = parseInt(p.servidorId);
            if (!porSrv[sid]) porSrv[sid] = { ptsFin: 0, ptsAll: 0, total: 0, fin: 0, and: 0, nc: 0, duracoes: [] };
            const pts = ptsProduto(p);
            const st  = resolverStatus(p);
            porSrv[sid].ptsAll += pts;
            porSrv[sid].total++;
            if (st === 'finalizado') {
                porSrv[sid].ptsFin += pts; porSrv[sid].fin++;
                const d = durDias(p); if (d) porSrv[sid].duracoes.push(d);
            } else if (st === 'nao-concluido') porSrv[sid].nc++;
            else porSrv[sid].and++;
        });

        let mrcPts = 0, mrcDias = 0;
        const linhasData = colabsOper.map(srv => {
            const d    = porSrv[parseInt(srv.id)] || { ptsFin: 0, ptsAll: 0, total: 0, fin: 0, and: 0, nc: 0, duracoes: [] };
            const pres = calcPresencaPeriodo(srv.id, dataIni, dataFim);
            const dias = pres.trabalhados;
            const media = dias > 0 ? +(d.ptsFin / dias).toFixed(2) : 0;
            const bench = (window.BENCHMARK_AREA || {})[srv.area] || 8;
            const perc  = bench > 0 ? Math.min(100, (media / bench) * 100).toFixed(0) : 0;
            const durs  = d.duracoes;
            const durMed = durs.length > 0 ? +(durs.reduce((s, v) => s + v, 0) / durs.length).toFixed(1) : '';
            mrcPts += d.ptsFin; mrcDias += dias;
            return { srv, d, pres, dias, media, bench, perc, durMed };
        });

        linhasData.sort((a, b) => b.d.ptsFin - a.d.ptsFin);

        const mrc = mrcDias > 0 ? mrcPts / mrcDias : 0;
        const mri = +(mrc * 0.8).toFixed(2);

        const totalPts  = linhasData.reduce((s, l) => s + l.d.ptsFin, 0);
        const totalAnd  = linhasData.reduce((s, l) => s + l.d.and, 0);
        const totalFin  = linhasData.reduce((s, l) => s + l.d.fin, 0);
        const totalNC   = linhasData.reduce((s, l) => s + l.d.nc, 0);
        const totalProd = linhasData.reduce((s, l) => s + l.d.total, 0);
        const totalDias = linhasData.reduce((s, l) => s + l.dias, 0);

        const mec  = linhasData.filter(l => l.srv.area === 'Mecânica');
        const elet = linhasData.filter(l => l.srv.area === 'Eletrônica');
        const mediaMec  = mec.length  > 0 ? (mec.reduce((s, l) => s + l.d.ptsFin, 0)  / mec.reduce((s, l) => s + l.dias, 0) || 0).toFixed(2)  : '—';
        const mediaElet = elet.length > 0 ? (elet.reduce((s, l) => s + l.d.ptsFin, 0) / elet.reduce((s, l) => s + l.dias, 0) || 0).toFixed(2) : '—';

        let somaDur = 0, qtdFin = 0;
        produtosData.forEach(p => { if (resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim) { somaDur += durDias(p); qtdFin++; } });
        const durMediaProd = qtdFin > 0 ? (somaDur / qtdFin).toFixed(1) : '-';

        const cab = ['Ponto', 'Servidor', 'Área', 'Total Prod.', 'Dias Trab.', 'Ausências', 'Dispensas', 'Em Andamento', 'Finalizados', 'Não Concluídos', 'Dur. Média (d)', 'Pts Finalizados', 'Média/Dia', '% da Meta', 'vs MRC'];
        const rows = linhasData.map(l => {
            let vs = '';
            if (mrc > 0 && l.media > 0) {
                const pct = (l.media / mrc - 1) * 100;
                vs = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
            }
            return [
                'P' + l.srv.ponto, l.srv.nome, l.srv.area,
                l.d.total, l.dias, l.pres.ausentes, l.pres.dispensas,
                l.d.and, l.d.fin, l.d.nc, l.durMed || '',
                +l.d.ptsFin.toFixed(1), l.media, l.perc + '%', vs
            ];
        });
        rows.push(['TOTAIS', '', '', totalProd, totalDias, '', '', totalAnd, totalFin, totalNC, '',
            +totalPts.toFixed(1), +mrc.toFixed(2), '', ''
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['CEQUI — Relatório da Equipe'],
            ['Período: ' + periodo + '  |  Exportado em: ' + dataExport],
            [],
            ['INDICADORES GERAIS'],
            ['Total Servidores', linhasData.length, 'Total Produtos', totalProd, 'Dias Trab. Total', totalDias],
            ['Em Andamento', totalAnd, 'Finalizados', totalFin, 'Não Concluídos', totalNC],
            ['MRC (equipe/dia)', +mrc.toFixed(2), 'MRI (MRC×0,8)', mri, 'Dur. Média Produtos (d)', +parseFloat(durMediaProd) || '-'],
            ['Média Mecânica', +parseFloat(mediaMec) || '-', 'Média Eletrônica', +parseFloat(mediaElet) || '-', '', ''],
            [],
            cab, ...rows
        ]);
        ws['!cols'] = [8, 30, 14, 12, 12, 12, 12, 12, 12, 14, 12, 16, 12, 12, 12].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Equipe');

        XLSX.writeFile(wb, 'CEQUI_Equipe_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        Notify.success('Excel da equipe exportado!');
    });
}

// ─── CSV DETALHADO ─────────────────────────────────────────────────────
function exportarCSVDetalhado() {
    if (!produtosData.length) { Notify.warning('Gere um relatório primeiro!'); return; }
    const servidorId = parseInt(document.getElementById('servidorSelect').value);
    const servidor   = colaboradores.find(c => parseInt(c.id) === servidorId) || null;
    const nome       = servidor ? servidor.nome : '';
    const dataExport = new Date().toLocaleDateString('pt-BR');

    const esc = v => {
        const s = String(v == null ? '' : v);
        return (s.includes(';') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const linhas = [
        'sep=;',
        'CEQUI - Relatório Detalhado de Atividades',
        'Servidor;' + esc(nome) + ';Ponto;' + esc(servidor ? servidor.ponto : '') + ';Área;' + esc(servidor ? servidor.area : ''),
        'Exportado em;' + dataExport, '',
        ['Código Produto', 'Nome do Produto', 'Data Início', 'Data Fim', 'Status',
            'Código Atividade', 'Categoria', 'Descrição da Atividade', 'Área', 'Peso', 'Complexidade', 'Pontos'].map(esc).join(';')
    ];

    let total = 0;
    produtosData.forEach(p => {
        const st  = resolverStatus(p);
        const stL = st === 'finalizado' ? 'Finalizado' : st === 'nao-concluido' ? 'Não Concluído' : 'Em Andamento';
        const dI  = p.dataInicio ? new Date(p.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
        const dF  = p.dataFim    ? new Date(p.dataFim    + 'T00:00:00').toLocaleDateString('pt-BR') : 'Em andamento';
        (p.atividades || []).forEach(a => {
            total += a.pontos || 0;
            linhas.push([p.codigo, p.nome, dI, dF, stL, a.codigo, a.categoria, a.atividade,
                a.areaAtividade || a.categoria, a.peso, a.complexidade, a.pontos].map(esc).join(';'));
        });
    });
    linhas.push('', ';;;;;;;;;;TOTAL GERAL;;' + total.toFixed(1));

    const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    Exporter.downloadFile(blob, 'CEQUI_CSV_' + (nome.split(' ')[0] || 'Relatorio') + '_' + new Date().toISOString().slice(0, 10) + '.csv');
    Notify.success('CSV exportado!');
}
