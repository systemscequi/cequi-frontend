/**
 * CEQUI - Visão da Equipe
 * Comparativo de produtividade filtrado por mês/ano
 * Média = Σ pontos finalizados no mês / nº de servidores operacionais
 */

let colaboradores = [];
let produtos       = [];
let equipeMesAno   = null; // "YYYY-MM"

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.isAdmin()) {
        window.location.href = '../index.html';
        return;
    }
    initEquipeMesAno();
    await loadEquipeData();
    setupEventListeners();
});

// ─── Inicializa seletores com o mês atual ────────────────────────────
function initEquipeMesAno() {
    const selMes = document.getElementById('equipeMesSelect');
    const selAno = document.getElementById('equipeAnoSelect');
    if (!selMes || !selAno) return;

    const hoje     = new Date();
    const mesAtual = hoje.getMonth(); // 0-11
    const anoAtual = hoje.getFullYear();

    selMes.value = mesAtual;

    const anos = [anoAtual, anoAtual - 1, anoAtual - 2];
    selAno.innerHTML = anos.map(a =>
        `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`
    ).join('');

    equipeMesAno = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}`;
}

function getEquipeMesAno() {
    const mes = document.getElementById('equipeMesSelect')?.value;
    const ano = document.getElementById('equipeAnoSelect')?.value;
    if (mes !== undefined && ano) return `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    return equipeMesAno;
}

function onPeriodoEquipeChange() {
    equipeMesAno = getEquipeMesAno();
    calcularEstatisticas();
    renderTable(document.getElementById('searchBox')?.value || '');
}

// ─── Filtra produtos pelo mês de início ──────────────────────────────
function filtrarProdutosMes(lista, mesAno) {
    if (!mesAno) return lista;
    return lista.filter(p => {
        if (!p.dataInicio) return false;
        return p.dataInicio.substring(0, 7) === mesAno;
    });
}

// ─── Carrega dados ────────────────────────────────────────────────────
async function loadEquipeData() {
    try {
        const colabResult = await MockAPI.getColaboradores();
        if (colabResult.success) {
            colaboradores = colabResult.data.filter(c => c.area !== 'CEQUI');
        }
        const prodResult = await MockAPI.getProdutos();
        if (prodResult.success) {
            produtos = prodResult.data;
        }
        calcularEstatisticas();
        renderTable();
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
        Notify.error('Erro ao carregar dados da equipe');
    }
}

