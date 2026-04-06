/**
 * CEQUI - Lista de Produtos
 */

let produtos = [];
let filtroStatus = 'todos';
let filtroMesAno = null;
let sortColuna = null;    // 'codigo' | 'duracao' | 'pontos'
let sortAsc    = true;

const STATUS_CYCLE = ['todos', 'em-andamento', 'finalizado', 'nao-concluido'];
const STATUS_LABELS = { 'todos':'Todos', 'em-andamento':'Em Andamento', 'finalizado':'Finalizado', 'nao-concluido':'Não Concluído' };

function sortListaProdutos(coluna) {
    if (coluna === 'status') {
        // Cicla entre os status
        const idx = STATUS_CYCLE.indexOf(filtroStatus);
        filtroStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        // Atualizar indicador visual
        ['codigo','duracao','pontos'].forEach(c => {
            const el = document.getElementById('sort-' + c);
            if (el) el.textContent = '';
        });
        const el = document.getElementById('sort-status');
        if (el) el.textContent = filtroStatus === 'todos' ? '' : ' (' + STATUS_LABELS[filtroStatus] + ')';
        renderizarTabela();
        return;
    }
    if (sortColuna === coluna) {
        sortAsc = !sortAsc;
    } else {
        sortColuna = coluna;
        sortAsc = true;
    }
    // Atualizar indicadores visuais
    ['codigo','duracao','pontos','status'].forEach(c => {
        const el = document.getElementById('sort-' + c);
        if (el) el.textContent = '';
    });
    const el = document.getElementById('sort-' + coluna);
    if (el) el.textContent = sortAsc ? ' ▲' : ' ▼';
    renderizarTabela();
}

document.addEventListener('DOMContentLoaded', async () => {
    initListaMesAno();
    await loadServidoresSelect();
    setupEventListeners();
});

async function loadServidoresSelect() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'admin';

    const result = isAdmin
        ? await MockAPI.getTodosColaboradores()
        : await MockAPI.getColaboradores();
    if (!result.success) return;

    const select = document.getElementById('serverSelect');
    const group  = document.getElementById('serverGroup');
    if (!select) return;

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = isAdmin
            ? 'Produtos Relacionados ao Colaborador'
            : 'Meus Produtos';
    }

    if (!isAdmin) {
        if (group) group.style.display = 'none';
        await loadProdutos();
        return;
    }

    select.innerHTML = '<option value="">Selecione um servidor...</option>';
    result.data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.nome} (Ponto ${s.ponto})`;
        select.appendChild(opt);
    });

    // Pré-selecionar servidor salvo — apenas se for um user da lista
    const saved = CurrentServer.get();
    const servidorPreSel = saved && result.data.find(s => s.id === saved.id);
    if (servidorPreSel) {
        select.value = servidorPreSel.id;
        CurrentServer.set(servidorPreSel);
    } else if (result.data.length > 0) {
        select.value = result.data[0].id;
        CurrentServer.set(result.data[0]);
    }

    await loadProdutos();

    select.addEventListener('change', async function () {
        const servidor = result.data.find(s => s.id === parseInt(this.value));
        if (servidor) {
            CurrentServer.set(servidor);
            await loadProdutos();
        }
    });
}

// ─── Inicializa seletores de mês/ano com o mês atual ─────────────────
function initListaMesAno() {
    const selMes = document.getElementById('listaMesSelect');
    const selAno = document.getElementById('listaAnoSelect');
    if (!selMes || !selAno) return;

    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    // Adicionar opção "Todos" como primeira opção se não existir
    if (!selMes.querySelector('option[value=""]')) {
        const optTodos = document.createElement('option');
        optTodos.value = '';
        optTodos.textContent = 'Todos os meses';
        selMes.insertBefore(optTodos, selMes.firstChild);
    }
    selMes.value = ''; // padrão: todos

    const anos = [];
    for (let a = 2026; a <= 2036; a++) anos.push(a);
    selAno.innerHTML = anos.map(a =>
        `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`
    ).join('');

    // Inicia sem filtro de mês
    filtroMesAno = null;
}

// ─── Aplica filtro de mês selecionado ────────────────────────────────
function limparFiltroMes() {
    filtroMesAno = null;
    renderizarTabela(document.getElementById('searchBox')?.value || '');
}

function aplicarFiltroMes() {
    const mes = document.getElementById('listaMesSelect')?.value;
    const ano = document.getElementById('listaAnoSelect')?.value;
    if (!ano) return;
    if (mes === '' || mes === undefined) {
        filtroMesAno = null; // todos os meses
    } else {
        filtroMesAno = `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    }
    renderizarTabela(document.getElementById('searchBox')?.value || '');
}

