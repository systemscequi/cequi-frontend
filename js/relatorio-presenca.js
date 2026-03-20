/**
 * CEQUI - Relatório de Presença Mensal
 * Agora integrado à página unificada controle-presenca.html
 * Usa a variável `servidorAtual` gerenciada pelo controle-presenca.js
 */

let dadosRelatorio = [];

async function carregarRelatorio() {
    // Usa servidorAtual do controle-presenca.js (já na mesma página)
    if (!servidorAtual) return;

    const presencaKey = `presenca_${servidorAtual}`;
    const presencaData = DataStore.get(presencaKey) || {};

    const produtosResult = await MockAPI.getProdutos(servidorAtual);
    const produtos = produtosResult.success ? produtosResult.data : [];

    dadosRelatorio = [];

    const meses = Object.keys(presencaData).sort().reverse();

    for (const mesAno of meses) {
        const mesDados = presencaData[mesAno];
        const diasUteis = window.PresencaManager.calcularDiasUteis(mesAno);

        let diasTrabalhados = 0, ausencias = 0, dispensas = 0;
        for (let dia in mesDados) {
            if (mesDados[dia] === 'trabalhado') diasTrabalhados++;
            if (mesDados[dia] === 'ausente')    ausencias++;
            if (mesDados[dia] === 'dispensa')   dispensas++;
        }

        const taxaPresenca = diasUteis > 0
            ? ((diasTrabalhados / diasUteis) * 100).toFixed(1) : 0;

        const produtosFinalizados = produtos.filter(p => {
            if (!p.dataInicio) return false;
            return p.dataInicio.substring(0, 7) === mesAno;
        });

        const produtosAndamento   = produtos.filter(p => p.dataInicio && p.dataInicio.substring(0,7) === mesAno && resolverStatus(p) === 'em-andamento');
        const produtosNaoConc     = produtos.filter(p => p.dataInicio && p.dataInicio.substring(0,7) === mesAno && resolverStatus(p) === 'nao-concluido');
        const totalProdMes        = produtosFinalizados.length + produtosAndamento.length + produtosNaoConc.length;

        // Pontuação: apenas produtos finalizados
        let pontosMes = 0;
        produtosFinalizados.filter(p => resolverStatus(p) === 'finalizado').forEach(prod => {
            (prod.atividades || []).forEach(a => { pontosMes += a.pontos || 0; });
        });

        // Duração média dos produtos finalizados no mês
        const duracoes = produtosFinalizados
            .filter(p => resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim)
            .map(p => {
                const dI = new Date(p.dataInicio + 'T00:00:00');
                const dF = new Date(p.dataFim    + 'T00:00:00');
                return Math.max(1, Math.round((dF - dI) / 86400000) + 1);
            });
        const duracaoMedia = duracoes.length > 0
            ? (duracoes.reduce((s,v) => s+v, 0) / duracoes.length).toFixed(1)
            : null;

        const produtividade = diasTrabalhados > 0
            ? (pontosMes / diasTrabalhados).toFixed(2) : '0.00';

        dadosRelatorio.push({ mesAno, diasUteis, diasTrabalhados, ausencias, dispensas, taxaPresenca, produtividade,
            totalProdMes, finalizados: produtosFinalizados.filter(p => resolverStatus(p) === 'finalizado').length,
            andamento: produtosAndamento.length, naoConcluidos: produtosNaoConc.length, duracaoMedia });
    }

    renderizarTabela();
    calcularEstatisticas();
}

