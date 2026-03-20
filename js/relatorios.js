/**
 * CEQUI - Relatórios
 * Geração e exportação de relatórios de produtividade
 */

let colaboradores  = [];
let produtosData   = [];
let relatorioGerado = false;

document.addEventListener('DOMContentLoaded', async () => {
    await loadServidores();
    setupEventListeners();
    setDefaultDates();
});

// ─── Carregar lista de servidores ───────────────────────────────────────
async function loadServidores() {
    const r = await MockAPI.getColaboradores();
    if (!r.success) return;
    colaboradores = r.data;

    const sel = document.getElementById('servidorSelect');
    sel.innerHTML = '<option value="">Selecione...</option>';
    colaboradores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nome + ' (Ponto ' + s.ponto + ')';
        sel.appendChild(opt);
    });

    const saved = CurrentServer.get();
    const servidorPreSel = saved && colaboradores.find(s => s.id === saved.id);
    if (servidorPreSel) sel.value = servidorPreSel.id;
    else if (colaboradores.length > 0) sel.value = colaboradores[0].id;
}

// ─── Datas padrão: primeiro e último dia do mês atual ──────────────────
function setDefaultDates() {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = String(hoje.getMonth() + 1).padStart(2, '0');
    const ultimo = new Date(y, hoje.getMonth() + 1, 0).getDate();
    document.getElementById('dataInicio').value = y + '-' + m + '-01';
    document.getElementById('dataFim').value    = y + '-' + m + '-' + String(ultimo).padStart(2, '0');
}

// ─── Mostrar/ocultar campo de servidor ─────────────────────────────────
function setupEventListeners() {
    document.getElementById('tipoRelatorio').addEventListener('change', function() {
        document.getElementById('servidorGroup').style.display =
            this.value === 'individual' ? 'block' : 'none';
    });
}