// ─── Filtra produtos pelo mês de início ─────────────────────────────
function filtrarProdutosPorMesLista(lista, mesAno) {
    if (!mesAno) return lista;
    return lista.filter(p => {
        if (!p.dataInicio) return false;
        return p.dataInicio.substring(0, 7) === mesAno;
    });
}

async function loadProdutos() {
    const server = CurrentServer.get();
    if (!server) {
        Notify.warning('Selecione um servidor primeiro!');
        setTimeout(() => window.location.href = '../index.html', 2000);
        return;
    }

    const result = await MockAPI.getProdutos(server.id);
    if (result.success) {
        produtos = result.data;
        renderizarTabela();
    }
}

function renderizarTabela(termo = '') {
    const tbody = document.getElementById('produtosTable');

    // Filtrar por mês primeiro
    let produtosFiltrados = filtrarProdutosPorMesLista(produtos, filtroMesAno);

    // Filtrar por status (usa status efetivo)
    if (filtroStatus !== 'todos') {
        produtosFiltrados = produtosFiltrados.filter(p => resolverStatus(p) === filtroStatus);
    }

    // Filtrar por busca
    if (termo) {
        const t = termo.toLowerCase();
        produtosFiltrados = produtosFiltrados.filter(p =>
            p.codigo.toLowerCase().includes(t) ||
            p.nome.toLowerCase().includes(t)
        );
    }

    if (produtosFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <p>Nenhum produto encontrado</p>
                </td>
            </tr>
        `;
        return;
    }

    // Ordenar
    if (sortColuna) {
        produtosFiltrados.sort((a, b) => {
            let va, vb;
            if (sortColuna === 'codigo') {
                va = a.codigo || '';
                vb = b.codigo || '';
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            if (sortColuna === 'duracao') {
                const getDias = p => {
                    if (!p.dataInicio || !p.dataFim) return -1;
                    return Math.round((new Date(p.dataFim) - new Date(p.dataInicio)) / 86400000) + 1;
                };
                va = getDias(a); vb = getDias(b);
                return sortAsc ? va - vb : vb - va;
            }
            if (sortColuna === 'pontos') {
                va = a.atividades?.reduce((s,x) => s + (x.pontos||0), 0) || 0;
                vb = b.atividades?.reduce((s,x) => s + (x.pontos||0), 0) || 0;
                return sortAsc ? va - vb : vb - va;
            }
            return 0;
        });
    } else {
        // Ordenar por data (mais recente primeiro) — padrão
        produtosFiltrados.sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    }

    tbody.innerHTML = produtosFiltrados.map(prod => {
        const numAtividades = prod.atividades?.length || 0;
        const totalPontos = prod.atividades?.reduce((sum, a) => sum + (a.pontos || 0), 0) || 0;
        const statusEfetivo = resolverStatus(prod);
        const statusClass   = (window.STATUS_MAP[statusEfetivo] || {classe:'in-progress'}).classe;
        const statusText    = (window.STATUS_MAP[statusEfetivo] || {label: statusEfetivo}).label;
        
        let periodo = Utils.formatDate(prod.dataInicio);
        if (prod.dataFim) {
            periodo += ' → ' + Utils.formatDate(prod.dataFim);
        } else {
            periodo += ' → Em andamento';
        }

        let duracaoDias = '—';
        if (prod.dataInicio && prod.dataFim) {
            const dIni = new Date(prod.dataInicio + 'T00:00:00');
            const dFim = new Date(prod.dataFim    + 'T00:00:00');
            duracaoDias = Math.max(1, Math.round((dFim - dIni) / 86400000) + 1) + ' d';
        }

        return `
            <tr style="cursor:pointer;" onclick="abrirModalDetalhe(produtos.find(p=>p.id===${prod.id}))" onmouseover="this.style.background='var(--bg-light)'" onmouseout="this.style.background=''">
                <td><span class="code-badge">${prod.codigo}</span></td>
                <td style="max-width: 300px;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">${prod.nome}</div>
                    ${prod.observacoes ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${Utils.truncate(prod.observacoes, 50)}</div>` : ''}
                </td>
                <td style="font-size: 0.85rem;">${periodo}</td>
                <td style="text-align:center;font-size:0.85rem;color:var(--text-muted);font-family:var(--code-font);white-space:nowrap;">${duracaoDias}</td>
                <td style="text-align: center;">${numAtividades}</td>
                <td><span class="points-cell">${totalPontos}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon edit" onclick="event.stopPropagation();editarProduto(${prod.id})" title="Editar">✏️</button>
                        <button class="btn-icon delete" onclick="event.stopPropagation();excluirProduto(${prod.id})" title="Excluir">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function setupEventListeners() {
    document.getElementById('searchBox').addEventListener('input', Utils.debounce((e) => {
        renderizarTabela(e.target.value);
    }, 300));
}

function filtrarPorStatus(status) {
    filtroStatus = status;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    // Marcar botão ativo pelo data-status ou pelo texto
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes("'" + status + "'") || onclick.includes('"' + status + '"')) {
            btn.classList.add('active');
        }
    });
    renderizarTabela(document.getElementById('searchBox')?.value || '');
}

function verDetalhes(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;
    abrirModalDetalhe(produto);
}

function abrirModalDetalhe(prod) {
    const totalPontos = prod.atividades?.reduce((s,a) => s + (a.pontos||0), 0) || 0;
    const labelMap    = {'finalizado':'Finalizado','em-andamento':'Em Andamento','nao-concluido':'Não Concluído'};
    const atStatusMap = {'em-andamento':'in-progress','finalizado':'completed'};
    const atLabelMap  = {'em-andamento':'Em Andamento','finalizado':'Finalizado'};

    const atividadesHtml = (prod.atividades && prod.atividades.length > 0)
        ? prod.atividades.map((ativ, idx) => `
            <tr style="border-bottom:1px solid var(--border);transition:background 0.15s;"
                onmouseover="this.style.background='var(--bg-dark)'"
                onmouseout="this.style.background=''">
                <td style="padding:0.75rem 1.25rem;font-family:var(--code-font);color:var(--secondary-light);font-size:0.83rem;">${ativ.codigo}</td>
                <td style="padding:0.75rem 1.25rem;font-size:0.88rem;">${ativ.atividade}</td>
                <td style="padding:0.75rem 1.25rem;text-align:center;font-size:0.85rem;">${ativ.complexidade}</td>
                <td style="padding:0.75rem 1.25rem;text-align:right;font-family:var(--code-font);color:var(--success);font-weight:700;font-size:0.95rem;">${ativ.pontos}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;padding:2.5rem;color:var(--text-muted);">Nenhuma atividade registrada</td></tr>`;

    const overlay = document.createElement('div');
    overlay.id = 'modalDetalhe';
    overlay.style.cssText = 'position:fixed;top:68px;left:0;right:0;bottom:0;z-index:10000;background:var(--bg-dark);overflow-y:auto;animation:slideInPage 0.25s ease;';

    // Injetar keyframe se ainda não existir
    if (!document.getElementById('slideInPageStyle')) {
        const st = document.createElement('style');
        st.id = 'slideInPageStyle';
        st.textContent = `
            @keyframes slideInPage {
                from { opacity: 0; transform: translateY(24px); }
                to   { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(st);
    }

    overlay.innerHTML = `
        <!-- Barra de topo fixa -->
        <div style="
            position: sticky; top: 0; z-index: 10;
            background: var(--bg-mid);
            border-bottom: 1px solid var(--border);
            padding: 0.9rem 2rem;
            display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        ">
            <div style="display:flex;align-items:center;gap:1rem;">
                <button onclick="document.getElementById('modalDetalhe').remove()"
                        style="display:flex;align-items:center;gap:0.4rem;background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:0.4rem 0.9rem;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;transition:all 0.2s;"
                        onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary-light)'"
                        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">
                    ← Voltar
                </button>
                <span style="font-size:0.75rem;color:var(--text-muted);">Lista de Produtos</span>
                <span style="color:var(--border);">/</span>
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">${prod.codigo} — ${Utils.truncate(prod.nome, 45)}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="editarProduto(${prod.id}); document.getElementById('modalDetalhe').remove();"
                        class="btn btn-secondary" style="font-size:0.85rem;">✏️ Editar</button>
            </div>
        </div>

        <!-- Conteúdo centralizado -->
        <div style="max-width: 900px; margin: 0 auto; padding: 2.5rem 2rem 4rem;">

            <!-- Cabeçalho do produto -->
            <div style="margin-bottom:2rem;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">Produto</div>
                <h1 style="font-size:1.7rem;font-weight:700;color:var(--text-primary);margin-bottom:0.6rem;line-height:1.3;">${prod.nome}</h1>
                <span class="code-badge">${prod.codigo}</span>
            </div>

            <!-- Cards de resumo -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:2rem;">
                <div style="background:var(--bg-mid);padding:1.1rem 1.25rem;border-radius:10px;border:1px solid var(--border);">
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.4rem;">Período</div>
                    <div style="font-size:0.92rem;font-weight:600;color:var(--text-primary);">
                        ${Utils.formatDate(prod.dataInicio)}${prod.dataFim ? ' → ' + Utils.formatDate(prod.dataFim) : ' → Em andamento'}
                    </div>
                </div>
                <div style="background:rgba(16,185,129,0.08);padding:1.1rem 1.25rem;border-radius:10px;border:2px solid var(--success);">
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.4rem;">Pontuação Total</div>
                    <div style="font-size:1.8rem;font-weight:700;color:var(--success);font-family:var(--code-font);">${totalPontos} <span style="font-size:0.95rem;font-weight:400;">pts</span></div>
                </div>
                <div style="background:var(--bg-mid);padding:1.1rem 1.25rem;border-radius:10px;border:1px solid var(--border);">
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.4rem;">Atividades</div>
                    <div style="font-size:1.8rem;font-weight:700;font-family:var(--code-font);color:var(--text-primary);">${prod.atividades?.length || 0}</div>
                </div>
            </div>

            <!-- Status -->
            <div style="background:var(--bg-mid);padding:1.25rem;border-radius:10px;border:1px solid var(--border);margin-bottom:2rem;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.75rem;">Status do Produto</div>
                <div style="display:flex;gap:0.6rem;flex-wrap:wrap;" id="statusBtnsModal">
                    ${['em-andamento','finalizado'].map(s => `
                    <button class="btn-status-lista"
                            data-prodid="${prod.id}"
                            data-status="${s}"
                            style="padding:0.45rem 1.1rem;border-radius:20px;border:2px solid var(--border);background:${prod.status===s?'var(--primary)':'transparent'};color:${prod.status===s?'white':'var(--text-secondary)'};cursor:pointer;font-size:0.85rem;font-weight:${prod.status===s?'700':'400'};transition:all 0.15s;">
                        ${labelMap[s]}
                    </button>`).join('')}
                </div>
            </div>

            ${prod.observacoes ? `
            <div style="background:var(--bg-mid);padding:1.25rem;border-radius:10px;border:1px solid var(--border);margin-bottom:1rem;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.5rem;">Observações</div>
                <div style="color:var(--text-secondary);font-size:0.95rem;line-height:1.6;">${prod.observacoes}</div>
            </div>` : ''}

            ${prod.entregas ? `
            <div style="background:var(--bg-mid);padding:1.25rem;border-radius:10px;border:1px solid var(--border);margin-bottom:2rem;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.5rem;">Entregas</div>
                <div style="color:var(--text-secondary);font-size:0.95rem;line-height:1.6;">${prod.entregas}</div>
            </div>` : ''}

            <!-- Tabela de atividades -->
            <div style="background:var(--bg-mid);border-radius:10px;border:1px solid var(--border);overflow:hidden;">
                <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
                    <h3 style="font-size:1rem;font-weight:700;color:var(--text-primary);margin:0;">Atividades Registradas</h3>
                    <a href="nova-atividade.html?produtoId=${prod.id}&servidorId=${prod.servidorId}" class="btn btn-primary" style="font-size:0.8rem;padding:0.35rem 0.9rem;">+ Nova Atividade</a>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-dark);">
                                <th style="padding:0.75rem 1.25rem;text-align:left;font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Código</th>
                                <th style="padding:0.75rem 1.25rem;text-align:left;font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Atividade</th>
                                <th style="padding:0.75rem 1.25rem;text-align:center;font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Complexidade</th>
                                <th style="padding:0.75rem 1.25rem;text-align:right;font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Pontos</th>
                            </tr>
                        </thead>
                        <tbody>${atividadesHtml}</tbody>
                    </table>
                </div>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);
    // Sem fechar ao clicar no fundo — é tela cheia, não há "fundo" para clicar

    // Listener de delegação para botões de status
    overlay.addEventListener('click', e => {
        const btn = e.target.closest('.btn-status-lista');
        if (!btn) return;
        const prodId = parseInt(btn.dataset.prodid);
        const status = btn.dataset.status;
        if (status === 'finalizado') {
            solicitarDataFimLista(prodId, btn, overlay);
        } else {
            alterarStatusProd_lista(prodId, status, btn);
        }
    });
}

