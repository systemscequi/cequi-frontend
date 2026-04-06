/**
 * CEQUI - Cadastro de Produtos
 * Complexidade numérica (0.5–8), área automática, busca, persistência real
 */

let produto = { codigo: '', nome: '', dataInicio: '', dataFim: '', observacoes: '', entregas: '', atividades: [] };
let currentStep = 1;
let categoriaAtual = 'DGS';
let atividadeSelecionada = null;
let complexidadeSelecionada = null;
let buscaAtividade = '';
let atividadesProd = {}; // cache de atividades padrão (backend ou mock)
let _todosProdsReap = []; // cache para modal de reaproveitar

document.addEventListener('DOMContentLoaded', async () => {
    // Carrega atividades do backend, com fallback para mock local
    try {
        const result = await MockAPI.getAtividades();
        if (result.success && result.data && typeof result.data === 'object') {
            atividadesProd = result.data;
        } else {
            atividadesProd = MOCK_ATIVIDADES;
        }
    } catch (e) {
        atividadesProd = MOCK_ATIVIDADES;
    }
    await loadServidoresSelect();
    renderStep1();
});

async function loadServidoresSelect() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'admin';
    const group   = document.getElementById('serverGroup');
    const select  = document.getElementById('serverSelect');
    if (!select) return;

    if (!isAdmin && session) {
        // Usuário comum: ocultar seletor, usar sessão
        if (group) group.style.display = 'none';

        const result = await MockAPI.getColaboradores();
        let servidor = null;
        if (result && result.success) {
            const uid = parseInt(session.userId);
            servidor = result.data.find(s => parseInt(s.id) === uid)
                    || result.data.find(s => parseInt(s.ponto) === parseInt(session.ponto));
        }
        if (!servidor) {
            servidor = { id: session.userId, ponto: session.ponto, nome: session.nome, area: session.area };
        }
        CurrentServer.set(servidor);
        aplicarServidor(servidor, [servidor]);
        return;
    }

    // Admin: mostrar seletor com todos
    if (group) group.style.display = '';
    const result = await MockAPI.getTodosColaboradores();
    if (!result || !result.success) return;

    select.innerHTML = '<option value="">Selecione um servidor...</option>';
    result.data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.nome} (Ponto ${s.ponto})`;
        select.appendChild(opt);
    });

    const saved = CurrentServer.get();
    const servidorPreSel = saved && result.data.find(s => parseInt(s.id) === parseInt(saved.id));
    const servidorFinal  = servidorPreSel || result.data[0];
    if (servidorFinal) {
        select.value = servidorFinal.id;
        CurrentServer.set(servidorFinal);
        aplicarServidor(servidorFinal, result.data);
    }

    select.addEventListener('change', function () {
        const servidor = result.data.find(s => s.id === parseInt(this.value));
        if (servidor) {
            CurrentServer.set(servidor);
            aplicarServidor(servidor, result.data);
        }
    });
}

function aplicarServidor(server, _all) {
    const cats = (window.AREA_CATEGORIAS || {})[server.area] || Object.keys(window.CATEGORIAS || {});
    categoriaAtual = cats[0] || 'DGS';
}

function renderStep1() {
    document.getElementById('formContent').innerHTML = `
        <div class="content-layout">
            <div class="card">
                <h2 class="card-title">Informações do Produto</h2>

                <!-- Botão reaproveitar -->
                <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg-dark);border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.2rem;">Reaproveitar produto anterior</div>
                        <div style="font-size:0.78rem;color:var(--text-muted);">Importe os dados e atividades de um produto já cadastrado</div>
                    </div>
                    <button class="btn btn-secondary" onclick="abrirModalReaproveitar()" style="white-space:nowrap;">Selecionar Produto</button>
                </div>

                <div class="form-group">
                    <label class="form-label">Nome do Produto <span class="required">*</span></label>
                    <textarea class="form-textarea" id="nomeProduto" placeholder="Ex: Gestão das atividades semanais...">${produto.nome}</textarea>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Data Início <span class="required">*</span></label>
                        <input type="date" class="form-input" id="dataInicio" value="${produto.dataInicio}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Data Fim</label>
                        <input type="date" class="form-input" id="dataFim" value="${produto.dataFim || ''}">
                        <small id="dataFimHint" style="color:var(--text-muted);font-size:0.75rem;">Deixe vazio se ainda está em andamento</small>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Observações</label>
                    <textarea class="form-textarea" id="observacoes" placeholder="Observações gerais...">${produto.observacoes}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Entregas</label>
                    <textarea class="form-textarea" id="entregas" placeholder="Descreva as entregas deste produto..." style="min-height:80px;">${produto.entregas || ''}</textarea>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="salvarStep1()">✓ Adicionar</button>
                </div>
            </div>
            <div class="card">
                <h2 class="card-title">Dicas</h2>
                <div style="color:var(--text-secondary);font-size:0.9rem;line-height:1.8;">
                    <p>• <strong>Código:</strong> número sequencial do produto</p>
                    <p>• <strong>Data Fim:</strong> quando o produto foi entregue</p>
                    <p>• Produtos sem data fim ficam como <em>Em Andamento</em></p>
                    <p>• Na próxima etapa vincule as atividades e complexidades</p>
                    <p>• Use <strong>Reaproveitar</strong> para repetir um produto de outro mês</p>
                </div>
            </div>
        </div>`;

    // Restringir dataFim ao mesmo mês/ano de dataInicio
    setTimeout(() => {
        const elInicio = document.getElementById('dataInicio');
        const elFim    = document.getElementById('dataFim');
        const hint     = document.getElementById('dataFimHint');

        function atualizarLimitesFim() {
            const val = elInicio ? elInicio.value : '';
            if (!val) {
                if (elFim) { elFim.min = ''; elFim.max = ''; }
                if (hint) hint.textContent = 'Deixe vazio se ainda está em andamento';
                return;
            }
            const [ano, mes] = val.split('-').map(Number);
            // Primeiro e último dia do mesmo mês
            const primeiroDia = `${String(ano).padStart(4,'0')}-${String(mes).padStart(2,'0')}-01`;
            const ultimoDia   = new Date(ano, mes, 0); // dia 0 do mês seguinte = último do atual
            const ultimoStr   = `${String(ano).padStart(4,'0')}-${String(mes).padStart(2,'0')}-${String(ultimoDia.getDate()).padStart(2,'0')}`;
            if (elFim) {
                elFim.min = primeiroDia;
                elFim.max = ultimoStr;
                // Se o valor atual estiver fora do intervalo, limpar
                if (elFim.value && (elFim.value < primeiroDia || elFim.value > ultimoStr)) {
                    elFim.value = '';
                    produto.dataFim = null;
                }
            }
            if (hint) {
                const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                hint.textContent = `Deve ser em ${nomeMes} (mesmo mês da Data Início)`;
                hint.style.color = 'var(--warning)';
            }
        }

        if (elInicio) {
            elInicio.addEventListener('change', atualizarLimitesFim);
            // Aplicar imediatamente se já houver valor
            if (elInicio.value) atualizarLimitesFim();
        }
    }, 50);
}

// ── Modal de reaproveitamento ─────────────────────────────────────────────────
async function abrirModalReaproveitar() {
    // Carregar todos os produtos do banco (não só do servidor atual)
    let todosProdutos = [];
    let todosColabs = [];
    try {
        const result = await MockAPI.getProdutos();
        if (result && result.success) { todosProdutos = result.data; _todosProdsReap = result.data; }
        const colabResult = await MockAPI.getTodosColaboradores();
        if (colabResult && colabResult.success) todosColabs = colabResult.data;
    } catch(e) {
        todosProdutos = DataStore.getProdutos() || [];
    }

    if (!todosProdutos || todosProdutos.length === 0) {
        Notify.warning('Nenhum produto encontrado na base de dados.');
        return;
    }
    const colabMap = {};
    todosColabs.forEach(c => { colabMap[c.id] = c.nome; });

    // Montar lista de meses disponíveis
    const mesesDisp = [...new Set(
        todosProdutos
            .filter(p => p.dataInicio)
            .map(p => p.dataInicio.substring(0, 7))
    )].sort().reverse();

    const mesAtual = mesesDisp[0] || new Date().toISOString().substring(0, 7);

    function getNomeMes(mesKey) {
        if (!mesKey || mesKey === 'Sem data') return 'Sem data';
        const [ano, m] = mesKey.split('-');
        return new Date(parseInt(ano), parseInt(m) - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }

    function renderListaReap(mesFiltro, textoBusca, servidorFiltro) {
        let filtrados = todosProdutos.filter(p => {
            if (!p.dataInicio) return false;
            if (mesFiltro && p.dataInicio.substring(0, 7) !== mesFiltro) return false;
            if (servidorFiltro && String(p.servidorId) !== String(servidorFiltro)) return false;
            if (textoBusca) {
                const t = textoBusca.toLowerCase();
                const nomeServidor = colabMap[p.servidorId] || '';
                if (!p.nome.toLowerCase().includes(t) && !(p.codigo||'').toLowerCase().includes(t) && !nomeServidor.toLowerCase().includes(t)) return false;
            }
            return true;
        });
        filtrados.sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));

        if (filtrados.length === 0) return '<div style="padding:1.5rem;text-align:center;color:var(--text-muted);">Nenhum produto encontrado</div>';

        return filtrados.map(p => {
            const totalPts = (p.atividades || []).reduce((s, a) => s + (a.pontos || 0), 0).toFixed(1);
            const atvsHTML = (p.atividades || []).map(a =>
                '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid var(--border);gap:0.5rem;">'
                + '<div style="flex:1;min-width:0;">'
                + '<span style="font-family:var(--code-font);font-size:0.75rem;color:var(--secondary-light);font-weight:700;">' + a.codigo + '</span>'
                + '<span style="font-size:0.73rem;color:var(--text-secondary);margin-left:0.4rem;">' + a.atividade + '</span>'
                + '</div>'
                + '<div style="font-size:0.72rem;white-space:nowrap;color:var(--text-muted);">'
                + a.peso + ' x ' + a.complexidade + ' = <strong style="color:var(--success);">' + a.pontos + ' pts</strong>'
                + '</div></div>'
            ).join('');

            return '<div id="card-reap-' + p.id + '" style="background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem;overflow:hidden;">'
                + '<div onclick="toggleReapCard(' + p.id + ')" style="padding:0.85rem 1rem;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;"'
                + ' onmouseover="document.getElementById(\'card-reap-' + p.id + '\').style.borderColor=\'var(--primary)\'"'
                + ' onmouseout="document.getElementById(\'card-reap-' + p.id + '\').style.borderColor=\'var(--border)\'">'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-family:var(--code-font);font-weight:700;color:var(--secondary-light);font-size:0.85rem;">#' + p.codigo
                + '<span style="font-weight:400;color:var(--text-muted);margin-left:0.5rem;font-size:0.75rem;">' + (p.atividades?.length || 0) + ' atividades</span></div>'
                + '<div style="font-size:0.85rem;font-weight:600;margin-top:0.2rem;">' + p.nome + '</div>'
                + '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">'
                + (p.dataInicio ? Utils.formatDate(p.dataInicio) : '—')
                + (p.dataFim ? ' → ' + Utils.formatDate(p.dataFim) : ' → Em andamento') + '</div>'
                + '</div>'
                + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0;">'
                + '<div style="font-size:1.3rem;font-weight:700;color:var(--accent);font-family:var(--code-font);">' + totalPts
                + '<span style="font-size:0.65rem;color:var(--text-muted);margin-left:2px;">pts</span></div>'
                + '<span id="arrow-' + p.id + '" style="font-size:0.7rem;color:var(--text-muted);">▼ ver atividades</span>'
                + '</div></div>'
                + '<div id="painel-reap-' + p.id + '" style="display:none;padding:0 1rem 0.75rem;border-top:1px solid var(--border);">'
                + '<div style="padding-top:0.5rem;margin-bottom:0.75rem;">' + atvsHTML + '</div>'
                + '<button onclick="confirmarReaproveitar(' + p.id + ')" class="btn btn-primary" style="width:100%;font-size:0.85rem;">Importar este produto</button>'
                + '</div></div>';
        }).join('');
    }

    const overlay = document.createElement('div');
    overlay.id = 'modalReaproveitar';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:20000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;padding:1rem;';

    const mesOpts = mesesDisp.map(m => '<option value="' + m + '">' + getNomeMes(m) + '</option>').join('');

    overlay.innerHTML = '<div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:14px;padding:1.75rem;width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">'
        + '<div><h3 style="font-size:1.05rem;margin:0;">Reaproveitar Produto</h3>'
        + '<p style="font-size:0.78rem;color:var(--text-muted);margin:0.2rem 0 0;">Selecione um produto da base para importar</p></div>'
        + '<button onclick="document.getElementById(\'modalReaproveitar\').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.4rem;">&times;</button>'
        + '</div>'
        + '<div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;">'
        + '<select id="reapMesSelect" style="padding:0.35rem 0.7rem;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;font-size:0.85rem;cursor:pointer;">'
        + '<option value="">Todos os meses</option>' + mesOpts
        + '</select>'
        + '<select id="reapServidorSelect" style="padding:0.35rem 0.7rem;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;font-size:0.85rem;cursor:pointer;">'
        + '<option value="">Todos os servidores</option>'
        + todosColabs.map(c => '<option value="' + c.id + '">' + c.nome + '</option>').join('')
        + '</select>'
        + '<input type="text" id="reapBusca" placeholder="Buscar por nome ou código..." style="flex:1;min-width:150px;padding:0.35rem 0.7rem;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;font-size:0.85rem;">'
        + '</div>'
        + '<div id="reapLista" style="overflow-y:auto;flex:1;padding-right:0.25rem;">' + renderListaReap(mesAtual, '') + '</div>'
        + '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Atualizar lista ao mudar filtros
    const selMes  = overlay.querySelector('#reapMesSelect');
    const inpBusc = overlay.querySelector('#reapBusca');
    selMes.value = mesAtual;

    const selSrv = overlay.querySelector('#reapServidorSelect');
    function atualizarLista() {
        overlay.querySelector('#reapLista').innerHTML = renderListaReap(selMes.value, inpBusc.value.trim(), selSrv ? selSrv.value : '');
    }
    selMes.addEventListener('change', atualizarLista);
    if (selSrv) selSrv.addEventListener('change', atualizarLista);
    inpBusc.addEventListener('input', Utils.debounce ? Utils.debounce(atualizarLista, 250) : atualizarLista);
}



function toggleReapCard(prodId) {
    const painel = document.getElementById(`painel-reap-${prodId}`);
    const arrow  = document.getElementById(`arrow-${prodId}`);
    if (!painel) return;
    const aberto = painel.style.display !== 'none';
    painel.style.display = aberto ? 'none' : 'block';
    if (arrow) arrow.textContent = aberto ? '▼ ver atividades' : '▲ ocultar';
}

function confirmarReaproveitar(produtoId) {
    // Buscar no DataStore (cache do banco)
    const id = parseInt(produtoId);
    const todos = _todosProdsReap.length > 0 ? _todosProdsReap : (DataStore.getProdutos() || []);
    const original = todos.find(p => parseInt(p.id) === id);
    if (!original) { Notify.error('Produto não encontrado.'); return; }

    document.getElementById('modalReaproveitar')?.remove();

    // Importar tudo exceto datas (usuário preenche as novas)
    produto.codigo      = ''; // será gerado automaticamente ao salvar
    produto.nome        = original.nome;
    produto.observacoes = original.observacoes || '';
    produto.entregas   = original.entregas   || '';
    produto.dataInicio  = '';
    produto.dataFim     = null;
    produto.atividades  = (original.atividades || []).map(a => ({ ...a }));

    renderStep1();
    // Destaca campos de data como obrigatórios após render
    setTimeout(() => {
        const dtInicio = document.getElementById('dataInicio');
        if (dtInicio) {
            dtInicio.style.borderColor = 'var(--danger)';
            dtInicio.style.boxShadow   = '0 0 0 2px rgba(239,68,68,0.2)';
            dtInicio.focus();
            dtInicio.addEventListener('change', () => {
                dtInicio.style.borderColor = '';
                dtInicio.style.boxShadow   = '';
            }, { once: true });
        }
    }, 100);
    Notify.success(`Produto #${original.codigo} importado! Preencha a Data de Início para continuar.`);
}