function renderizarTabela() {
    const tbody = document.getElementById('relatorioTable');
    if (!tbody) return;

    if (dadosRelatorio.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <p>Nenhum mês registrado</p>
                </td>
            </tr>`;
        return;
    }

    const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    tbody.innerHTML = dadosRelatorio.map(mes => {
        const [ano, mesNum] = mes.mesAno.split('-');
        const mesFormatado = `${nomeMes[parseInt(mesNum)-1]}/${ano}`;
        const taxaClass = mes.taxaPresenca >= 90 ? 'success' : mes.taxaPresenca >= 75 ? 'warning' : 'danger';
        const taxaRGB   = taxaClass === 'success' ? '16,185,129' : taxaClass === 'warning' ? '245,158,11' : '239,68,68';
        const prodBadge = parseFloat(mes.produtividade) >= 8
            ? 'var(--success)' : parseFloat(mes.produtividade) >= 6.4
            ? 'var(--warning)' : 'var(--danger)';
        return `
            <tr>
                <td><strong>${mesFormatado}</strong></td>
                <td>${mes.diasUteis}</td>
                <td><span class="badge" style="background:rgba(16,185,129,0.2);border-color:var(--success);color:var(--success);">${mes.diasTrabalhados}</span></td>
                <td>${mes.ausencias}</td>
                <td>${mes.dispensas}</td>
                <td><span class="badge" style="background:rgba(${taxaRGB},0.2);border-color:var(--${taxaClass});color:var(--${taxaClass});">${mes.taxaPresenca}%</span></td>
                <td style="text-align:center;">
                    <span style="color:var(--warning);font-weight:600;">${mes.andamento}</span> /
                    <span style="color:var(--success);font-weight:600;">${mes.finalizados}</span> /
                    <span style="color:#818cf8;font-weight:600;">${mes.naoConcluidos}</span>
                    <div style="font-size:0.68rem;color:var(--text-muted);">and/fin/n.c.</div>
                </td>
                <td style="text-align:center;">${mes.duracaoMedia ? `<span class="code-badge">${mes.duracaoMedia} d</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td><span class="code-badge" style="color:${prodBadge};">${mes.produtividade} pts/dia</span></td>
            </tr>`;
    }).join('');
}

function calcularEstatisticas() {
    const totalMeses    = dadosRelatorio.length;
    const totalDias     = dadosRelatorio.reduce((s,m) => s + m.diasTrabalhados, 0);
    const totalAus      = dadosRelatorio.reduce((s,m) => s + m.ausencias, 0);
    const taxaMedia     = totalMeses > 0
        ? (dadosRelatorio.reduce((s,m) => s + parseFloat(m.taxaPresenca), 0) / totalMeses).toFixed(1) : 0;
    const totalFin      = dadosRelatorio.reduce((s,m) => s + m.finalizados, 0);
    const totalAnd      = dadosRelatorio.reduce((s,m) => s + m.andamento, 0);
    const totalNaoConc  = dadosRelatorio.reduce((s,m) => s + m.naoConcluidos, 0);
    const mediaProds    = totalMeses > 0
        ? (dadosRelatorio.reduce((s,m) => s + parseFloat(m.produtividade), 0) / totalMeses).toFixed(2) : '0.00';

    const el = id => document.getElementById(id);
    if (el('totalMeses'))           el('totalMeses').textContent          = totalMeses;
    if (el('totalDiasTrabalhados')) el('totalDiasTrabalhados').textContent = totalDias;
    if (el('totalAusencias'))       el('totalAusencias').textContent      = totalAus;
    if (el('taxaMedia'))            el('taxaMedia').textContent           = taxaMedia + '%';
    if (el('totalFinalizados'))     el('totalFinalizados').textContent    = totalFin;
    if (el('totalAndamento'))       el('totalAndamento').textContent      = totalAnd;
    if (el('totalNaoConcluidos'))   el('totalNaoConcluidos').textContent  = totalNaoConc;
    if (el('mediaProdutividade'))   el('mediaProdutividade').textContent  = mediaProds + ' pts/dia';
}

function exportarRelatorio() {
    if (!dadosRelatorio.length) { Notify.warning('Nenhum dado para exportar!'); return; }
    const nomeMesFull = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dados = dadosRelatorio.map(mes => {
        const [ano, mesNum] = mes.mesAno.split('-');
        return {
            'Mês/Ano':                       `${nomeMesFull[parseInt(mesNum)-1]}/${ano}`,
            'Dias Úteis':                    mes.diasUteis,
            'Dias Trabalhados':              mes.diasTrabalhados,
            'Ausências':                     mes.ausencias,
            'Dispensas':                     mes.dispensas,
            'Taxa de Presença (%)':          mes.taxaPresenca,
            'Em Andamento':                  mes.andamento,
            'Finalizados':                   mes.finalizados,
            'Não Concluídos':                mes.naoConcluidos,
            'Dur. Média Produtos (dias)':    mes.duracaoMedia || '-',
            'Produtividade Média (pts/dia)': mes.produtividade
        };
    });
    Exporter.exportCSV(dados, 'relatorio_presenca_mensal');
}