// ─── Dias úteis num intervalo excluindo fins de semana e feriados ──────
function calcDiasUteis(ini, fim, feriados) {
    var ferSet = {};
    for (var i = 0; i < feriados.length; i++) ferSet[feriados[i].data] = true;
    var count = 0;
    var cur = new Date(ini + 'T12:00:00');
    var end = new Date(fim + 'T12:00:00');
    while (cur <= end) {
        var dow = cur.getDay();
        var iso = cur.toISOString().slice(0, 10);
        if (dow !== 0 && dow !== 6 && !ferSet[iso]) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

// ─── Ausências do servidor num período ─────────────────────────────────
function calcAusencias(servidorId, ini, fim) {
    var presKey  = 'presenca_' + servidorId;
    var presData = DataStore.get(presKey) || {};
    var justificadas = 0, dispensas = 0, bancohoras = 0, ferias = 0, outros = 0;
    var cur = new Date(ini + 'T12:00:00');
    var end = new Date(fim + 'T12:00:00');
    while (cur <= end) {
        var dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
            var mesAno = cur.toISOString().slice(0, 7);
            var dia    = String(cur.getDate()).padStart(2, '0');
            var status = presData[mesAno] && presData[mesAno][dia];
            if (status === 'ausente')          justificadas++;
            else if (status === 'dispensa-ponto') dispensas++;
            else if (status === 'banco-horas')    bancohoras++;
            else if (status === 'ferias')         ferias++;
            else if (status === 'outros')         outros++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return { justificadas: justificadas, dispensas: dispensas, bancohoras: bancohoras, ferias: ferias, outros: outros };
}

// ─── Dias efetivamente trabalhados (marcados como 'trabalhado') ─────────
function calcDiasTrabalhados(servidorId, ini, fim) {
    var presKey  = 'presenca_' + servidorId;
    var presData = DataStore.get(presKey) || {};
    var count = 0;
    var cur = new Date(ini + 'T12:00:00');
    var end = new Date(fim + 'T12:00:00');
    while (cur <= end) {
        var dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
            var mesAno = cur.toISOString().slice(0, 7);
            var dia    = String(cur.getDate()).padStart(2, '0');
            var status = presData[mesAno] && presData[mesAno][dia];
            if (status === 'trabalhado') count++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function fmtDate(d) {
    if (!d) return 'Em andamento';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function ptsProduto(prod) {
    if (!prod.atividades) return 0;
    var s = 0;
    for (var i = 0; i < prod.atividades.length; i++) s += (prod.atividades[i].pontos || 0);
    return s;
}

// ─── Botão principal ────────────────────────────────────────────────────
async function gerarRelatorio() {
    var tipo       = document.getElementById('tipoRelatorio').value;
    var servidorId = parseInt(document.getElementById('servidorSelect').value);
    var dataIni    = document.getElementById('dataInicio').value;
    var dataFim    = document.getElementById('dataFim').value;

    if (!dataIni || !dataFim) { Notify.error('Selecione o período'); return; }
    if (dataIni > dataFim)    { Notify.error('Data inicial deve ser antes da data final'); return; }
    if (tipo === 'individual' && !servidorId) { Notify.error('Selecione um servidor'); return; }

    Notify.info('Gerando relatório...');

    var ferResult = await MockAPI.getFeriados();
    var feriados  = ferResult.success ? ferResult.data : [];

    var prodResult = await MockAPI.getProdutos(tipo === 'individual' ? servidorId : null);
    if (!prodResult.success) { Notify.error('Erro ao carregar dados'); return; }

    // Filtrar produtos cujo mês de início está dentro do período selecionado
    produtosData = prodResult.data.filter(function(p) {
        if (!p.dataInicio) return false;
        return p.dataInicio >= dataIni && p.dataInicio <= dataFim;
    });

    var content = document.getElementById('relatorioContent');
    content.style.display = 'block';

    if (tipo === 'individual') {
        renderIndividual(servidorId, produtosData, dataIni, dataFim, feriados);
    } else {
        renderEquipe(produtosData, dataIni, dataFim, feriados);
    }

    relatorioGerado = true;
    content.scrollIntoView({ behavior: 'smooth' });
    Notify.success('Relatório gerado!');
}

// ─── RELATÓRIO INDIVIDUAL ───────────────────────────────────────────────
function renderIndividual(servidorId, produtos, dataIni, dataFim, feriados) {
    var servidor    = null;
    for (var i = 0; i < colaboradores.length; i++) {
        if (colaboradores[i].id === servidorId) { servidor = colaboradores[i]; break; }
    }

    var benchmark   = (window.BENCHMARK_AREA && servidor) ? (window.BENCHMARK_AREA[servidor.area] || 8) : 8;
    var diasUteis   = calcDiasUteis(dataIni, dataFim, feriados);
    var ausencias   = calcAusencias(servidorId, dataIni, dataFim);
    var diasTrab    = calcDiasTrabalhados(servidorId, dataIni, dataFim);
    if (diasTrab < 0) diasTrab = 0;

    var finalizados = produtos.filter(function(p) { return resolverStatus(p) === 'finalizado'; });
    var emAndamento = produtos.filter(function(p) { return resolverStatus(p) === 'em-andamento'; });
    var naoConcluidos = produtos.filter(function(p) { return resolverStatus(p) === 'nao-concluido'; });

    var pontosFinalizados = 0;
    for (var i = 0; i < finalizados.length; i++) pontosFinalizados += ptsProduto(finalizados[i]);
    var pontosTotais = 0;
    for (var i = 0; i < produtos.length; i++) pontosTotais += ptsProduto(produtos[i]);

    var prodDiaria    = diasTrab > 0 ? (pontosFinalizados / diasTrab).toFixed(2) : '0.00';
    var expectativa   = benchmark;
    var percBench     = benchmark > 0 ? ((parseFloat(prodDiaria) / benchmark) * 100).toFixed(0) : 0;
    var corBench      = parseFloat(prodDiaria) >= benchmark ? 'var(--success)' :
                        parseFloat(prodDiaria) >= benchmark * 0.8 ? 'var(--warning)' : 'var(--danger)';

    // Duração média dos produtos finalizados (em dias corridos)
    var duracoes = finalizados
        .filter(function(p) { return p.dataInicio && p.dataFim; })
        .map(function(p) {
            var ini = new Date(p.dataInicio + 'T00:00:00');
            var fim = new Date(p.dataFim    + 'T00:00:00');
            return Math.max(1, Math.round((fim - ini) / 86400000) + 1);
        });
    var duracaoMedia = duracoes.length > 0
        ? (duracoes.reduce(function(s,d){ return s+d; }, 0) / duracoes.length).toFixed(1)
        : '—';

    var linhasProdutos = '';
    for (var i = 0; i < produtos.length; i++) {
        var p    = produtos[i];
        var pts  = ptsProduto(p);
        var fin  = p.dataFim && p.dataFim <= dataFim;
        var nAtiv = p.atividades ? p.atividades.length : 0;

        // Duração individual (só para finalizados)
        var duracaoDias = '—';
        if (p.dataInicio && p.dataFim) {
            var dIni = new Date(p.dataInicio + 'T00:00:00');
            var dFim = new Date(p.dataFim    + 'T00:00:00');
            duracaoDias = Math.max(1, Math.round((dFim - dIni) / 86400000) + 1) + ' d';
        }

        var linhasAtiv = '';
        if (p.atividades && p.atividades.length > 0) {
            for (var j = 0; j < p.atividades.length; j++) {
                var a = p.atividades[j];
                var areaAbrev = (a.areaAtividade || a.categoria || '').split(' ').slice(0,3).join(' ');
                linhasAtiv += '<tr style="border-top:1px solid var(--border);">' +
                    '<td style="padding:0.3rem 0.5rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.78rem;">' + a.codigo + '</td>' +
                    '<td style="padding:0.3rem 0.5rem;font-size:0.78rem;">' + (a.atividade ? a.atividade.substring(0,65) + '...' : '') + '</td>' +
                    '<td style="padding:0.3rem 0.5rem;font-size:0.75rem;color:var(--text-muted);">' + areaAbrev + '</td>' +
                    '<td style="padding:0.3rem 0.5rem;text-align:center;font-size:0.78rem;">' + a.peso + '</td>' +
                    '<td style="padding:0.3rem 0.5rem;text-align:center;font-size:0.78rem;">' + a.complexidade + '</td>' +
                    '<td style="padding:0.3rem 0.5rem;text-align:right;font-family:var(--code-font);color:var(--success);font-weight:700;">' + a.pontos + '</td>' +
                '</tr>';
            }
        }

        linhasProdutos +=
            '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="toggleRow(\'sub_' + p.id + '\')">' +
                '<td style="padding:0.7rem 0.75rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.85rem;">' + p.codigo + '</td>' +
                '<td style="padding:0.7rem 0.75rem;font-size:0.85rem;">' + p.nome + '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;">' + fmtDate(p.dataInicio) + '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;">' + fmtDate(p.dataFim) + '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:center;font-size:0.82rem;color:var(--text-muted);font-family:var(--code-font);white-space:nowrap;min-width:80px;">' + duracaoDias + '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:center;">' + nAtiv + '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:center;">' +
                    (function(p){ 
                    var sMap = {'finalizado':'completed','em-andamento':'in-progress','nao-concluido':'nao-concluido'};
                    var lMap = {'finalizado':'Finalizado','em-andamento':'Em Andamento','nao-concluido':'Não Concluído'};
                    return '<span class="status-badge ' + (sMap[p.status]||'in-progress') + '">' + (lMap[p.status]||p.status) + '</span>';
                })(p) +
                '</td>' +
                '<td style="padding:0.7rem 0.75rem;text-align:right;font-family:var(--code-font);font-weight:700;color:' + (p.status==='finalizado' ? 'var(--success)' : 'var(--warning)') + ';">' + pts.toFixed(1) + '</td>' +
            '</tr>';

        if (linhasAtiv) {
            linhasProdutos +=
                '<tr id="sub_' + p.id + '" style="display:none;background:var(--bg-dark);">' +
                    '<td colspan="8" style="padding:0.5rem 1.5rem;">' +
                        '<table style="width:100%;">' +
                            '<thead><tr style="color:var(--text-muted);">' +
                                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Código</th>' +
                                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Atividade</th>' +
                                '<th style="padding:0.3rem 0.5rem;text-align:left;font-size:0.75rem;">Área</th>' +
                                '<th style="padding:0.3rem 0.5rem;text-align:center;font-size:0.75rem;">Peso</th>' +
                                '<th style="padding:0.3rem 0.5rem;text-align:center;font-size:0.75rem;">Cx.</th>' +
                                '<th style="padding:0.3rem 0.5rem;text-align:right;font-size:0.75rem;">Pts</th>' +
                            '</tr></thead>' +
                            '<tbody>' + linhasAtiv + '</tbody>' +
                        '</table>' +
                    '</td>' +
                '</tr>';
        }
    }

    var totalAtividades = 0;
    for (var i = 0; i < produtos.length; i++) totalAtividades += (produtos[i].atividades || []).length;

    var html =
        '<div>' +
        // Cabeçalho
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">' +
            '<div style="background:var(--bg-dark);padding:1.25rem;border-radius:8px;border-left:4px solid var(--primary);">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.25rem;">Servidor</div>' +
                '<div style="font-size:1.1rem;font-weight:700;">' + (servidor ? servidor.nome : '-') + '</div>' +
                '<div style="font-size:0.85rem;color:var(--text-secondary);">Ponto ' + (servidor ? servidor.ponto : '-') + ' · ' + (servidor ? servidor.area : '-') + '</div>' +
            '</div>' +
            '<div style="background:var(--bg-dark);padding:1.25rem;border-radius:8px;border-left:4px solid var(--secondary);">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.25rem;">Período de Apuração</div>' +
                '<div style="font-size:1rem;font-weight:600;">' + fmtDate(dataIni) + ' → ' + fmtDate(dataFim) + '</div>' +
            '</div>' +
        '</div>' +
        // Indicadores do período
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.75rem;margin-bottom:1.5rem;">' +
            cardKpi('Dias Úteis', diasUteis, 'var(--text-primary)') +
            cardKpi('Ausências', ausencias.justificadas, 'var(--warning)') +
            cardKpi('Dispensas', ausencias.dispensas, 'var(--warning)') +
            cardKpi('Dias Trabalhados', diasTrab, 'var(--accent)') +
            // Card unificado de status de produtos
            '<div style="background:var(--bg-dark);padding:1rem;border-radius:8px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Produtos</div>' +
                '<div style="display:flex;flex-direction:column;gap:0.3rem;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:0.72rem;color:var(--warning);">Em Andamento</span>' +
                        '<span style="font-size:1rem;font-weight:700;color:var(--warning);font-family:var(--code-font);">' + emAndamento.length + '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:0.72rem;color:var(--success);">Finalizados</span>' +
                        '<span style="font-size:1rem;font-weight:700;color:var(--success);font-family:var(--code-font);">' + finalizados.length + '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:0.72rem;color:#818cf8;">Não Concluídos</span>' +
                        '<span style="font-size:1rem;font-weight:700;color:#818cf8;font-family:var(--code-font);">' + naoConcluidos.length + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        // KPIs principais
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:2rem;">' +
            '<div style="background:rgba(16,185,129,0.12);border:2px solid var(--success);border-radius:10px;padding:1.5rem;text-align:center;">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Pontos Finalizados</div>' +
                '<div style="font-size:2.5rem;font-weight:700;color:var(--success);font-family:var(--code-font);">' + pontosFinalizados.toFixed(1) + '</div>' +
                '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">' + finalizados.length + ' produto(s) concluído(s)</div>' +
            '</div>' +
            '<div style="background:rgba(10,77,60,0.15);border:2px solid var(--primary);border-radius:10px;padding:1.5rem;text-align:center;">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Produtividade Média Diária</div>' +
                '<div style="font-size:2.5rem;font-weight:700;color:var(--accent);font-family:var(--code-font);">' + prodDiaria + '</div>' +
                '<div style="font-size:0.78rem;margin-top:0.25rem;color:' + corBench + ';">' + percBench + '% da meta (' + benchmark + ' pts/dia)</div>' +
            '</div>' +
            '<div style="background:rgba(217,119,6,0.12);border:2px solid var(--secondary);border-radius:10px;padding:1.5rem;text-align:center;">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Pontuação Total (todos)</div>' +
                '<div style="font-size:2.5rem;font-weight:700;color:var(--secondary-light);font-family:var(--code-font);">' + pontosTotais.toFixed(1) + '</div>' +
                '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">Expectativa diária: ' + expectativa + ' pts/dia</div>' +
            '</div>' +
            '<div style="background:var(--bg-dark);border:2px solid var(--border);border-radius:10px;padding:1.5rem;text-align:center;">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Total de Produtos</div>' +
                '<div style="font-size:2.5rem;font-weight:700;color:var(--text-primary);font-family:var(--code-font);">' + produtos.length + '</div>' +
                '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">' + finalizados.length + ' final. · ' + emAndamento.length + ' andamento · ' + naoConcluidos.length + ' n.conc.</div>' +
            '</div>' +
            '<div style="background:var(--bg-dark);border:2px solid var(--border);border-radius:10px;padding:1.5rem;text-align:center;">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.5rem;">Dur. Média dos Produtos</div>' +
                '<div style="font-size:2.5rem;font-weight:700;color:var(--secondary-light);font-family:var(--code-font);">' + (duracaoMedia !== '—' ? duracaoMedia + ' d' : '—') + '</div>' +
                '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">' + (duracoes.length > 0 ? 'média de ' + duracoes.length + ' produto(s) finalizado(s)' : 'sem produtos finalizados') + '</div>' +
            '</div>' +
        '</div>' +
        // Tabela de produtos
        '<h4 style="font-size:1rem;font-weight:700;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:2px solid var(--border);">Relatório Compilado de Produtos</h4>' +
        '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;">Clique em um produto para expandir as atividades</p>' +
        '<div style="overflow-x:auto;">' +
        '<table style="width:100%;min-width:780px;" id="tabelaRelatorio">' +
            '<thead><tr style="background:var(--bg-dark);border-bottom:2px solid var(--border);">' +
                '<th style="padding:0.75rem;text-align:left;font-size:0.8rem;">Cód.</th>' +
                '<th style="padding:0.75rem;text-align:left;font-size:0.8rem;">Produto</th>' +
                '<th style="padding:0.75rem;text-align:center;font-size:0.8rem;white-space:nowrap;">Início</th>' +
                '<th style="padding:0.75rem;text-align:center;font-size:0.8rem;white-space:nowrap;">Fim</th>' +
                '<th style="padding:0.75rem;text-align:center;font-size:0.8rem;white-space:nowrap;min-width:80px;">Duração</th>' +
                '<th style="padding:0.75rem;text-align:center;font-size:0.8rem;white-space:nowrap;">Atividades</th>' +
                '<th style="padding:0.75rem;text-align:center;font-size:0.8rem;">Status</th>' +
                '<th style="padding:0.75rem;text-align:right;font-size:0.8rem;">Pontos</th>' +
            '</tr></thead>' +
            '<tbody>' +
                linhasProdutos +
                '<tr style="background:rgba(10,77,60,0.12);border-top:2px solid var(--primary);">' +
                    '<td colspan="4" style="padding:0.75rem;font-weight:700;font-size:0.9rem;">TOTAIS DO PERÍODO</td>' +
                    '<td style="padding:0.75rem;text-align:center;font-size:0.82rem;color:var(--text-muted);font-family:var(--code-font);">~' + duracaoMedia + (duracaoMedia !== '—' ? ' d' : '') + '</td>' +
                    '<td style="padding:0.75rem;text-align:center;font-weight:700;">' + totalAtividades + '</td>' +
                    '<td style="padding:0.75rem;text-align:center;font-size:0.82rem;color:var(--text-muted);">' + finalizados.length + ' finalizado(s)</td>' +
                    '<td style="padding:0.75rem;text-align:right;font-family:var(--code-font);color:var(--accent);font-weight:700;font-size:1.2rem;">' + pontosFinalizados.toFixed(1) + '</td>' +
                '</tr>' +
            '</tbody>' +
        '</table></div></div>';

    document.getElementById('relatorioData').innerHTML = html;
}

function toggleRow(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

function cardKpi(label, valor, cor) {
    return '<div style="background:var(--bg-dark);padding:1rem;border-radius:8px;text-align:center;">' +
        '<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.25rem;">' + label + '</div>' +
        '<div style="font-size:2rem;font-weight:700;color:' + cor + ';font-family:var(--code-font);">' + valor + '</div>' +
    '</div>';
}

// ─── RELATÓRIO DA EQUIPE ────────────────────────────────────────────────
function renderEquipe(produtos, dataIni, dataFim, feriados) {
    var diasUteis = calcDiasUteis(dataIni, dataFim, feriados);

    // Agrupar por servidor
    var porServidor = {};
    for (var i = 0; i < produtos.length; i++) {
        var p   = produtos[i];
        var sid = p.servidorId;
        if (!porServidor[sid]) porServidor[sid] = { pontos: 0, pontosFinalizados: 0, produtosTotal: 0, finalizados: 0, andamento: 0, duracoes: [] };
        var pts = ptsProduto(p);
        porServidor[sid].produtosTotal++;
        porServidor[sid].pontos += pts;
        if (resolverStatus(p) === 'finalizado') {
            porServidor[sid].pontosFinalizados += pts;
            porServidor[sid].finalizados++;
            if (p.dataInicio && p.dataFim) {
                var dIni = new Date(p.dataInicio + 'T00:00:00');
                var dFim = new Date(p.dataFim    + 'T00:00:00');
                porServidor[sid].duracoes.push(Math.max(1, Math.round((dFim - dIni) / 86400000) + 1));
            }
        } else {
            porServidor[sid].andamento++;
        }
    }

    var linhas = [];
    for (var i = 0; i < colaboradores.length; i++) {
        var srv  = colaboradores[i];
        var d    = porServidor[srv.id] || { pontos: 0, pontosFinalizados: 0, produtosTotal: 0, finalizados: 0, andamento: 0 };
        var aus  = calcAusencias(srv.id, dataIni, dataFim);
        var dias = calcDiasTrabalhados(srv.id, dataIni, dataFim);
        if (dias < 0) dias = 0;
        var media = dias > 0 ? (d.pontosFinalizados / dias).toFixed(2) : '0.00';
        var bench = (window.BENCHMARK_AREA || {})[srv.area] || 8;
        var cor   = parseFloat(media) >= bench ? 'var(--success)' :
                    parseFloat(media) >= bench * 0.8 ? 'var(--warning)' : 'var(--danger)';
        var perc  = bench > 0 ? Math.min(100, (parseFloat(media) / bench) * 100).toFixed(0) : 0;
        var durs = d.duracoes || [];
        var duracaoMedia = durs.length > 0
            ? (durs.reduce(function(s,v){ return s+v; }, 0) / durs.length).toFixed(1)
            : null;
        linhas.push({ srv: srv, d: d, dias: dias, media: parseFloat(media), bench: bench, cor: cor, perc: perc, duracaoMedia: duracaoMedia });
    }

    // Ordenar por pontos finalizados decrescente
    linhas.sort(function(a, b) { return b.d.pontosFinalizados - a.d.pontosFinalizados; });

    // ── KPIs de topo ────────────────────────────────────────────────────
    var totalPts       = linhas.reduce(function(s,l){ return s + l.d.pontosFinalizados; }, 0);
    var totalAndamento = linhas.reduce(function(s,l){ return s + l.d.andamento; }, 0);
    var totalFinaliz   = linhas.reduce(function(s,l){ return s + l.d.finalizados; }, 0);
    var totalNaoConc   = linhas.reduce(function(s,l){ return s + (l.d.naoConcluido||0); }, 0);
    var totalProdos    = linhas.reduce(function(s,l){ return s + l.d.produtosTotal; }, 0);
    var mediaGeral     = linhas.length > 0 ? (totalPts / linhas.length).toFixed(2) : '0.00';

    var mediasMec  = linhas.filter(function(l){ return l.srv.area === 'Mecânica'; });
    var mediasElet = linhas.filter(function(l){ return l.srv.area === 'Eletrônica'; });
    var ptsMec  = mediasMec.reduce(function(s,l){ return s + l.d.pontosFinalizados; }, 0);
    var ptsElet = mediasElet.reduce(function(s,l){ return s + l.d.pontosFinalizados; }, 0);
    var mediaMec  = mediasMec.length  > 0 ? (ptsMec  / mediasMec.length).toFixed(2)  : '0.00';
    var mediaElet = mediasElet.length > 0 ? (ptsElet / mediasElet.length).toFixed(2) : '0.00';

    // Dur. Média Diária Equipe: Σ médias diárias individuais ÷ servidores com registro
    var somaMediasDiarias  = 0;
    var srvsComDados       = 0;
    linhas.forEach(function(l) {
        if (l.dias > 0) { somaMediasDiarias += l.media; srvsComDados++; }
    });
    var duracaoMediaDiaria = srvsComDados > 0
        ? (somaMediasDiarias / srvsComDados).toFixed(2) + ' pts/dia'
        : '—';

    // Dur. Média dos Produtos: Σ dias corridos dos finalizados ÷ total finalizados
    var somaDiasProd = 0;
    var qtdProdFin   = 0;
    produtos.forEach(function(p) {
        if (resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim) {
            var dI = new Date(p.dataInicio + 'T00:00:00');
            var dF = new Date(p.dataFim    + 'T00:00:00');
            somaDiasProd += Math.max(1, Math.round((dF - dI) / 86400000) + 1);
            qtdProdFin++;
        }
    });
    var duracaoMediaProd = qtdProdFin > 0
        ? (somaDiasProd / qtdProdFin).toFixed(1) + ' dias'
        : '—';

    var kpisHtml =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.5rem;">' +
            cardKpi('Total Servidores',        linhas.length,       'var(--text-primary)') +
            cardKpi('Total Produtos',          totalProdos,         'var(--text-secondary)') +
            cardKpi('Em Andamento',            totalAndamento,      'var(--warning)') +
            cardKpi('Finalizados',             totalFinaliz,        'var(--success)') +
            cardKpi('Não Concluídos',          totalNaoConc,        '#818cf8') +
            cardKpi('Média Geral',             mediaGeral,          'var(--accent)') +
            cardKpi('Média Mecânica',          mediaMec,            'var(--primary-light)') +
            cardKpi('Média Eletrônica',        mediaElet,           'var(--secondary-light)') +
            cardKpi('Pontuação média equipe/dia', duracaoMediaDiaria,  'var(--accent)') +
            cardKpi('Dur. Média dos Produtos',    duracaoMediaProd,    'var(--secondary-light)') +
        '</div>';

    // ── Tabela ───────────────────────────────────────────────────────────
    // Média de pontos para coluna Desempenho Relativo
    var mediaPtsEquipe = linhas.length > 0 ? totalPts / linhas.length : 0;

    var tbody = '';
    for (var i = 0; i < linhas.length; i++) {
        var l = linhas[i];

        var vsHtml;
        if (mediaPtsEquipe === 0 || l.d.pontosFinalizados === 0) {
            vsHtml = '<span style="color:var(--text-muted);">—</span>';
        } else {
            var diff   = (l.d.pontosFinalizados - mediaPtsEquipe) / mediaPtsEquipe * 100;
            var sinal  = diff >= 0 ? '+' : '';
            var corVs  = diff >= 0 ? 'var(--success)' : 'var(--danger)';
            vsHtml = '<span style="font-weight:700;font-family:var(--code-font);color:' + corVs + ';">' + sinal + diff.toFixed(1) + '%</span>';
        }

        var duracaoHtml = l.duracaoMedia
            ? '<span style="font-family:var(--code-font);font-weight:700;color:var(--text-secondary);">' + l.duracaoMedia + ' d</span>'
            : '<span style="color:var(--text-muted);">—</span>';

        tbody +=
            '<tr style="border-bottom:1px solid var(--border);">' +
                '<td style="padding:0.65rem 0.75rem;"><span style="font-family:var(--code-font);font-size:0.8rem;background:var(--bg-light);padding:0.15rem 0.45rem;border-radius:4px;">P' + l.srv.ponto + '</span></td>' +
                '<td style="padding:0.65rem 0.75rem;font-weight:600;font-size:0.88rem;">' + l.srv.nome + '</td>' +
                '<td style="padding:0.65rem 0.75rem;font-size:0.82rem;color:var(--text-muted);">' + l.srv.area + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;font-weight:600;">' + (l.d.produtosTotal > 0 ? l.d.produtosTotal : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;">' + l.dias + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;">' + (l.d.andamento > 0 ? '<span style="color:var(--warning);font-weight:600;">' + l.d.andamento + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;">' + (l.d.finalizados > 0 ? '<span style="color:var(--success);font-weight:600;">' + l.d.finalizados + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;">' + ((l.d.naoConcluido||0) > 0 ? '<span style="color:#818cf8;font-weight:600;">' + l.d.naoConcluido + '</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:center;">' + duracaoHtml + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:right;font-family:var(--code-font);font-weight:700;color:var(--success);">' + l.d.pontosFinalizados.toFixed(1) + '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:right;">' +
                    '<span style="font-family:var(--code-font);font-weight:700;color:' + l.cor + ';">' + l.media.toFixed(2) + '</span>' +
                    '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.1rem;">' + l.perc + '% da meta</div>' +
                '</td>' +
                '<td style="padding:0.65rem 0.75rem;text-align:right;">' + vsHtml + '</td>' +
            '</tr>';
    }

    var html =
        '<h3 style="font-size:1.1rem;font-weight:700;margin-bottom:1.25rem;">Equipe · ' + fmtDate(dataIni) + ' → ' + fmtDate(dataFim) + '</h3>' +
        kpisHtml +
        '<div style="overflow-x:auto;">' +
        '<table style="width:100%;min-width:900px;" id="tabelaRelatorio">' +
            '<thead><tr style="background:var(--bg-dark);border-bottom:2px solid var(--border);">' +
                '<th style="padding:0.65rem 0.75rem;text-align:left;font-size:0.78rem;">Ponto</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:left;font-size:0.78rem;">Servidor</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:left;font-size:0.78rem;">Área</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Total Prod.</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Dias Trab.</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Em Andamento</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Finalizados</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Não Concluídos</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:center;font-size:0.78rem;">Dur. Média</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:right;font-size:0.78rem;">Pts Finalizados</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:right;font-size:0.78rem;">Média/Dia</th>' +
                '<th style="padding:0.65rem 0.75rem;text-align:right;font-size:0.78rem;">Desempenho Relativo</th>' +
            '</tr></thead>' +
            '<tbody>' + tbody + '</tbody>' +
        '</table></div>';

    document.getElementById('relatorioData').innerHTML = html;
}

// ─── Carrega SheetJS dinamicamente se necessário ────────────────────────────
function carregarSheetJS(callback) {
    if (window.XLSX) { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload  = callback;
    s.onerror = () => Notify.error('Erro ao carregar biblioteca de exportação.');
    document.head.appendChild(s);
}

// ─── EXPORTAÇÕES ────────────────────────────────────────────────────────
function exportarExcel() {
    if (!relatorioGerado || !produtosData.length) { Notify.warning('Gere um relatório primeiro!'); return; }
    const tipo = document.getElementById('tipoRelatorio').value;
    if (tipo === 'equipe') { exportarExcelEquipe(); return; }

    carregarSheetJS(() => {
        const servidor     = CurrentServer.get();
        const nomeServidor = servidor ? servidor.nome : 'Servidor';
        const ponto        = servidor ? servidor.ponto : '-';
        const area         = servidor ? servidor.area : '-';
        const dataExport   = new Date().toLocaleDateString('pt-BR');
        const mesAno       = document.getElementById('selectMes') && document.getElementById('selectAno')
            ? `${document.getElementById('selectMes').options[document.getElementById('selectMes').selectedIndex]?.text || ''} / ${document.getElementById('selectAno').value || ''}`
            : dataExport;

        // ── Recalcular KPIs ──────────────────────────────────────────────
        const feriadosArr  = DataStore.getFeriados ? DataStore.getFeriados() : [];
        const dataIni      = document.getElementById('dataInicio').value;
        const dataFimVal   = document.getElementById('dataFim').value;
        const diasUteis    = calcDiasUteis(dataIni, dataFimVal, feriadosArr);
        const aus          = calcAusencias(servidor ? servidor.id : 0, dataIni, dataFimVal);
        const diasTrab     = calcDiasTrabalhados(servidor ? servidor.id : 0, dataIni, dataFimVal);
        const benchmark    = servidor ? ((window.BENCHMARK_AREA || {})[servidor.area] || 8) : 8;

        const finalizados    = produtosData.filter(p => resolverStatus(p) === 'finalizado');
        const emAndamento    = produtosData.filter(p => resolverStatus(p) === 'em-andamento');
        const naoConcluidos  = produtosData.filter(p => resolverStatus(p) === 'nao-concluido');
        const pontosFinalizados = finalizados.reduce((s,p) => s + ptsProduto(p), 0);
        const pontosTotais      = produtosData.reduce((s,p) => s + ptsProduto(p), 0);
        const prodDiaria        = diasTrab > 0 ? (pontosFinalizados / diasTrab).toFixed(2) : '0.00';
        const percBench         = benchmark > 0 ? ((parseFloat(prodDiaria) / benchmark) * 100).toFixed(0) : 0;

        const duracoes = finalizados
            .filter(p => p.dataInicio && p.dataFim)
            .map(p => {
                const dI = new Date(p.dataInicio+'T00:00:00');
                const dF = new Date(p.dataFim+'T00:00:00');
                return Math.max(1, Math.round((dF-dI)/86400000)+1);
            });
        const duracaoMedia = duracoes.length > 0
            ? (duracoes.reduce((s,d)=>s+d,0)/duracoes.length).toFixed(1)
            : '-';

        // ── Aba 1: Produtos ──────────────────────────────────────────────
        const cab1 = ['Código','Produto / Descrição','Observações','Data Início','Data Fim','Duração (dias)','Status','Nº Atividades','Pontos'];
        const rows1 = produtosData.map(p => {
            let duracao = '';
            if (p.dataInicio && p.dataFim) {
                const dIni = new Date(p.dataInicio + 'T00:00:00');
                const dFim = new Date(p.dataFim    + 'T00:00:00');
                duracao = Math.max(1, Math.round((dFim - dIni) / 86400000) + 1);
            }
            return [
                p.codigo,
                p.nome,
                p.observacoes || '',
                p.dataInicio ? new Date(p.dataInicio+'T00:00:00').toLocaleDateString('pt-BR') : '-',
                p.dataFim    ? new Date(p.dataFim   +'T00:00:00').toLocaleDateString('pt-BR') : 'Em andamento',
                duracao,
                resolverStatus(p) === 'finalizado' ? 'Finalizado' : resolverStatus(p) === 'nao-concluido' ? 'Não Concluído' : 'Em Andamento',
                (p.atividades || []).length,
                +ptsProduto(p).toFixed(1)
            ];
        });
        // Linha de totais
        rows1.push([
            'TOTAIS', '', '',  '', '',
            duracoes.length > 0 ? `Média: ${duracaoMedia} d` : '',
            `Finalizados: ${finalizados.length} | Em And.: ${emAndamento.length} | Não Conc.: ${naoConcluidos.length}`,
            produtosData.reduce((s,p)=>s+(p.atividades||[]).length,0),
            +pontosFinalizados.toFixed(1)
        ]);

        // ── Aba 2: Atividades ────────────────────────────────────────────
        const cab2 = ['Cód. Produto','Produto','Cód. Atividade','Descrição da Atividade','Área','Peso','Complexidade','Pontos','Observação'];
        const rows2 = [];
        produtosData.forEach(p => {
            (p.atividades || []).forEach(a => {
                rows2.push([
                    p.codigo, p.nome, a.codigo, a.atividade,
                    a.areaAtividade || a.categoria,
                    a.peso, a.complexidade, +(a.pontos||0),
                    a.observacao || ''
                ]);
            });
        });
        rows2.push(['TOTAL','','','','','','',+produtosData.reduce((s,p)=>s+(p.atividades||[]).reduce((ss,a)=>ss+(a.pontos||0),0),0).toFixed(1),'']);

        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.aoa_to_sheet([
            [`CEQUI — Relatório de Produtos`],
            [`Servidor: ${nomeServidor}  |  Ponto: ${ponto}  |  Área: ${area}`],
            [`Período: ${mesAno}  |  Exportado em: ${dataExport}`],
            [],
            ['INDICADORES DO PERÍODO'],
            ['Dias Úteis', diasUteis, 'Dias Trabalhados', diasTrab, 'Ausências', aus.justificadas, 'Dispensas', aus.dispensas],
            ['Pts Finalizados', +pontosFinalizados.toFixed(1), 'Pts Totais', +pontosTotais.toFixed(1), 'Prod. Média/Dia', +parseFloat(prodDiaria), '% da Meta', +percBench],
            ['Total Produtos', produtosData.length, 'Finalizados', finalizados.length, 'Em Andamento', emAndamento.length, 'Não Concluídos', naoConcluidos.length],
            ['Benchmark', benchmark, 'Dur. Média Produtos (dias)', +parseFloat(duracaoMedia) || '-', '', '', '', ''],
            [],
            cab1,
            ...rows1
        ]);
        ws1['!cols'] = [10,45,30,14,14,14,18,14,10].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws1, 'Produtos');

        const ws2 = XLSX.utils.aoa_to_sheet([
            [`CEQUI — Atividades Detalhadas`],
            [`Servidor: ${nomeServidor}  |  Período: ${mesAno}`],
            [],
            cab2,
            ...rows2
        ]);
        ws2['!cols'] = [12,40,16,60,30,8,12,10,30].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws2, 'Atividades');

        XLSX.writeFile(wb, `CEQUI_Relatorio_${nomeServidor.split(' ')[0]}_${new Date().toISOString().slice(0,10)}.xlsx`);
        Notify.success('Excel exportado com sucesso!');
    });
}

function exportarExcelEquipe() {
    carregarSheetJS(() => {
        const dataIni    = document.getElementById('dataInicio').value;
        const dataFim    = document.getElementById('dataFim').value;
        const dataExport = new Date().toLocaleDateString('pt-BR');
        const periodo    = new Date(dataIni+'T12:00:00').toLocaleDateString('pt-BR') + ' → ' + new Date(dataFim+'T12:00:00').toLocaleDateString('pt-BR');

        // Recalcular dados por servidor
        const porServidor = {};
        produtosData.forEach(p => {
            const sid = p.servidorId;
            if (!porServidor[sid]) porServidor[sid] = { pontos: 0, pontosFinalizados: 0, produtosTotal: 0, finalizados: 0, andamento: 0, duracoes: [] };
            const pts = ptsProduto(p);
            porServidor[sid].pontos += pts;
            porServidor[sid].produtosTotal++;
            if (resolverStatus(p) === 'finalizado') {
                porServidor[sid].pontosFinalizados += pts;
                porServidor[sid].finalizados++;
                if (p.dataInicio && p.dataFim) {
                    const dIni = new Date(p.dataInicio+'T00:00:00');
                    const dFim = new Date(p.dataFim+'T00:00:00');
                    porServidor[sid].duracoes.push(Math.max(1, Math.round((dFim-dIni)/86400000)+1));
                }
            } else if (resolverStatus(p) === 'nao-concluido') {
                porServidor[sid].naoConcluido = (porServidor[sid].naoConcluido||0)+1;
            } else {
                porServidor[sid].andamento++;
            }
        });

        const linhasData = colaboradores.map(srv => {
            const d   = porServidor[srv.id] || { pontos:0, pontosFinalizados:0, produtosTotal:0, finalizados:0, andamento:0, duracoes:[] };
            let dias  = calcDiasTrabalhados(srv.id, dataIni, dataFim);
            if (dias < 0) dias = 0;
            const media = dias > 0 ? +(d.pontosFinalizados / dias).toFixed(2) : 0;
            const bench = (window.BENCHMARK_AREA || {})[srv.area] || 8;
            const perc  = bench > 0 ? Math.min(100, (media / bench) * 100).toFixed(0) : 0;
            const durs  = d.duracoes || [];
            const duracaoMedia = durs.length > 0 ? +(durs.reduce((s,v)=>s+v,0) / durs.length).toFixed(1) : '';
            return { srv, d, dias, media, bench, perc, duracaoMedia };
        });

        linhasData.sort((a, b) => b.d.pontosFinalizados - a.d.pontosFinalizados);

        const totalPts       = linhasData.reduce((s,l)=>s+l.d.pontosFinalizados,0);
        const totalAndamento = linhasData.reduce((s,l)=>s+l.d.andamento,0);
        const totalFinaliz   = linhasData.reduce((s,l)=>s+l.d.finalizados,0);
        const totalNaoConc   = linhasData.reduce((s,l)=>s+(l.d.naoConcluido||0),0);
        const totalProdos    = linhasData.reduce((s,l)=>s+l.d.produtosTotal,0);
        const mediaGeral     = linhasData.length > 0 ? (totalPts / linhasData.length).toFixed(2) : '0.00';
        const mec  = linhasData.filter(l => l.srv.area === 'Mecânica');
        const elet = linhasData.filter(l => l.srv.area === 'Eletrônica');
        const mediaMec  = mec.length  > 0 ? (mec.reduce((s,l)=>s+l.d.pontosFinalizados,0)  / mec.length).toFixed(2)  : '0.00';
        const mediaElet = elet.length > 0 ? (elet.reduce((s,l)=>s+l.d.pontosFinalizados,0) / elet.length).toFixed(2) : '0.00';
        const mediaPtsEquipe = linhasData.length > 0 ? totalPts / linhasData.length : 0;

        // Dur. Média Diária Equipe
        let somaMediasDiarias = 0, srvsComDados = 0;
        linhasData.forEach(l => { if (l.dias > 0) { somaMediasDiarias += l.media; srvsComDados++; } });
        const duracaoMediaDiaria = srvsComDados > 0 ? +(somaMediasDiarias / srvsComDados).toFixed(2) : '';

        // Dur. Média dos Produtos (dias corridos)
        let somaDiasProd = 0, qtdProdFin = 0;
        produtosData.forEach(p => {
            if (resolverStatus(p) === 'finalizado' && p.dataInicio && p.dataFim) {
                const dI = new Date(p.dataInicio+'T00:00:00');
                const dF = new Date(p.dataFim+'T00:00:00');
                somaDiasProd += Math.max(1, Math.round((dF-dI)/86400000)+1);
                qtdProdFin++;
            }
        });
        const duracaoMediaProd = qtdProdFin > 0 ? +(somaDiasProd / qtdProdFin).toFixed(1) : '';

        const cab = ['Ponto','Servidor','Área','Total Prod.','Dias Trab.','Em Andamento','Finalizados','Não Concluídos','Dur. Média (dias)','Pts Finalizados','Média/Dia','% da Meta','Desempenho Relativo'];
        const rows = linhasData.map(l => {
            let vs = '';
            if (mediaPtsEquipe > 0 && l.d.pontosFinalizados > 0) {
                const diff = (l.d.pontosFinalizados - mediaPtsEquipe) / mediaPtsEquipe * 100;
                vs = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
            }
            return [
                'P' + l.srv.ponto, l.srv.nome, l.srv.area,
                l.d.produtosTotal || 0, l.dias,
                l.d.andamento || 0, l.d.finalizados || 0, l.d.naoConcluido || 0,
                l.duracaoMedia, +l.d.pontosFinalizados.toFixed(1),
                l.media, l.perc + '%', vs
            ];
        });
        rows.push(['TOTAIS','','', totalProdos, linhasData.reduce((s,l)=>s+l.dias,0),
            totalAndamento, totalFinaliz, totalNaoConc, '',
            +totalPts.toFixed(1), +parseFloat(mediaGeral), '', '']);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            [`CEQUI — Relatório da Equipe`],
            [`Período: ${periodo}  |  Exportado em: ${dataExport}`],
            [],
            ['INDICADORES GERAIS'],
            ['Total Servidores', linhasData.length, 'Total Produtos', totalProdos, 'Em Andamento', totalAndamento, 'Finalizados', totalFinaliz, 'Não Concluídos', totalNaoConc],
            ['Média Geral', +parseFloat(mediaGeral), 'Média Mecânica', +parseFloat(mediaMec), 'Média Eletrônica', +parseFloat(mediaElet), '', '', '', ''],
            ['Pontuação média equipe/dia', duracaoMediaDiaria ? duracaoMediaDiaria + ' pts/dia' : '—', 'Dur. Média dos Produtos', duracaoMediaProd ? duracaoMediaProd + ' dias' : '—', '', '', '', '', '', ''],
            [],
            cab,
            ...rows
        ]);
        ws['!cols'] = [8,30,14,12,12,14,12,16,18,16,12,12,12].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Equipe');

        XLSX.writeFile(wb, 'CEQUI_Equipe_' + new Date().toISOString().slice(0,10) + '.xlsx');
        Notify.success('Excel da equipe exportado!');
    });
}

function exportarCSVDetalhado() {
    if (!produtosData.length) { Notify.warning('Gere um relatório primeiro!'); return; }

    const servidor = CurrentServer.get();
    const nomeServidor = servidor ? servidor.nome : '';
    const ponto = servidor ? servidor.ponto : '';
    const area = servidor ? servidor.area : '';
    const dataExport = new Date().toLocaleDateString('pt-BR');

    const esc = v => {
        const s = String(v == null ? '' : v);
        return (s.includes(';') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const linhas = [
        // Cabeçalho informativo
        `sep=;`,
        `CEQUI - Relatório Detalhado de Atividades`,
        `Servidor;${esc(nomeServidor)};Ponto;${esc(ponto)};Área;${esc(area)}`,
        `Exportado em;${dataExport}`,
        ``,
        // Cabeçalho da tabela
        [
            'Código Produto',
            'Nome do Produto',
            'Data Início',
            'Data Fim',
            'Status',
            'Código Atividade',
            'Categoria',
            'Descrição da Atividade',
            'Área',
            'Peso',
            'Complexidade',
            'Pontos'
        ].map(esc).join(';')
    ];

    let totalGeral = 0;
    produtosData.forEach(p => {
        const status = p.dataFim ? 'Finalizado' : 'Em Andamento';
        const dtIni = p.dataInicio ? new Date(p.dataInicio+'T00:00:00').toLocaleDateString('pt-BR') : '';
        const dtFim = p.dataFim    ? new Date(p.dataFim+'T00:00:00').toLocaleDateString('pt-BR')    : 'Em andamento';
        (p.atividades || []).forEach(a => {
            totalGeral += a.pontos || 0;
            linhas.push([
                p.codigo,
                p.nome,
                dtIni,
                dtFim,
                status,
                a.codigo,
                a.categoria,
                a.atividade,
                a.areaAtividade || a.categoria,
                a.peso,
                a.complexidade,
                a.pontos
            ].map(esc).join(';'));
        });
    });

    linhas.push(``);
    linhas.push(`;;;;;;;;;Peso;Complexidade;Pontos`);
    linhas.push(`;;;;;;;;;;TOTAL GERAL;${totalGeral.toFixed(1)}`);

    const csv = linhas.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    Exporter.downloadFile(blob, `CEQUI_Atividades_${(nomeServidor.split(' ')[0]) || 'Relatorio'}_${new Date().toISOString().slice(0,10)}.csv`);
    Notify.success('CSV detalhado exportado com sucesso!');
}