async function salvarStep1() {
    produto.nome        = document.getElementById('nomeProduto').value.trim();
    produto.dataInicio  = document.getElementById('dataInicio').value;
    produto.dataFim     = document.getElementById('dataFim').value || null;
    produto.observacoes = document.getElementById('observacoes').value.trim();
    produto.entregas   = document.getElementById('entregas')?.value.trim() || '';

    if (!produto.nome || !produto.dataInicio) {
        Utils.showError('Preencha os campos obrigatórios: Nome e Data de Início');
        return;
    }

    // Data Fim deve estar no mesmo mês/ano da Data Início
    if (produto.dataFim && produto.dataInicio) {
        const mesInicio = produto.dataInicio.substring(0, 7);
        const mesFim    = produto.dataFim.substring(0, 7);
        if (mesInicio !== mesFim) {
            Notify.warning('A Data Fim deve ser no mesmo mês da Data Início.');
            document.getElementById('dataFim').value = '';
            produto.dataFim = null;
            return;
        }
    }

    // Código gerado automaticamente: sequencial por servidor
    if (!produto.codigo) {
        const todosProdutos = DataStore.getProdutos();
        let server = CurrentServer.get();
        if (!server) {
            const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
            if (session) {
                const colabs = window.MOCK_COLABORADORES || [];
                const proprio = colabs.find(s => s.id === session.userId);
                if (proprio) { CurrentServer.set(proprio); server = proprio; }
            }
        }
        const produtosServidor = server ? todosProdutos.filter(p => p.servidorId === server.id) : todosProdutos;
        const seq = String(produtosServidor.length + 1).padStart(3, '0');
        produto.codigo = seq;
    }

    let server = CurrentServer.get();
    // Fallback para user comum: recuperar próprio servidor
    if (!server) {
        const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
        if (session) {
            const colabs = window.MOCK_COLABORADORES || [];
            const proprio = colabs.find(s => s.id === session.userId);
            if (proprio) { CurrentServer.set(proprio); server = proprio; }
        }
    }
    if (!server) {
        Utils.showError('Selecione um servidor primeiro!');
        return;
    }

    const btn = document.querySelector('.btn-primary[onclick="salvarStep1()"]');
    if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true; }

    const result = await MockAPI.createProduto({
        ...produto,
        servidorId: server.id,
        status: produto.dataFim ? 'finalizado' : 'em-andamento',
        dataCriacao: new Date().toISOString()
    });

    if (result.success) {
        Notify.success('Produto adicionado com sucesso!');
        setTimeout(() => {
            window.location.href = 'lista-produtos.html';
        }, 800);
    } else {
        Utils.showError('Erro ao salvar produto');
        if (btn) { btn.textContent = '✓ Adicionar'; btn.disabled = false; }
    }
}