function solicitarDataFimLista(prodId, btnEl, parentOverlay) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;

    // Remover mini-modal anterior se existir
    document.getElementById('modalDataFimLista')?.remove();

    const dataDefault = prod.dataFim || new Date().toISOString().split('T')[0];

    const box = document.createElement('div');
    box.id = 'modalDataFimLista';
    // z-index 20000 garante que fica acima de qualquer overlay existente
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
    box.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:340px;width:100%;animation:scaleIn 0.2s ease;">
            <h3 style="margin-bottom:0.5rem;font-size:1rem;">📅 Data de Conclusão</h3>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">Informe a data em que o produto foi finalizado.</p>
            <input type="date" id="inputDataFimLista" class="form-input"
                   value="${dataDefault}"
                   style="width:100%;margin-bottom:1rem;">
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                <button onclick="document.getElementById('modalDataFimLista').remove()"
                        class="btn btn-secondary" style="font-size:0.85rem;">Cancelar</button>
                <button onclick="confirmarFinalizacaoLista(${prodId}, document.getElementById('inputDataFimLista').value)"
                        class="btn btn-primary" style="font-size:0.85rem;">✓ Confirmar</button>
            </div>
        </div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
}

async function confirmarFinalizacaoLista(prodId, dataFim) {
    if (!dataFim) { Notify.error('Informe a data de conclusão!'); return; }
    document.getElementById('modalDataFimLista')?.remove();
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;
    prod.dataFim = dataFim;
    prod.status  = 'finalizado';
    await MockAPI.updateProduto(prodId, prod);
    // Atualizar botões no modal
    document.querySelectorAll('#modalDetalhe button[data-status]').forEach(b => {
        const active = b.dataset.status === 'finalizado';
        b.style.background = active ? 'var(--primary)' : 'transparent';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
        b.style.fontWeight  = active ? '700' : '400';
    });
    Notify.success('Produto finalizado!');
    await loadProdutos();
}

