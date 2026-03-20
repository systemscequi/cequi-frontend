/**
 * CEQUI - Dashboard
 * Lógica da página dashboard com cálculos reais e resumo de presença
 * Filtros por servidor e por mês selecionado
 */

let currentServerId = null;
let produtos = [];
let atividades = [];
let currentMesAno = null; // "YYYY-MM"
let filtroProdutoId = null; // null = todas as atividades

document.addEventListener('DOMContentLoaded', async () => {
    await init();
});

async function init() {
    try {
        initMonthSelect();
        await loadServidores();

        // Controle de acesso: user comum só vê o próprio servidor
        const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
        const isAdmin = session && session.role === 'admin';

        if (!isAdmin && session) {
            // Ocultar apenas o seletor de servidor para usuário comum — mês/ano permanecem
            const serverGroup = document.getElementById('serverGroup');
            if (serverGroup) serverGroup.style.display = 'none';

            currentServerId = session.userId;
            const servidor = (window.MOCK_COLABORADORES || []).find(s => s.id === session.userId);
            if (servidor) CurrentServer.set(servidor);
            await loadDashboardData(currentServerId);
        } else {
            const savedServer = CurrentServer.get();
            if (savedServer) {
                currentServerId = savedServer.id;
                document.getElementById('serverSelect').value = savedServer.id;
                await loadDashboardData(currentServerId);
            }
        }

        setupEventListeners();
    } catch (error) {
        console.error('Erro ao inicializar dashboard:', error);
        Notify.error('Erro ao carregar dados do dashboard');
    }
}

// ─── Popula seletores de Mês e Ano separados ─────────────────────────
function initMonthSelect() {
    const selMes = document.getElementById('monthSelect');
    const selAno = document.getElementById('yearSelect');
    if (!selMes || !selAno) return;

    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1; // 1-12
    const anoAtual = hoje.getFullYear();

    // Meses
    const meses = [
        'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
        'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
    ];
    selMes.innerHTML = meses.map((m, idx) =>
        `<option value="${String(idx + 1).padStart(2, '0')}"${idx + 1 === mesAtual ? ' selected' : ''}>${m}</option>`
    ).join('');

    // Anos: ano atual e os 2 anteriores
    const anos = [anoAtual, anoAtual - 1, anoAtual - 2];
    selAno.innerHTML = anos.map(a =>
        `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`
    ).join('');

    // Mês atual como padrão
    currentMesAno = `${anoAtual}-${String(mesAtual).padStart(2, '0')}`;
}

// ─── Retorna "YYYY-MM" com base nos dois selects ──────────────────────
function getSelectedMesAno() {
    const mes = document.getElementById('monthSelect')?.value;
    const ano = document.getElementById('yearSelect')?.value;
    if (mes && ano) return `${ano}-${mes}`;
    return currentMesAno;
}

// ─── Filtra produtos pelo mês selecionado ────────────────────────────
// Um produto é "do mês" se sua data de início está dentro do mês,
// ou se está em andamento naquele mês (início <= fim do mês e sem data fim ou data fim >= início do mês)
function filtrarProdutosPorMes(todosProdutos, mesAno) {
    // Regra: filtrar pelo mês de INÍCIO do produto (dataInicio.substring)
    return todosProdutos.filter(p => {
        if (!p.dataInicio) return false;
        return p.dataInicio.substring(0, 7) === mesAno;
    });
}