function renderStep2() {
    const server     = CurrentServer.get();
    const catsServer = server ? (window.AREA_CATEGORIAS[server.area] || Object.keys(atividadesProd)) : Object.keys(atividadesProd);
    const todasAts   = Object.values(atividadesProd).flat();
    const atsExibidas = buscaAtividade.length >= 2
        ? todasAts.filter(a => a.codigo.toLowerCase().includes(buscaAtividade.toLowerCase()) || a.atividade.toLowerCase().includes(buscaAtividade.toLowerCase()))
        : (atividadesProd[categoriaAtual] || []);

    const catBtns = Object.keys(CATEGORIAS).map(cat => {
        const actv = cat === categoriaAtual && !buscaAtividade;
        return `<button class="category-btn cat-${cat} ${actv ? 'active' : ''}" onclick="mudarCategoria('${cat}')" title="${CATEGORIAS[cat].nome}">${CATEGORIAS[cat].icone ? CATEGORIAS[cat].icone + ' ' : ''}${CATEGORIAS[cat].nome}</button>`;
    }).join('');

    const complexButtons = (window.COMPLEXIDADES || [0.5, 1, 1.5]).map(v =>
        `<button class="complexity-btn ${complexidadeSelecionada === v ? 'active' : ''}" onclick="selecionarComplexidade(${v})">
            <div style="font-size:1.1rem;font-weight:700;">${v}</div>
        </button>`).join('');

    const infoDisplay = atividadeSelecionada ? 'block' : 'none';
    const pontosDisplay = (atividadeSelecionada && complexidadeSelecionada) ? 'block' : 'none';
    const pts = atividadeSelecionada && complexidadeSelecionada ? +(atividadeSelecionada.peso * complexidadeSelecionada).toFixed(1) : 0;

    document.getElementById('formContent').innerHTML = `
        <div class="content-layout">
            <div class="card">
                <h2 class="card-title">Adicionar Atividade</h2>
                <div class="form-group">
                    <label class="form-label">Buscar atividade</label>
                    <input type="text" class="form-input" id="buscaAtiv" placeholder="Código ou descrição..." value="${buscaAtividade}" oninput="atualizarBusca(this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">Categoria</label>
                    <div class="category-selector" style="flex-wrap:wrap;gap:0.4rem;">${catBtns}</div>
                </div>
                <div class="form-group">
                    <label class="form-label">Atividade Padrão <span class="required">*</span>
                        <span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem;">${atsExibidas.length} atividades</span>
                    </label>
                    <select class="form-select" id="atividadePadrao" onchange="selecionarAtividade()">
                        <option value="">Selecione uma atividade...</option>
                        ${atsExibidas.map((a,i) => `<option value="${i}" ${atividadeSelecionada && atividadeSelecionada.codigo===a.codigo?'selected':''}>${a.codigo} | Peso ${a.peso} — ${a.atividade.substring(0,75)}${a.atividade.length>75?'...':''}</option>`).join('')}
                    </select>
                </div>
                <div id="atividadeInfo" style="display:${infoDisplay};margin-bottom:1rem;padding:1rem;background:var(--bg-dark);border-radius:8px;border:1px solid var(--border);">
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;">ATIVIDADE SELECIONADA</div>
                    <div style="font-weight:600;margin-bottom:0.5rem;" id="infoDescricao">${atividadeSelecionada?.atividade||''}</div>
                    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                        <span style="font-size:0.85rem;">Código: <strong id="infoCodigo" style="font-family:var(--code-font);color:var(--secondary-light);">${atividadeSelecionada?.codigo||''}</strong></span>
                        <span style="font-size:0.85rem;">Área: <strong id="infoArea" style="color:var(--accent);">${atividadeSelecionada ? CATEGORIAS[atividadeSelecionada.categoria]?.nome : ''}</strong></span>
                        <span style="font-size:0.85rem;">Peso: <strong id="infoPeso" style="color:var(--warning);">${atividadeSelecionada?.peso||''}</strong></span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Complexidade (multiplicador) <span class="required">*</span>
                        <span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem;">Pontos = Peso × Complexidade</span>
                    </label>
                    <div class="complexity-selector">${complexButtons}</div>
                </div>
                <div id="pontosPreview" style="display:${pontosDisplay};margin:1rem 0;padding:1rem;background:rgba(16,185,129,0.1);border:2px solid var(--success);border-radius:8px;text-align:center;">
                    <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.25rem;">Pontos Calculados</div>
                    <div style="font-size:2.5rem;font-weight:700;color:var(--success);font-family:var(--code-font);" id="pontosCalculados">${pts}</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);" id="formulaCalculo">${atividadeSelecionada && complexidadeSelecionada ? `${atividadeSelecionada.peso} × ${complexidadeSelecionada} = ${pts} pts` : ''}</div>
                </div>
                <div class="form-group">
                    <label class="form-label">Observação da atividade</label>
                    <input type="text" class="form-input" id="obsAtividade" placeholder="Descrição resumida do que foi feito...">
                </div>
                <div class="btn-group">
                    <button class="btn btn-secondary" onclick="nextStep(1)">← Voltar</button>
                    <button class="btn btn-success" onclick="adicionarAtividade()">+ Adicionar</button>
                </div>
            </div>
            <div class="card">
                <h2 class="card-title">Atividades <span style="float:right;font-size:0.85rem;color:var(--text-muted);font-weight:400;">${produto.atividades.length} itens</span></h2>
                <div id="listaAtividades">${renderListaAtividades()}</div>
                <div style="margin-top:1.5rem;padding:1.25rem;background:rgba(10,77,60,0.15);border:2px solid var(--primary);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);">TOTAL DE PONTOS</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${produto.atividades.length} atividades</div>
                    </div>
                    <div style="font-size:2.5rem;font-weight:700;color:var(--accent);font-family:var(--code-font);">${calcularTotalPontos()}</div>
                </div>
            </div>
        </div>`;
}