// ─── KPIs do topo ─────────────────────────────────────────────────────
function calcularEstatisticas() {
    const mesAno = getEquipeMesAno();
    const produtosMes = filtrarProdutosMes(produtos, mesAno);

    // Excluir area CEQUI também dos produtos
    const produtosOper = produtosMes.filter(p => {
        const col = colaboradores.find(c => c.id === p.servidorId);
        return col !== undefined; // só servidores operacionais
    });

    const qtdAndamento    = produtosOper.filter(p => resolverStatus(p) === 'em-andamento').length;
    const qtdFinalizado   = produtosOper.filter(p => resolverStatus(p) === 'finalizado').length;
    const qtdNaoConcluido = produtosOper.filter(p => resolverStatus(p) === 'nao-concluido').length;

    document.getElementById('totalServidores').textContent     = colaboradores.length;
    document.getElementById('produtosAndamento').textContent   = qtdAndamento;
    document.getElementById('produtosFinalizados').textContent = qtdFinalizado;
    const elNC = document.getElementById('produtosNaoConcluidos');
    if (elNC) elNC.textContent = qtdNaoConcluido;

    const subAndamento = document.getElementById('subAndamento');
    if (subAndamento) subAndamento.textContent = '';

    // ── MRC: Σ pontos finalizados todos servidores / Σ dias trabalhados todos servidores ──
    let totalPontosFinalizados = 0;
    let totalDiasTrabalhados   = 0;

    colaboradores.forEach(col => {
        const prodsMes = filtrarProdutosMes(produtos.filter(p => p.servidorId === col.id), mesAno);
        prodsMes.filter(p => resolverStatus(p) === 'finalizado').forEach(p => {
            (p.atividades || []).forEach(a => { totalPontosFinalizados += a.pontos || 0; });
        });
        const diasTrab = window.PresencaManager
            ? window.PresencaManager.getDiasTrabalhados(col.id, mesAno)
            : 0;
        totalDiasTrabalhados += diasTrab;
    });

    const mrcValor = totalDiasTrabalhados > 0
        ? totalPontosFinalizados / totalDiasTrabalhados
        : 0;

    const elDuracao    = document.getElementById('duracaoMediaDiaria');
    const elSubDuracao = document.getElementById('subDuracaoMedia');
    if (elDuracao) elDuracao.textContent = mrcValor > 0 ? mrcValor.toFixed(2) + ' pts/dia' : '—';
    if (elSubDuracao) elSubDuracao.textContent = totalDiasTrabalhados > 0
        ? `${totalPontosFinalizados.toFixed(0)} pts ÷ ${totalDiasTrabalhados} dias trabalhados`
        : 'Sem registros de presença';

    // ── Duração Média em Dias dos Produtos Finalizados ────────────────
    // Σ dias corridos de todos os produtos finalizados ÷ total de produtos finalizados
    let somaDiasFinalizados = 0;
    let totalProdutosFinalizados = 0;
    produtosOper.filter(p => resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim).forEach(p => {
        const dIni = new Date(p.dataInicio + 'T00:00:00');
        const dFim = new Date(p.dataFim    + 'T00:00:00');
        somaDiasFinalizados += Math.max(1, Math.round((dFim - dIni) / 86400000) + 1);
        totalProdutosFinalizados++;
    });

    const duracaoMediaDias = totalProdutosFinalizados > 0
        ? (somaDiasFinalizados / totalProdutosFinalizados).toFixed(1)
        : '—';

    const elDuracaoDias    = document.getElementById('duracaoMediaDias');
    const elSubDuracaoDias = document.getElementById('subDuracaoDias');
    if (elDuracaoDias) elDuracaoDias.textContent = duracaoMediaDias !== '—' ? duracaoMediaDias + ' dias' : '—';
    if (elSubDuracaoDias) elSubDuracaoDias.textContent = totalProdutosFinalizados > 0
        ? `${somaDiasFinalizados} dias ÷ ${totalProdutosFinalizados} produto${totalProdutosFinalizados !== 1 ? 's' : ''} finalizado${totalProdutosFinalizados !== 1 ? 's' : ''}`
        : 'Sem produtos finalizados';

    // ── Média por área: Σ pontos / Σ dias trabalhados ────────────────
    ['Mecânica', 'Eletrônica'].forEach(area => {
        const colabsArea = colaboradores.filter(c => c.area === area);
        let ptsArea  = 0;
        let diasArea = 0;
        colabsArea.forEach(col => {
            const prodsMes = filtrarProdutosMes(produtos.filter(p => p.servidorId === col.id), mesAno);
            prodsMes.filter(p => resolverStatus(p) === 'finalizado').forEach(p => {
                (p.atividades || []).forEach(a => { ptsArea += a.pontos || 0; });
            });
            const diasTrab = window.PresencaManager
                ? window.PresencaManager.getDiasTrabalhados(col.id, mesAno)
                : 0;
            diasArea += diasTrab;
        });
        const mediaArea = diasArea > 0 ? (ptsArea / diasArea).toFixed(2) : '—';
        const key    = area === 'Mecânica' ? 'Mecanica' : 'Eletronica';
        const elVal  = document.getElementById('mediaMedia' + key);
        const elSub  = document.getElementById('subMedia'  + key);
        if (elVal) elVal.textContent = mediaArea !== '—' ? mediaArea + ' pts/dia' : '—';
        if (elSub) elSub.textContent = diasArea > 0
            ? `${ptsArea.toFixed(0)} pts ÷ ${diasArea} dias trabalhados`
            : 'Sem registros de presença';
    });
}