async function alterarStatusProd_lista(prodId, novoStatus, btnEl) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;
    prod.status = novoStatus;
    if (novoStatus === 'finalizado' && !prod.dataFim)
        prod.dataFim = new Date().toISOString().split('T')[0];
    if (novoStatus === 'em-andamento') prod.dataFim = null;
    await MockAPI.updateProduto(prodId, prod);
    const btns = btnEl.closest('div').querySelectorAll('button[data-status]');
    btns.forEach(b => {
        const active = b.dataset.status === novoStatus;
        b.style.background = active ? 'var(--primary)' : 'transparent';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
        b.style.fontWeight  = active ? '700' : '400';
    });
    Notify.success('Status atualizado!');
    await loadProdutos();
}

async function alterarStatusAtiv_lista(prodId, atividadeIdx, novoStatus) {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod || !prod.atividades[atividadeIdx]) return;
    prod.atividades[atividadeIdx].status = novoStatus;
    await MockAPI.updateProduto(prodId, prod);
    Notify.success('Status da atividade atualizado!');
}


function editarProduto(id) {
    const prod = produtos.find(p => p.id === id);
    if (!prod) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';

    const statusAtualEfetivo = resolverStatus(prod);
    const session  = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin  = session && session.role === 'admin';

    const statusOpcoes = [
        { value: 'em-andamento',  label: 'Em Andamento',  cor: 'var(--warning)',  adminOnly: false },
        { value: 'finalizado',    label: 'Finalizado',    cor: 'var(--success)',  adminOnly: false }
    ];

    const statusBtnsHTML = statusOpcoes.map(s => {
        const oculto   = s.adminOnly && !isAdmin;
        const ativo    = statusAtualEfetivo === s.value;
        const disabled = s.adminOnly && !isAdmin;
        if (oculto) return ''; // user comum não vê o botão
        return `
        <button type="button" data-status-edit="${s.value}"
            onclick="selecionarStatusEdit('${s.value}')"
            ${disabled ? 'disabled' : ''}
            style="flex:1;padding:0.5rem 0.25rem;border-radius:6px;border:2px solid ${ativo ? s.cor : 'var(--border)'};
                   background:${ativo ? s.cor + '22' : 'transparent'};
                   color:${ativo ? s.cor : 'var(--text-secondary)'};
                   font-weight:${ativo ? '700' : '400'};
                   cursor:${disabled ? 'not-allowed' : 'pointer'};font-size:0.82rem;transition:all 0.15s;
                   opacity:${disabled ? '0.45' : '1'};">
            ${s.label}
        </button>`;
    }).join('');

    overlay.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:2rem;max-width:560px;width:100%;animation:scaleIn 0.25s ease;">
            <h2 style="margin-bottom:1.5rem;">✏️ Editar Produto</h2>
            <div class="form-group">
                <label class="form-label">Código</label>
                <input class="form-input" id="edit-codigo" value="${prod.codigo}">
            </div>
            <div class="form-group">
                <label class="form-label">Nome</label>
                <textarea class="form-textarea" id="edit-nome">${prod.nome}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                    <label class="form-label">Data Início</label>
                    <input type="date" class="form-input" id="edit-inicio" value="${prod.dataInicio || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Data Fim <span title="Deixar em branco mantém o produto como Em Andamento" style="cursor:help;color:var(--text-muted);font-size:0.8rem;font-weight:700;border:1px solid var(--border);border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;">?</span></label>
                    <input type="date" class="form-input" id="edit-fim" value="${prod.dataFim || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <div style="display:flex;gap:0.5rem;">
                    ${statusBtnsHTML}
                </div>
                <input type="hidden" id="edit-status" value="${statusAtualEfetivo}">
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea class="form-textarea" id="edit-obs">${prod.observacoes || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Entregas</label>
                <textarea class="form-textarea" id="edit-entregas" style="min-height:80px;">${prod.entregas || ''}</textarea>
            </div>
            <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
                <button class="btn btn-primary" id="edit-salvar" style="flex:1;">💾 Salvar</button>
                <button class="btn btn-secondary" onclick="this.closest('div[style*=fixed]').remove()">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#edit-salvar').addEventListener('click', async () => {
        const codigo      = overlay.querySelector('#edit-codigo').value.trim();
        const nome        = overlay.querySelector('#edit-nome').value.trim();
        const inicio      = overlay.querySelector('#edit-inicio').value;
        const fim         = overlay.querySelector('#edit-fim').value || null;
        const obs         = overlay.querySelector('#edit-obs').value.trim();
        const entregas    = overlay.querySelector('#edit-entregas').value.trim();
        const novoStatus  = overlay.querySelector('#edit-status').value;

        if (!codigo || !nome || !inicio) { Notify.error('Preencha os campos obrigatórios'); return; }

        // Se status for finalizado e não houver data fim, usar data de hoje
        let dataFimFinal = fim;
        if (novoStatus === 'finalizado' && !dataFimFinal) {
            dataFimFinal = new Date().toISOString().split('T')[0];
            overlay.querySelector('#edit-fim').value = dataFimFinal;
        }
        // Se status for em-andamento, limpar data fim
        if (novoStatus === 'em-andamento') dataFimFinal = null;

        const upd = { ...prod, codigo, nome, dataInicio: inicio, dataFim: dataFimFinal, observacoes: obs, entregas, status: novoStatus };
        const result = await MockAPI.updateProduto(id, upd);
        if (result.success) {
            overlay.remove();
            Notify.success('Produto atualizado!');
            await loadProdutos();
        } else {
            Notify.error('Erro ao salvar');
        }
    });
}