function atualizarBusca(val) { buscaAtividade = val; atividadeSelecionada = null; renderStep2(); }

function mudarCategoria(cat) { categoriaAtual = cat; buscaAtividade = ''; atividadeSelecionada = null; renderStep2(); }

function selecionarAtividade() {
    const sel = document.getElementById('atividadePadrao');
    if (!sel || sel.value === '') return;
    const lista = buscaAtividade.length >= 2
        ? Object.values(atividadesProd).flat().filter(a => a.codigo.toLowerCase().includes(buscaAtividade.toLowerCase()) || a.atividade.toLowerCase().includes(buscaAtividade.toLowerCase()))
        : (atividadesProd[categoriaAtual] || []);
    atividadeSelecionada = lista[parseInt(sel.value)];
    document.getElementById('atividadeInfo').style.display = 'block';
    document.getElementById('infoDescricao').textContent = atividadeSelecionada.atividade;
    document.getElementById('infoCodigo').textContent = atividadeSelecionada.codigo;
    document.getElementById('infoArea').textContent = CATEGORIAS[atividadeSelecionada.categoria]?.nome || atividadeSelecionada.categoria;
    document.getElementById('infoPeso').textContent = atividadeSelecionada.peso;
    calcularPontos();
}

function selecionarComplexidade(val) {
    complexidadeSelecionada = val;
    document.querySelectorAll('.complexity-btn').forEach(b => {
        b.classList.toggle('active', parseFloat(b.querySelector('div').textContent) === val);
    });
    calcularPontos();
}