// ─── Tabela por servidor ──────────────────────────────────────────────
function renderTable(filtro = '') {
    const tbody  = document.getElementById('equipeTable');
    const mesAno = getEquipeMesAno();

    const dadosEquipe = colaboradores.map(col => {
        const prodsMes   = filtrarProdutosMes(produtos.filter(p => p.servidorId === col.id), mesAno);

        const qtdTotal        = prodsMes.length;
        const qtdAndamento    = prodsMes.filter(p => resolverStatus(p) === 'em-andamento').length;
        const qtdFinalizados  = prodsMes.filter(p => resolverStatus(p) === 'finalizado').length;
        const qtdNaoConcluido = prodsMes.filter(p => resolverStatus(p) === 'nao-concluido').length;

        // Pontos só dos finalizados no mês
        let pontosFinalizados = 0;
        prodsMes.filter(p => resolverStatus(p) === 'finalizado').forEach(p => {
            (p.atividades || []).forEach(a => { pontosFinalizados += a.pontos || 0; });
        });

        const diasTrabalhados = window.PresencaManager
            ? window.PresencaManager.getDiasTrabalhados(col.id, mesAno)
            : 0;

        const mediaDiaria = diasTrabalhados > 0
            ? (pontosFinalizados / diasTrabalhados).toFixed(2)
            : '0.00';

        return {
            ...col,
            qtdTotal, qtdAndamento, qtdFinalizados, qtdNaoConcluido,
            pontosFinalizados, diasTrabalhados,
            mediaDiaria: parseFloat(mediaDiaria)
        };
    });

    // Ordenar por pontos finalizados (maior primeiro)
    dadosEquipe.sort((a, b) => b.pontosFinalizados - a.pontosFinalizados);

    let filtrados = dadosEquipe;
    if (filtro) {
        const t = filtro.toLowerCase();
        filtrados = dadosEquipe.filter(d =>
            d.nome.toLowerCase().includes(t) || d.area.toLowerCase().includes(t)
        );
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-state"><div class="empty-state-icon">👥</div><p>Nenhum dado encontrado</p></td></tr>`;
        return;
    }

    const bench = 8; // benchmark pts/dia

    // MRC recalculado aqui para uso na tabela (mesma lógica do calcularEstatisticas)
    let mrcPts  = 0;
    let mrcDias = 0;
    colaboradores.forEach(col => {
        const prodsMesCol = filtrarProdutosMes(produtos.filter(p => p.servidorId === col.id), mesAno);
        prodsMesCol.filter(p => resolverStatus(p) === 'finalizado').forEach(p => {
            (p.atividades || []).forEach(a => { mrcPts += a.pontos || 0; });
        });
        mrcDias += window.PresencaManager
            ? window.PresencaManager.getDiasTrabalhados(col.id, mesAno)
            : 0;
    });
    const mrc = mrcDias > 0 ? mrcPts / mrcDias : 0;

    tbody.innerHTML = filtrados.map(d => {
        const cor = d.mediaDiaria >= bench ? 'var(--success)'
                  : d.mediaDiaria >= bench * 0.8 ? 'var(--warning)'
                  : d.mediaDiaria > 0 ? 'var(--danger)' : 'var(--text-muted)';

        // Desempenho Relativo = mediaDiaria do servidor / MRC
        let vsHtml;
        if (mrc === 0 || d.mediaDiaria === 0) {
            vsHtml = '<span style="color:var(--text-muted);font-size:0.85rem;">—</span>';
        } else {
            const ratio  = d.mediaDiaria / mrc;
            const pct    = (ratio - 1) * 100;
            const sinal  = pct >= 0 ? '+' : '';
            const corVs  = pct >= 0 ? 'var(--success)' : 'var(--danger)';
            vsHtml = '<span style="font-weight:700;font-family:var(--code-font);font-size:0.9rem;color:' + corVs + ';">' + sinal + pct.toFixed(1) + '%</span>'
                   + '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.15rem;">MRC: ' + mrc.toFixed(2) + ' pts/dia</div>';
        }

        return `
        <tr style="cursor:pointer;" onclick="verDetalhesServidor(${d.id})">
            <td><span class="ponto-badge">P${d.ponto}</span></td>
            <td>${d.nome}</td>
            <td><span class="area-badge">${d.area}</span></td>
            <td style="text-align:center;font-weight:600;">${d.qtdTotal > 0 ? d.qtdTotal : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td>${d.qtdAndamento    > 0 ? `<span style="color:var(--warning);font-weight:600;">${d.qtdAndamento}</span>`    : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td>${d.qtdFinalizados  > 0 ? `<span style="color:var(--success);font-weight:600;">${d.qtdFinalizados}</span>`  : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td>${d.qtdNaoConcluido > 0 ? `<span style="color:#818cf8;font-weight:600;">${d.qtdNaoConcluido}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td><span class="points-cell">${d.pontosFinalizados}</span></td>
            <td>
                <span class="code-badge" style="color:${cor};">${d.mediaDiaria}</span>
                ${d.diasTrabalhados > 0 ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">${d.diasTrabalhados} dias</div>` : '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">sem registro</div>'}
            </td>
            <td>${vsHtml}</td>
        </tr>`;
    }).join('');
}

function verDetalhesServidor(id) {
    const servidor = colaboradores.find(c => c.id === id);
    if (servidor) {
        CurrentServer.set(servidor);
        window.location.href = '../index.html';
    }
}

function setupEventListeners() {
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('input', Utils.debounce(e => renderTable(e.target.value), 300));
    }
}