function selecionarStatusEdit(valor) {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'admin';

    if (valor === 'nao-concluido' && !isAdmin) return; // bloqueado para user comum

    const statusOpcoes = {
        'em-andamento':  'var(--warning)',
        'finalizado':    'var(--success)',
        'nao-concluido': 'var(--danger)'
    };
    document.getElementById('edit-status').value = valor;
    document.querySelectorAll('[data-status-edit]').forEach(btn => {
        const active = btn.dataset.statusEdit === valor;
        const cor = statusOpcoes[btn.dataset.statusEdit] || 'var(--border)';
        btn.style.borderColor = active ? cor : 'var(--border)';
        btn.style.background  = active ? cor + '22' : 'transparent';
        btn.style.color       = active ? cor : 'var(--text-secondary)';
        btn.style.fontWeight  = active ? '700' : '400';
    });
}

function excluirProduto(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;

    Notify.confirm(
        `Deseja realmente excluir o produto "${produto.nome}"?`,
        async () => {
            try {
                const result = await MockAPI.deleteProduto(id);
                if (result && result.success) {
                    await loadProdutos();
                    Notify.success('Produto excluído com sucesso!');
                } else {
                    Notify.error(result?.message || 'Erro ao excluir produto.');
                }
            } catch(e) {
                Notify.error('Erro de conexão ao excluir produto.');
            }
        }
    );
}