function calcularPontos() {
    if (!atividadeSelecionada || !complexidadeSelecionada) return;
    const pts = +(atividadeSelecionada.peso * complexidadeSelecionada).toFixed(1);
    const prev = document.getElementById('pontosPreview');
    if (prev) {
        prev.style.display = 'block';
        document.getElementById('pontosCalculados').textContent = pts;
        document.getElementById('formulaCalculo').textContent = `${atividadeSelecionada.peso} × ${complexidadeSelecionada} = ${pts} pts`;
    }
}

function adicionarAtividade() {
    if (!atividadeSelecionada) { Utils.showError('Selecione uma atividade'); return; }
    if (!complexidadeSelecionada) { Utils.showError('Selecione a complexidade'); return; }
    const obs = document.getElementById('obsAtividade')?.value || '';
    produto.atividades.push({
        codigo: atividadeSelecionada.codigo,
        atividade: atividadeSelecionada.atividade,
        categoria: atividadeSelecionada.categoria,
        areaAtividade: CATEGORIAS[atividadeSelecionada.categoria]?.nome || atividadeSelecionada.categoria,
        peso: atividadeSelecionada.peso,
        complexidade: complexidadeSelecionada,
        pontos: +(atividadeSelecionada.peso * complexidadeSelecionada).toFixed(1),
        observacao: obs
    });
    atividadeSelecionada = null; complexidadeSelecionada = null; buscaAtividade = '';
    Utils.showSuccess('Atividade adicionada!');
    renderStep2();
}