async function loadServidores() {
    try {
        const result = await MockAPI.getColaboradores();
        
        if (result.success) {
            const select = document.getElementById('serverSelect');
            select.innerHTML = '<option value="">Selecione um servidor...</option>';
            
            result.data.forEach(servidor => {
                const option = document.createElement('option');
                option.value = servidor.id;
                option.textContent = `${servidor.nome} (Ponto ${servidor.ponto})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar servidores:', error);
    }
}

async function loadDashboardData(servidorId) {
    if (!servidorId) return;

    // Se backend ativo, sincronizar presença do servidor selecionado
    if (DataStore.backendAtivo && typeof MockAPI.getPresenca === 'function') {
        try {
            const pres = await MockAPI.getPresenca(servidorId);
            if (pres.success) DataStore.cachePresenca(servidorId, pres.data);
        } catch (e) { /* usa cache existente */ }
    }
    
    // Resetar filtro de produto ao recarregar dados
    filtroProdutoId = null;
    const labelEl = document.getElementById('filtroAtivLabel');
    const btnEl   = document.getElementById('btnLimparFiltroAtiv');
    if (labelEl) labelEl.style.display = 'none';
    if (btnEl)   btnEl.style.display   = 'none';

    try {
        const produtosResult = await MockAPI.getProdutos(servidorId);
        
        if (produtosResult.success) {
            const mesAno = getSelectedMesAno();
            const todosProdutos = produtosResult.data;

            // Filtrar produtos pelo mês selecionado
            produtos = filtrarProdutosPorMes(todosProdutos, mesAno);

            atividades = [];
            produtos.forEach(produto => {
                if (produto.atividades) {
                    produto.atividades.forEach(ativ => {
                        atividades.push({
                            ...ativ,
                            produtoId:     produto.id,
                            produtoNome:   produto.nome,
                            produtoCodigo: produto.codigo
                        });
                    });
                }
            });
            
            updateResumoPresenca();
            updateStats();
            renderProducts();
            renderActivities();
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        Notify.error('Erro ao carregar dados do servidor');
    }
}

function updateResumoPresenca() {
    if (!currentServerId) return;
    
    const mesAno = getSelectedMesAno();
    const [ano, mes] = mesAno.split('-').map(Number);
    const dataRef = new Date(ano, mes - 1, 1);
    const mesLabel = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    document.getElementById('mesResumo').textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
    
    // Calcular dias úteis
    const diasUteis = window.PresencaManager 
        ? window.PresencaManager.calcularDiasUteis(mesAno) 
        : 20;
    
    // Obter dados de presença
    const presencaKey = `presenca_${currentServerId}`;
    const presencaData = DataStore.get(presencaKey) || {};
    const mesDados = presencaData[mesAno] || {};
    
    let diasTrabalhados = 0;
    let ausencias = 0;
    let dispensas = 0;
    
    for (let dia in mesDados) {
        if (mesDados[dia] === 'trabalhado') diasTrabalhados++;
        if (mesDados[dia] === 'ausente') ausencias++;
        if (mesDados[dia] === 'dispensa') dispensas++;
    }
    
    // Calcular taxa de presença
    const taxaPresenca = diasUteis > 0 
        ? ((diasTrabalhados / diasUteis) * 100).toFixed(1) + '%'
        : '0%';
    
    // Atualizar card de resumo
    document.getElementById('resumoDiasUteis').textContent = diasUteis;
    document.getElementById('resumoDiasTrabalhados').textContent = diasTrabalhados;
    document.getElementById('resumoAusencias').textContent = ausencias;
    document.getElementById('resumoDispensas').textContent = dispensas;
    document.getElementById('resumoTaxa').textContent = taxaPresenca;
    
    // Mostrar alerta apenas se for o mês atual e dias não registrados
    const hoje = new Date();
    const mesAtualAno = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const alertaDias = document.getElementById('alertaDias');
    if (mesAno === mesAtualAno && diasTrabalhados === 0 && hoje.getDate() > 5) {
        alertaDias.style.display = 'block';
    } else {
        alertaDias.style.display = 'none';
    }
}

function updateStats() {
    const mesAno = getSelectedMesAno();
    const [ano, mes] = mesAno.split('-').map(Number);
    const dataRef = new Date(ano, mes - 1, 1);
    const mesLabel = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    document.getElementById('periodoAtual').textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

    const diasUteis = window.PresencaManager 
        ? window.PresencaManager.calcularDiasUteis(mesAno) 
        : 20;
    document.getElementById('diasUteisTotal').textContent = diasUteis;

    // Dias trabalhados / ausências / dispensas do mês selecionado
    const presencaKey = `presenca_${currentServerId}`;
    const presencaData = DataStore.get(presencaKey) || {};
    const mesDados = presencaData[mesAno] || {};

    let diasTrabalhados = 0;
    let ausencias = 0;
    let dispensas = 0;
    for (let dia in mesDados) {
        if (mesDados[dia] === 'trabalhado') diasTrabalhados++;
        if (mesDados[dia] === 'ausente') ausencias++;
        if (mesDados[dia] === 'dispensa') dispensas++;
    }
    document.getElementById('diasTrabalhados').textContent = diasTrabalhados;
    const BENCH_DIA = 8;
    document.getElementById('pontosEsperados').textContent = (diasTrabalhados * BENCH_DIA).toFixed(2);

    let ausenciasText = '';
    if (ausencias > 0) ausenciasText += `${ausencias} ausência${ausencias > 1 ? 's' : ''}`;
    if (dispensas > 0) {
        if (ausenciasText) ausenciasText += ', ';
        ausenciasText += `${dispensas} dispensa${dispensas > 1 ? 's' : ''}`;
    }
    if (!ausenciasText) ausenciasText = 'Sem ausências';
    document.getElementById('ausencias').textContent = ausenciasText;

    // Produtos finalizados com dataFim dentro do mês selecionado
    const produtosFinalizados = produtos.filter(p => {
        if (resolverStatus(p) !== 'finalizado' || !p.dataFim) return false;
        return p.dataFim.substring(0, 7) === mesAno;
    });

    // PONTUAÇÃO FINALIZADA → card "Produtos Finalizados"
    let pontuacaoFinalizados = 0;
    produtosFinalizados.forEach(produto => {
        if (produto.atividades) {
            produto.atividades.forEach(ativ => { pontuacaoFinalizados += ativ.pontos || 0; });
        }
    });
    document.getElementById('produtosFinalizados').textContent = pontuacaoFinalizados.toFixed(2) + ' pts';
    document.getElementById('qtdProdutosFinalizados').textContent =
        `${produtosFinalizados.length} produto${produtosFinalizados.length !== 1 ? 's' : ''} finalizado${produtosFinalizados.length !== 1 ? 's' : ''}`;

    // PONTUAÇÃO TOTAL (em andamento + finalizados no mês) → card "Produtos em Andamento e Finalizados"
    let pontuacaoTotal = 0;
    produtos.forEach(produto => {
        if (produto.atividades) {
            produto.atividades.forEach(ativ => { pontuacaoTotal += ativ.pontos || 0; });
        }
    });
    document.getElementById('pontuacaoTotal').textContent = pontuacaoTotal.toFixed(2) + ' pts';

    // Contagem por status
    const qtdPorStatus = { 'em-andamento': 0, 'finalizado': 0 };
    produtos.forEach(p => { if (qtdPorStatus[p.status] !== undefined) qtdPorStatus[p.status]++; });
    document.getElementById('qtdAndamento').textContent   = qtdPorStatus['em-andamento'];
    document.getElementById('qtdFinalizados').textContent = qtdPorStatus['finalizado'];

    // Produtividade média diária (finalizados / dias trabalhados)
    const produtividadeMedia = diasTrabalhados > 0 
        ? (pontuacaoFinalizados / diasTrabalhados).toFixed(2) 
        : '0.00';
    document.getElementById('produtividadeMedia').textContent = produtividadeMedia;

    // Meta diária
    const servidor = (window.MOCK_COLABORADORES||[]).find(c => c.id === currentServerId);
    const metaDiaria = servidor ? ((window.BENCHMARK_AREA||{})[servidor.area] || 8) : 8;
    document.getElementById('metaDiaria').textContent = metaDiaria;

    // Desempenho Relativo — média de pontos finalizados de todos os servidores no mesmo mês
    try {
        const todosColabs = (window.MOCK_COLABORADORES||[]).filter(c => c.role !== 'admin');
        const todosProdutos = DataStore.getProdutos();
        const [anoM, mesM] = mesAno.split('-').map(Number);
        const inicioMes = new Date(anoM, mesM-1, 1);
        const fimMes    = new Date(anoM, mesM, 0);

        let somaPtsEquipe = 0;
        let countEquipe   = 0;
        todosColabs.forEach(col => {
            const prods = todosProdutos.filter(p => {
                if (p.servidorId !== col.id || p.status !== 'finalizado') return false;
                const ini = p.dataInicio ? new Date(p.dataInicio+'T00:00:00') : null;
                const fim = p.dataFim    ? new Date(p.dataFim+'T00:00:00')    : null;
                return ini && ini <= fimMes && fim && fim >= inicioMes;
            });
            const pts = prods.reduce((s,p) => s + (p.atividades||[]).reduce((sa,a) => sa+(a.pontos||0),0), 0);
            somaPtsEquipe += pts;
            countEquipe++;
        });

        const mediaEquipe = countEquipe > 0 ? somaPtsEquipe / countEquipe : 0;
        const elMedia = document.getElementById('vsEquipeMedia');
        const elValor = document.getElementById('vsEquipeValor');
        if (elMedia) elMedia.textContent = mediaEquipe.toFixed(1);

        if (elValor) {
            if (mediaEquipe === 0 || pontuacaoFinalizados === 0) {
                elValor.textContent = '—';
                elValor.style.color = '';
            } else {
                const diff  = (pontuacaoFinalizados - mediaEquipe) / mediaEquipe * 100;
                const sinal = diff >= 0 ? '+' : '';
                elValor.textContent = sinal + diff.toFixed(1) + '%';
                elValor.style.color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
            }
        }
    } catch(e) { console.warn('Desempenho Relativo erro:', e); }

    document.getElementById('changePontos').textContent = produtos.length > 0
        ? `${produtos.length} produto${produtos.length !== 1 ? 's' : ''}` : '-';

}

function renderProducts() {
    const container = document.getElementById('productsList');
    
    if (produtos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>Nenhum produto cadastrado</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = produtos.map(produto => {
        const statusClass = getStatusClass(produto.status);
        const statusText  = getStatusLabel(produto.status);
        const totalPontos = produto.atividades?.reduce((s,a) => s + (a.pontos||0), 0) || 0;
        const selecionado = filtroProdutoId === produto.id;
        
        let periodo = Utils.formatDate(produto.dataInicio);
        if (produto.dataFim) {
            periodo += ` → ${Utils.formatDate(produto.dataFim)}`;
        } else {
            periodo += ' → Em andamento';
        }
        
        return `
            <div class="product-item" id="prod-item-${produto.id}"
                 onclick="selecionarProduto(${produto.id})"
                 style="cursor:pointer;transition:all 0.2s;${selecionado ? 'border-left:3px solid var(--primary);background:var(--bg-light);' : 'border-left:3px solid transparent;'}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                    <div class="product-name" style="flex:1;">${produto.nome}</div>
                    <button onclick="event.stopPropagation(); abrirModalProduto(${produto.id})"
                            title="Editar produto"
                            style="background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:0.25rem 0.55rem;cursor:pointer;font-size:1.2rem;line-height:1;flex-shrink:0;transition:all 0.15s;"
                            onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'"
                            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">✏️</button>
                </div>
                <div class="product-meta">
                    <span>${periodo}</span>
                    <span style="color:var(--text-muted);font-size:0.78rem;">${totalPontos.toFixed(2)} pts</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Selecionar produto → filtra atividades ──────────────────────────
function selecionarProduto(prodId) {
    if (filtroProdutoId === prodId) {
        // Clicar no mesmo produto desmarca
        limparFiltroAtividades();
        return;
    }
    filtroProdutoId = prodId;
    const prod = produtos.find(p => p.id === prodId);

    // Destacar item selecionado
    document.querySelectorAll('.product-item').forEach(el => {
        el.style.borderLeft = '3px solid transparent';
        el.style.background = '';
    });
    const el = document.getElementById('prod-item-' + prodId);
    if (el) { el.style.borderLeft = '3px solid var(--primary)'; el.style.background = 'var(--bg-light)'; }

    // Mostrar label de filtro
    const label = document.getElementById('filtroAtivLabel');
    const btnLimpar = document.getElementById('btnLimparFiltroAtiv');
    if (label) { label.textContent = prod ? prod.nome : ''; label.style.display = 'inline-block'; }
    if (btnLimpar) btnLimpar.style.display = 'inline-block';

    renderActivities(document.getElementById('searchActivities')?.value || '');
}

function limparFiltroAtividades() {
    filtroProdutoId = null;
    document.querySelectorAll('.product-item').forEach(el => {
        el.style.borderLeft = '3px solid transparent';
        el.style.background = '';
    });
    const label = document.getElementById('filtroAtivLabel');
    const btnLimpar = document.getElementById('btnLimparFiltroAtiv');
    if (label) label.style.display = 'none';
    if (btnLimpar) btnLimpar.style.display = 'none';
    renderActivities(document.getElementById('searchActivities')?.value || '');
}

// ─── Helpers de status ────────────────────────────────────────────────
function getStatusClass(status) {
    const map = {
        'finalizado':    'completed',
        'em-andamento':  'in-progress',
        'nao-concluido': 'nao-concluido'
    };
    return map[status] || 'in-progress';
}

function getStatusLabel(status) {
    const map = {
        'finalizado':   'Finalizado',
        'em-andamento': 'Em Andamento'
    };
    return map[status] || status;
}

function getStatusAtivLabel(status) {
    const map = {
        'em-andamento': 'Em Andamento',
        'finalizado':   'Finalizado'
    };
    return map[status] || status;
}

function getStatusAtivClass(status) {
    const map = {
        'em-andamento':  'in-progress',
        'finalizado':    'completed',
        'nao-concluido': 'Não Concluído'
    };
    return map[status] || 'in-progress';
}

// ─── Modal de detalhes / edição do produto ───────────────────────────
function abrirModalProduto(id) {
    const prod = produtos.find(p => p.id === id);
    if (!prod) return;

    const totalPontos = prod.atividades?.reduce((s,a) => s + (a.pontos||0), 0) || 0;

    const atividadesHtml = (prod.atividades && prod.atividades.length > 0)
        ? prod.atividades.map((ativ, idx) => `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:0.5rem 0.75rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.82rem;">${ativ.codigo}</td>
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;">${Utils.truncate(ativ.atividade, 55)}</td>
                <td style="padding:0.5rem 0.75rem;text-align:center;font-size:0.82rem;">${ativ.complexidade}</td>
                <td style="padding:0.5rem 0.75rem;text-align:right;font-family:var(--code-font);color:var(--success);font-weight:700;">${(+ativ.pontos).toFixed(2)}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted);">Nenhuma atividade registrada</td></tr>`;

    const overlay = document.createElement('div');
    overlay.id = 'modalProduto';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;animation:fadeIn 0.2s ease;';

    overlay.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:14px;padding:2rem;max-width:820px;width:100%;max-height:90vh;overflow-y:auto;animation:scaleIn 0.25s ease;">

            <!-- Cabeçalho -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">PRODUTO</div>
                    <h2 style="color:var(--text-primary);font-size:1.3rem;margin-bottom:0.4rem;">${prod.nome}</h2>
                    <span class="code-badge">${prod.codigo}</span>
                </div>
                <button onclick="document.getElementById('modalProduto').remove()"
                        style="background:none;border:none;color:var(--text-muted);font-size:2rem;cursor:pointer;line-height:1;padding:0;flex-shrink:0;">×</button>
            </div>

            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
                <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">PERÍODO</div>
                    <div style="font-size:0.85rem;font-weight:600;">${Utils.formatDate(prod.dataInicio)}${prod.dataFim ? ' → '+Utils.formatDate(prod.dataFim) : ' → Andamento'}</div>
                </div>
                <div style="background:rgba(16,185,129,0.1);padding:0.9rem;border-radius:8px;border:1px solid var(--success);">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">PONTUAÇÃO</div>
                    <div style="font-size:1.4rem;font-weight:700;color:var(--success);font-family:var(--code-font);">${totalPontos.toFixed(2)} pts</div>
                </div>
                <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">ATIVIDADES</div>
                    <div style="font-size:1.4rem;font-weight:700;font-family:var(--code-font);">${prod.atividades?.length || 0}</div>
                </div>
            </div>

            <!-- Status do Produto -->
            <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
                <div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.4rem;">STATUS DO PRODUTO</div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;" id="statusBtnsProd">
                        ${['em-andamento','finalizado'].map(s => `
                        <button class="btn-status-prod"
                                data-prodid="${id}"
                                data-status="${s}"
                                style="padding:0.35rem 0.9rem;border-radius:20px;border:2px solid var(--border);background:${prod.status===s?'var(--primary)':'transparent'};color:${prod.status===s?'white':'var(--text-secondary)'};cursor:pointer;font-size:0.8rem;font-weight:${prod.status===s?'700':'400'};transition:all 0.15s;">
                            ${getStatusLabel(s)}
                        </button>`).join('')}
                    </div>
                </div>
            </div>

            ${prod.observacoes ? `
            <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;margin-bottom:1.5rem;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.4rem;">OBSERVAÇÕES</div>
                <div style="color:var(--text-secondary);font-size:0.9rem;">${prod.observacoes}</div>
            </div>` : ''}

            <!-- Tabela de atividades -->
            <h3 style="color:var(--text-primary);margin-bottom:0.75rem;font-size:1rem;">Atividades</h3>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid var(--border);">
                            <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.78rem;color:var(--text-muted);">Código</th>
                            <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.78rem;color:var(--text-muted);">Atividade</th>
                            <th style="padding:0.5rem 0.75rem;text-align:center;font-size:0.78rem;color:var(--text-muted);">Complex.</th>
                            <th style="padding:0.5rem 0.75rem;text-align:right;font-size:0.78rem;color:var(--text-muted);">Pontos</th>
                        </tr>
                    </thead>
                    <tbody>${atividadesHtml}</tbody>
                </table>
            </div>

            <!-- Rodapé -->
            <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;">
                <button onclick="document.getElementById('modalProduto').remove()"
                        class="btn btn-secondary">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Listener para botões de status do produto
    overlay.addEventListener('click', e => {
        const btn = e.target.closest('.btn-status-prod');
        if (!btn) return;
        const prodId = parseInt(btn.dataset.prodid);
        const status = btn.dataset.status;
        if (status === 'finalizado') {
            solicitarDataFim(prodId, btn);
        } else {
            alterarStatusProduto(prodId, status, btn);
        }
    });
}
function solicitarDataFim(prodId, btnEl) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;

    document.getElementById('modalDataFim')?.remove();

    const dataDefault = prod.dataFim || new Date().toISOString().split('T')[0];

    const box = document.createElement('div');
    box.id = 'modalDataFim';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
    box.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:340px;width:100%;animation:scaleIn 0.2s ease;">
            <h3 style="margin-bottom:0.5rem;font-size:1rem;">📅 Data de Conclusão</h3>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">Informe a data em que o produto foi finalizado.</p>
            <div style="position:relative;display:flex;align-items:center;margin-bottom:1rem;">
                <input type="date" id="inputDataFim" class="form-input"
                       value="${dataDefault}"
                       style="width:100%;padding-right:2.8rem;">
                <button type="button"
                        onclick="document.getElementById('inputDataFim').showPicker()"
                        style="position:absolute;right:0.75rem;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0;display:flex;align-items:center;transition:color 0.2s;"
                        onmouseover="this.style.color='var(--text-primary)'"
                        onmouseout="this.style.color='var(--text-muted)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                </button>
            </div>
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                <button onclick="document.getElementById('modalDataFim').remove()"
                        class="btn btn-secondary" style="font-size:0.85rem;">Cancelar</button>
                <button onclick="confirmarFinalizacao(${prodId}, document.getElementById('inputDataFim').value)"
                        class="btn btn-primary" style="font-size:0.85rem;">✓ Confirmar</button>
            </div>
        </div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
}

async function confirmarFinalizacao(prodId, dataFim) {
    if (!dataFim) { Notify.error('Informe a data de conclusão!'); return; }
    document.getElementById('modalDataFim')?.remove();

    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;
    prod.dataFim = dataFim;
    prod.status  = 'finalizado';
    await MockAPI.updateProduto(prodId, prod);

    // Atualizar botões de status no modal do produto
    const btns = document.querySelectorAll('#modalProduto button[data-status]');
    btns.forEach(b => {
        const active = b.dataset.status === 'finalizado';
        b.style.background = active ? 'var(--primary)' : 'transparent';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
        b.style.fontWeight  = active ? '700' : '400';
    });

    Notify.success('Produto finalizado!');
    await loadDashboardData(currentServerId);
}

// ─── Alterar status do PRODUTO ────────────────────────────────────────
async function alterarStatusProduto(prodId, novoStatus, btnEl) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;

    prod.status = novoStatus;
    // Se finalizado e sem dataFim, definir hoje
    if (novoStatus === 'finalizado' && !prod.dataFim) {
        prod.dataFim = new Date().toISOString().split('T')[0];
    }
    // Se voltou a em-andamento, limpar dataFim
    if (novoStatus === 'em-andamento') {
        prod.dataFim = null;
    }

    await MockAPI.updateProduto(prodId, prod);

    // Atualizar visual dos botões no modal
    const btns = btnEl.closest('div').querySelectorAll('button[data-status]');
    btns.forEach(b => {
        const active = b.dataset.status === novoStatus;
        b.style.background = active ? 'var(--primary)' : 'transparent';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
        b.style.fontWeight  = active ? '700' : '400';
    });

    Notify.success('Status atualizado!');
    await loadDashboardData(currentServerId);
}

// ─── Alterar status de uma ATIVIDADE ────────────────────────────────
async function alterarStatusAtividade(prodId, atividadeIdx, novoStatus) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod || !prod.atividades[atividadeIdx]) return;

    prod.atividades[atividadeIdx].status = novoStatus;
    await MockAPI.updateProduto(prodId, prod);

    Notify.success('Status da atividade atualizado!');
}

function renderActivities(searchTerm = '') {
    const tbody = document.getElementById('activitiesTable');
    
    if (atividades.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhuma atividade registrada</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Filtrar por produto selecionado
    let atividadesFiltradas = filtroProdutoId
        ? atividades.filter(a => a.produtoId === filtroProdutoId)
        : atividades;

    // Filtrar por busca
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        atividadesFiltradas = atividadesFiltradas.filter(ativ =>
            ativ.codigo.toLowerCase().includes(term) ||
            ativ.atividade.toLowerCase().includes(term) ||
            ativ.produtoNome.toLowerCase().includes(term) ||
            ativ.categoria.toLowerCase().includes(term)
        );
    }

    if (atividadesFiltradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-state-icon">📋</div><p>Nenhuma atividade encontrada</p></td></tr>`;
        return;
    }

    tbody.innerHTML = atividadesFiltradas.map((ativ, idx) => `
        <tr style="cursor:pointer;"
            onclick="abrirModalAtividade(${idx})"
            onmouseover="this.style.background='var(--bg-light)'"
            onmouseout="this.style.background=''">
            <td><span class="code-badge cat-${ativ.categoria}">${ativ.codigo}</span></td>
            <td>${Utils.truncate(ativ.atividade, 70)}</td>
            <td>${CATEGORIAS[ativ.categoria]?.nome || ativ.categoria}</td>
            <td>${ativ.complexidade}</td>
            <td><span class="points-cell">${(+ativ.pontos).toFixed(2)}</span></td>
        </tr>
    `).join('');
}

function getProdutoIdByCodigo(codigo) {
    const prod = produtos.find(p => p.codigo === codigo);
    return prod ? prod.id : null;
}

// ─── Modal de detalhe de UMA atividade ───────────────────────────────
function abrirModalAtividade(idxFiltrado) {
    // Reconstruir a lista filtrada (igual ao renderActivities)
    const searchTerm = document.getElementById('searchActivities')?.value || '';
    let lista = filtroProdutoId ? atividades.filter(a => a.produtoId === filtroProdutoId) : atividades;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        lista = lista.filter(a =>
            a.codigo.toLowerCase().includes(term) ||
            a.atividade.toLowerCase().includes(term) ||
            a.produtoNome.toLowerCase().includes(term) ||
            a.categoria.toLowerCase().includes(term)
        );
    }
    const ativ = lista[idxFiltrado];
    if (!ativ) return;

    // Encontrar índice da atividade dentro do produto para poder alterar status
    const prod = produtos.find(p => p.id === ativ.produtoId);
    const atividadeIdxNoProduto = prod
        ? prod.atividades.findIndex(a => a.codigo === ativ.codigo && a.pontos === ativ.pontos)
        : -1;

    const st = ativ.status || 'em-andamento';

    const overlay = document.createElement('div');
    overlay.id = 'modalAtividade';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;animation:fadeIn 0.2s ease;';

    overlay.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:14px;padding:2rem;max-width:560px;width:100%;animation:scaleIn 0.25s ease;">

            <!-- Cabeçalho -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
                <div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">ATIVIDADE</div>
                    <span class="code-badge cat-${ativ.categoria}" style="font-size:0.9rem;">${ativ.codigo}</span>
                </div>
                <button onclick="document.getElementById('modalAtividade').remove()"
                        style="background:none;border:none;color:var(--text-muted);font-size:2rem;cursor:pointer;line-height:1;padding:0;">×</button>
            </div>

            <!-- Descrição -->
            <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;margin-bottom:1rem;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.4rem;">DESCRIÇÃO</div>
                <div style="color:var(--text-primary);font-size:0.9rem;line-height:1.5;">${ativ.atividade}</div>
            </div>

            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
                <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">PESO</div>
                    <div style="font-size:1.4rem;font-weight:700;font-family:var(--code-font);color:var(--warning);">${ativ.peso}</div>
                </div>
                <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">COMPLEXIDADE</div>
                    <div style="font-size:1.4rem;font-weight:700;font-family:var(--code-font);color:var(--secondary-light);">${ativ.complexidade}</div>
                </div>
                <div style="background:rgba(16,185,129,0.1);padding:0.9rem;border-radius:8px;text-align:center;border:1px solid var(--success);">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">PONTOS</div>
                    <div style="font-size:1.4rem;font-weight:700;font-family:var(--code-font);color:var(--success);">${(+ativ.pontos).toFixed(2)}</div>
                </div>
            </div>

            <!-- Produto vinculado -->
            <div style="background:var(--bg-dark);padding:0.9rem;border-radius:8px;margin-bottom:1rem;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">PRODUTO VINCULADO</div>
                <div style="font-weight:600;color:var(--text-primary);">${ativ.produtoNome}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">${CATEGORIAS[ativ.categoria]?.nome || ativ.categoria}</div>
            </div>

            <div style="display:flex;justify-content:flex-end;">
                <button onclick="document.getElementById('modalAtividade').remove()" class="btn btn-secondary">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function alterarStatusAtivDash(prodId, atividadeIdx, novoStatus, btnEl) {
    if (atividadeIdx === -1) return;
    const prod = produtos.find(p => p.id === prodId);
    if (!prod || !prod.atividades[atividadeIdx]) return;

    prod.atividades[atividadeIdx].status = novoStatus;
    // Atualizar também no array local de atividades
    atividades.forEach(a => {
        if (a.produtoId === prodId && a.codigo === prod.atividades[atividadeIdx].codigo)
            a.status = novoStatus;
    });

    await MockAPI.updateProduto(prodId, prod);

    const btns = btnEl.closest('div').querySelectorAll('button[data-status]');
    btns.forEach(b => {
        const active = b.dataset.status === novoStatus;
        b.style.background = active ? 'var(--primary)' : 'transparent';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
        b.style.fontWeight  = active ? '700' : '400';
    });

    Notify.success('Status atualizado!');
}


function setupEventListeners() {
    document.getElementById('serverSelect').addEventListener('change', async function(e) {
        const servidorId = parseInt(e.target.value);
        
        if (servidorId) {
            currentServerId = servidorId;
            
            const servidor = MOCK_COLABORADORES.find(s => s.id === servidorId);
            if (servidor) {
                CurrentServer.set(servidor);
            }
            
            await loadDashboardData(servidorId);
        }
    });

    // Seletores de mês e ano: recarregar dashboard ao mudar
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect  = document.getElementById('yearSelect');
    const onPeriodChange = async function() {
        currentMesAno = getSelectedMesAno();
        if (currentServerId) await loadDashboardData(currentServerId);
    };
    if (monthSelect) monthSelect.addEventListener('change', onPeriodChange);
    if (yearSelect)  yearSelect.addEventListener('change', onPeriodChange);
    
    const searchInput = document.getElementById('searchActivities');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce((e) => {
            renderActivities(e.target.value);
        }, 300));
    }
}