function removerAtividade(idx) { produto.atividades.splice(idx, 1); renderStep2(); }

function renderListaAtividades() {
    if (produto.atividades.length === 0)
        return `<div class="empty-state"><div class="empty-state-icon">📝</div><p>Nenhuma atividade adicionada</p></div>`;
    return produto.atividades.map((a, i) => `
        <div style="padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;margin-bottom:0.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                <div style="flex:1;min-width:0;">
                    <div style="font-family:var(--code-font);font-weight:700;color:var(--secondary-light);font-size:0.85rem;">${a.codigo}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.atividade.substring(0,80)}...</div>
                    <div style="font-size:0.72rem;margin-top:0.15rem;">Peso ${a.peso} × ${a.complexidade} = <strong style="color:var(--success);">${a.pontos} pts</strong></div>
                </div>
                <button onclick="removerAtividade(${i})" style="background:transparent;border:1px solid var(--danger);color:var(--danger);padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;flex-shrink:0;">×</button>
            </div>
        </div>`).join('');
}

function calcularTotalPontos() {
    return +produto.atividades.reduce((s, a) => s + (a.pontos || 0), 0).toFixed(1);
}

function renderStep3() {
    const total = calcularTotalPontos();
    document.getElementById('formContent').innerHTML = `
        <div class="card">
            <h2 class="card-title">Revisão Final</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:2rem;">
                <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;grid-column:span 2;">
                    <div style="font-size:0.8rem;color:var(--text-muted);">Produto</div>
                    <div style="font-weight:600;">${produto.nome}</div>
                </div>
                <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;">
                    <div style="font-size:0.8rem;color:var(--text-muted);">Código</div>
                    <div style="font-weight:700;font-family:var(--code-font);color:var(--secondary-light);">${produto.codigo}</div>
                </div>
                <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;">
                    <div style="font-size:0.8rem;color:var(--text-muted);">Status</div>
                    <div style="font-weight:600;color:${produto.dataFim ? 'var(--success)' : 'var(--warning)'};">${produto.dataFim ? 'Finalizado' : 'Em Andamento'}</div>
                </div>
                <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;">
                    <div style="font-size:0.8rem;color:var(--text-muted);">Data Início</div>
                    <div style="font-weight:600;">${Utils.formatDate(produto.dataInicio)}</div>
                </div>
                <div style="background:var(--bg-dark);padding:1rem;border-radius:8px;">
                    <div style="font-size:0.8rem;color:var(--text-muted);">Data Fim</div>
                    <div style="font-weight:600;">${produto.dataFim ? Utils.formatDate(produto.dataFim) : 'Em andamento'}</div>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;">
                    <thead><tr style="border-bottom:2px solid var(--border);">
                        <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Código</th>
                        <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Atividade</th>
                        <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Área</th>
                        <th style="padding:0.5rem 0.75rem;text-align:center;font-size:0.8rem;">Peso</th>
                        <th style="padding:0.5rem 0.75rem;text-align:center;font-size:0.8rem;">Complex.</th>
                        <th style="padding:0.5rem 0.75rem;text-align:right;font-size:0.8rem;">Pontos</th>
                    </tr></thead>
                    <tbody>
                        ${produto.atividades.map(a => `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:0.6rem 0.75rem;font-size:0.85rem;"><span class="code-badge cat-${a.categoria}">${a.codigo}</span></td>
                            <td style="padding:0.6rem 0.75rem;font-size:0.83rem;">${a.atividade.substring(0,60)}...</td>
                            <td style="padding:0.6rem 0.75rem;font-size:0.78rem;color:var(--text-muted);">${a.areaAtividade?.split(' ').slice(0,3).join(' ')||a.categoria}</td>
                            <td style="padding:0.6rem 0.75rem;text-align:center;">${a.peso}</td>
                            <td style="padding:0.6rem 0.75rem;text-align:center;">${a.complexidade}</td>
                            <td style="padding:0.6rem 0.75rem;text-align:right;font-family:var(--code-font);color:var(--success);font-weight:700;">${a.pontos}</td>
                        </tr>`).join('')}
                        <tr style="border-top:2px solid var(--border);background:rgba(10,77,60,0.1);">
                            <td colspan="5" style="padding:0.75rem;font-weight:700;">TOTAL</td>
                            <td style="padding:0.75rem;text-align:right;font-family:var(--code-font);color:var(--accent);font-weight:700;font-size:1.25rem;">${total}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="btn-group" style="margin-top:2rem;">
                <button class="btn btn-secondary" onclick="nextStep(2)">← Voltar</button>
                <button class="btn btn-primary" onclick="salvarProduto()">💾 Salvar Produto</button>
            </div>
        </div>`;
}

async function salvarProduto() {
    if (produto.atividades.length === 0) { Utils.showError('Adicione pelo menos uma atividade!'); return; }
    const server = CurrentServer.get();
    if (!server) { Utils.showError('Selecione um servidor primeiro!'); return; }
    const result = await MockAPI.createProduto({ ...produto, servidorId: server.id, status: produto.dataFim ? 'finalizado' : 'em-andamento', dataCriacao: new Date().toISOString() });
    if (result.success) {
        Utils.showSuccess('Produto salvo com sucesso!');
        setTimeout(() => {
            Notify.confirm('Cadastrar outro produto?', () => {
                produto = { codigo: '', nome: '', dataInicio: '', dataFim: '', observacoes: '', entregas: '', atividades: [] };
                atividadeSelecionada = null; complexidadeSelecionada = null; buscaAtividade = '';
                nextStep(1);
            }, () => {
                window.location.href = '../index.html';
            });
        }, 600);
    } else { Utils.showError('Erro ao salvar produto'); }
}

function validarDadosStep1() {
    // Salva o que estiver nos campos se estiver no step 1
    if (currentStep === 1) {
        produto.nome        = document.getElementById('nomeProduto')?.value.trim()   || produto.nome;
        produto.dataInicio  = document.getElementById('dataInicio')?.value           || produto.dataInicio;
        produto.dataFim     = document.getElementById('dataFim')?.value              || produto.dataFim || null;
        produto.observacoes = document.getElementById('observacoes')?.value.trim()   || produto.observacoes;
        produto.entregas   = document.getElementById('entregas')?.value.trim()      || produto.entregas;
    }
    if (!produto.nome)       { Notify.warning('Preencha o Nome do produto.');           return false; }
    if (!produto.dataInicio) { Notify.warning('Preencha a Data de Início do produto.'); return false; }
    if (produto.dataFim && produto.dataInicio) {
        const mesInicio = produto.dataInicio.substring(0, 7);
        const mesFim    = produto.dataFim.substring(0, 7);
        if (mesInicio !== mesFim) {
            Notify.warning('A Data Fim deve ser no mesmo mês da Data Início.');
            return false;
        }
    }
    return true;
}

function irParaStep(step) {
    if (step === 1) { nextStep(1); return; }

    if (step === 2) {
        if (!validarDadosStep1()) {
            nextStep(1); // volta ao step 1 para o usuário corrigir
            return;
        }
        nextStep(2); return;
    }

    if (step === 3) {
        if (!validarDadosStep1()) {
            nextStep(1);
            return;
        }
        if (produto.atividades.length === 0) {
            Notify.warning('Adicione pelo menos uma atividade antes de revisar.');
            nextStep(2);
            return;
        }
        nextStep(3); return;
    }
}

function nextStep(step) {
    currentStep = step;
    document.querySelectorAll('.step').forEach((el, i) => {
        el.classList.remove('active','completed');
        if (i + 1 < step) el.classList.add('completed');
        else if (i + 1 === step) el.classList.add('active');
    });
    if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else if (step === 3) renderStep3();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
const prevStep = nextStep;
