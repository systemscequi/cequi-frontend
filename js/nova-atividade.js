/**
 * CEQUI - Nova Atividade
 * Adiciona atividades a um produto em andamento do servidor selecionado.
 * Regra: usuário escolhe CATEGORIA primeiro, depois preenche
 * Descrição Livre OU seleciona Atividade Padrão — nunca os dois.
 */

let servidorAtualNov  = null;
let produtoAtualNov   = null;
let atividadeSel      = null;   // atividade padrão selecionada
let complexidadeSel   = null;
let categoriaAtualNov = 'DGS';
let modoAtividade     = null;   // 'livre' | 'padrao' | null
let atividadesCache   = {};     // cache de atividades padrão (do backend ou mock)

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Carrega atividades padrão do backend (ou mock como fallback)
    try {
        const result = await MockAPI.getAtividades();
        if (result.success && result.data && typeof result.data === 'object') {
            atividadesCache = result.data;
        } else {
            atividadesCache = MOCK_ATIVIDADES;
        }
    } catch (e) {
        atividadesCache = MOCK_ATIVIDADES;
    }
    renderCategoriaBtns();
    renderComplexidadeBtns();
    const params = new URLSearchParams(window.location.search);
    const paramProdId = params.get('produtoId') ? parseInt(params.get('produtoId')) : null;
    const paramSrvId  = params.get('servidorId') ? parseInt(params.get('servidorId')) : null;
    await loadServidores(paramSrvId, paramProdId);
});

// ── Servidores ────────────────────────────────────────────────────────────────
async function loadServidores(paramSrvId = null, paramProdId = null) {
    const result = await MockAPI.getTodosColaboradores();
    if (!result.success) return;

    const select  = document.getElementById('serverSelect');
    const group   = document.getElementById('serverGroup');
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'admin';

    if (!isAdmin) {
        if (group) group.style.display = 'none';
        const uid = session ? parseInt(session.userId) : null;
        // Tentar CurrentServer primeiro, depois buscar no resultado pelo id ou ponto
        let saved = CurrentServer.get();
        if (!saved && uid) {
            saved = result.data.find(s => parseInt(s.id) === uid);
            if (!saved && session?.ponto) {
                saved = result.data.find(s => parseInt(s.ponto) === parseInt(session.ponto));
            }
            if (saved) CurrentServer.set(saved);
        }
        if (saved) {
            servidorAtualNov = parseInt(saved.id);
            await loadProdutosServidor(saved.id, paramProdId);
        }
        return;
    }

    // Admin: mostrar seletor
    if (group) group.style.display = '';

    select.innerHTML = '<option value="">Selecione um servidor...</option>';
    result.data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.nome} (Ponto ${s.ponto})`;
        select.appendChild(opt);
    });

    // Prioridade: paramSrvId da URL > servidor salvo > primeiro da lista
    const alvoId = paramSrvId || (CurrentServer.get()?.id) || null;
    const servidorAlvo = alvoId && result.data.find(s => s.id === alvoId);
    const servidorFinal = servidorAlvo || result.data[0];

    if (servidorFinal) {
        select.value = servidorFinal.id;
        CurrentServer.set(servidorFinal);
        servidorAtualNov = servidorFinal.id;
        await loadProdutosServidor(servidorFinal.id, paramProdId);
    }

    select.addEventListener('change', async function () {
        const servidor = result.data.find(s => s.id === parseInt(this.value));
        if (servidor) {
            CurrentServer.set(servidor);
            servidorAtualNov = servidor.id;
            produtoAtualNov  = null;
            resetFormulario();
            await loadProdutosServidor(servidor.id);
        }
    });
}

// ── Produtos em andamento ─────────────────────────────────────────────────────
async function loadProdutosServidor(servidorId, paramProdId = null) {
    const result = await MockAPI.getProdutos(servidorId);
    const select = document.getElementById('produtoSelect');

    const emAndamento = result.success
        ? result.data.filter(p => p.status === 'em-andamento' || !p.dataFim)
        : [];

    if (emAndamento.length === 0) {
        select.innerHTML = '<option value="">Nenhum produto em andamento</option>';
        resetFormulario();
        return;
    }

    select.innerHTML = '<option value="">Selecione um produto...</option>';
    emAndamento.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.codigo} — ${p.nome}`;
        select.appendChild(opt);
    });

    // Pré-selecionar produto se veio via URL
    if (paramProdId) {
        const prodAlvo = emAndamento.find(p => p.id === paramProdId);
        if (prodAlvo) {
            select.value = prodAlvo.id;
            selecionarProduto();
        }
    }
}

function selecionarProduto() {
    const id = parseInt(document.getElementById('produtoSelect').value);
    if (!id) { produtoAtualNov = null; resetFormulario(); return; }

    const todos = DataStore.getProdutos().filter(p => p.servidorId === servidorAtualNov);
    produtoAtualNov = todos.find(p => p.id === id) || null;

    if (produtoAtualNov) { mostrarFormulario(); atualizarPainel(); }
}

// ── Formulário ────────────────────────────────────────────────────────────────
function mostrarFormulario() {
    document.getElementById('semProdutoMsg').style.display = 'none';
    document.getElementById('formAtividade').style.display = 'block';
    atualizarSelectAtividades();
}

function resetFormulario() {
    document.getElementById('semProdutoMsg').style.display = 'flex';
    document.getElementById('formAtividade').style.display = 'none';
    document.getElementById('atividadeInfo').style.display = 'none';
    document.getElementById('pontosPreview').classList.remove('visible');
    if (document.getElementById('descricaoLivre'))
        document.getElementById('descricaoLivre').value = '';
    if (document.getElementById('obsAtividade'))
        document.getElementById('obsAtividade').value = '';
    atividadeSel    = null;
    complexidadeSel = null;
    modoAtividade   = null;
    aplicarExclusividade();
    atualizarPainel();
}

// ── Categorias ────────────────────────────────────────────────────────────────
function renderCategoriaBtns() {
    const container = document.getElementById('categoriaBtns');
    if (!container) return;
    container.innerHTML = Object.entries(window.CATEGORIAS || {}).map(([key, cat]) => `
        <button class="category-btn cat-${key} ${key === categoriaAtualNov ? 'active' : ''}"
                onclick="mudarCategoria('${key}')" title="${cat.nome}">
            ${cat.icone ? cat.icone + ' ' : ''}${cat.nome}
        </button>`).join('');
}

function mudarCategoria(cat) {
    categoriaAtualNov = cat;
    // Ao trocar categoria, limpa seleção de atividade padrão mas mantém descrição livre
    atividadeSel = null;
    document.getElementById('atividadePadrao').value = '';
    document.getElementById('atividadeInfo').style.display = 'none';
    if (modoAtividade === 'padrao') {
        modoAtividade = null;
        document.getElementById('pontosPreview').classList.remove('visible');
        aplicarExclusividade();
    }
    renderCategoriaBtns();
    atualizarSelectAtividades();
}

function atualizarSelectAtividades() {
    const select = document.getElementById('atividadePadrao');
    const lista  = atividadesCache[categoriaAtualNov] || [];

    document.getElementById('countAtivs').textContent = `${lista.length} atividades`;

    select.innerHTML = '<option value="">Selecione uma atividade...</option>' +
        lista.map((a, i) =>
            `<option value="${i}" title="${a.atividade}">[Peso ${a.peso}] ${a.atividade}</option>`
        ).join('');
}

// ── Exclusividade: Descrição Livre ↔ Atividade Padrão ────────────────────────
function onDescricaoLivreInput(val) {
    if (val.trim().length > 0) {
        modoAtividade = 'livre';
        // Limpar padrão
        atividadeSel = null;
        document.getElementById('atividadePadrao').value = '';
        document.getElementById('atividadeInfo').style.display = 'none';
        document.getElementById('pontosPreview').classList.remove('visible');
    } else {
        modoAtividade = null;
    }
    aplicarExclusividade();
}

function selecionarAtividade() {
    const select = document.getElementById('atividadePadrao');
    if (!select || select.value === '') {
        atividadeSel = null;
        if (modoAtividade === 'padrao') modoAtividade = null;
        document.getElementById('atividadeInfo').style.display = 'none';
        document.getElementById('pontosPreview').classList.remove('visible');
        aplicarExclusividade();
        return;
    }

    const lista = atividadesCache[categoriaAtualNov] || [];
    atividadeSel = lista[parseInt(select.value)];
    modoAtividade = 'padrao';

    // Limpar descrição livre
    document.getElementById('descricaoLivre').value = '';

    document.getElementById('atividadeInfo').style.display = 'block';
    document.getElementById('infoDescricao').textContent   = atividadeSel.atividade;
    document.getElementById('infoCodigo').textContent      = atividadeSel.codigo;
    document.getElementById('infoPeso').textContent        = atividadeSel.peso;

    aplicarExclusividade();
    calcularPontos();
}

function aplicarExclusividade() {
    const elDesc  = document.getElementById('descricaoLivre');
    const elPadrao = document.getElementById('atividadePadrao');

    const bloqDesc   = modoAtividade === 'padrao';
    const bloqPadrao = modoAtividade === 'livre';

    if (elDesc) {
        elDesc.disabled = bloqDesc;
        elDesc.style.opacity = bloqDesc ? '0.4' : '1';
        elDesc.style.cursor  = bloqDesc ? 'not-allowed' : '';
    }
    if (elPadrao) {
        elPadrao.disabled = bloqPadrao;
        elPadrao.style.opacity = bloqPadrao ? '0.4' : '1';
        elPadrao.style.cursor  = bloqPadrao ? 'not-allowed' : '';
    }

    // Labels visuais
    const gDesc   = document.getElementById('groupDescricao');
    const gPadrao = document.getElementById('groupPadrao');
    if (gDesc)   gDesc.style.opacity   = bloqDesc   ? '0.5' : '1';
    if (gPadrao) gPadrao.style.opacity = bloqPadrao ? '0.5' : '1';
}

// ── Complexidade ──────────────────────────────────────────────────────────────
function renderComplexidadeBtns() {
    const container = document.getElementById('complexidadeBtns');
    if (!container) return;
    (window.COMPLEXIDADES || [0.5, 1, 1.5]).forEach(v => {
        // Não recriar botões que já existem — só atualizar classe active
    });
    container.innerHTML = (window.COMPLEXIDADES || [0.5, 1, 1.5]).map(v => `
        <button class="complexity-btn ${complexidadeSel === v ? 'active' : ''}"
                onclick="selecionarComplexidade(${v})">
            <div style="font-size:1.1rem;font-weight:700;">${v}</div>
        </button>`).join('');
}

function selecionarComplexidade(val) {
    complexidadeSel = val;
    renderComplexidadeBtns();
    calcularPontos();
}

function calcularPontos() {
    if (!complexidadeSel) return;

    let peso = null;
    if (modoAtividade === 'padrao' && atividadeSel) {
        peso = atividadeSel.peso;
    } else if (modoAtividade === 'livre') {
        peso = 1; // peso padrão para atividade livre
    }

    if (peso === null) return;

    const pts = +(peso * complexidadeSel).toFixed(1);
    document.getElementById('pontosPreview').classList.add('visible');
    document.getElementById('pontosValor').textContent   = pts;
    document.getElementById('pontosFormula').textContent =
        modoAtividade === 'livre'
            ? `Peso base 1 × ${complexidadeSel} = ${pts} pts`
            : `${peso} × ${complexidadeSel} = ${pts} pts`;
}

// ── Adicionar atividade ao produto ────────────────────────────────────────────
async function adicionarAtividade() {
    if (!produtoAtualNov)  { Notify.warning('Selecione um produto primeiro!'); return; }
    if (!modoAtividade)    { Notify.warning('Preencha a Descrição ou selecione uma Atividade Padrão!'); return; }
    if (!complexidadeSel)  { Notify.warning('Selecione a complexidade!'); return; }

    const obs = document.getElementById('obsAtividade').value.trim();

    let novaAtiv;

    if (modoAtividade === 'livre') {
        const descricao = document.getElementById('descricaoLivre').value.trim();
        if (!descricao) { Notify.warning('Preencha a Descrição da Atividade!'); return; }
        const pts = +(1 * complexidadeSel).toFixed(1);
        novaAtiv = {
            codigo:        'LIVRE',
            atividade:     descricao,
            categoria:     categoriaAtualNov,
            areaAtividade: (window.CATEGORIAS[categoriaAtualNov]?.nome) || categoriaAtualNov,
            peso:          1,
            complexidade:  complexidadeSel,
            pontos:        pts,
            observacao:    obs,
            tipoLivre:     true
        };
    } else {
        const pts = +(atividadeSel.peso * complexidadeSel).toFixed(1);
        novaAtiv = {
            codigo:        atividadeSel.codigo,
            atividade:     atividadeSel.atividade,
            categoria:     atividadeSel.categoria,
            areaAtividade: (window.CATEGORIAS[atividadeSel.categoria]?.nome) || atividadeSel.categoria,
            peso:          atividadeSel.peso,
            complexidade:  complexidadeSel,
            pontos:        pts,
            observacao:    obs
        };
    }

    if (!produtoAtualNov.atividades) produtoAtualNov.atividades = [];
    produtoAtualNov.atividades.push(novaAtiv);
    await MockAPI.updateProduto(produtoAtualNov.id, produtoAtualNov);

    atualizarPainel();

    // Limpar para próxima
    atividadeSel    = null;
    complexidadeSel = null;
    modoAtividade   = null;
    document.getElementById('descricaoLivre').value      = '';
    document.getElementById('obsAtividade').value        = '';
    document.getElementById('atividadePadrao').value     = '';
    document.getElementById('atividadeInfo').style.display = 'none';
    document.getElementById('pontosPreview').classList.remove('visible');
    aplicarExclusividade();
    renderComplexidadeBtns();

    Notify.success('Atividade adicionada!');
}

// ── Painel direito ────────────────────────────────────────────────────────────
function atualizarPainel() {
    const lista = document.getElementById('painelLista');
    const count = document.getElementById('painelCount');
    const total = document.getElementById('painelTotal');
    const sub   = document.getElementById('painelSub');

    const atividades = produtoAtualNov?.atividades || [];
    const totalPts   = +atividades.reduce((s, a) => s + (a.pontos || 0), 0).toFixed(1);

    count.textContent = `${atividades.length} itens`;
    total.textContent = totalPts;
    sub.textContent   = `${atividades.length} atividade(s)`;

    if (atividades.length === 0) {
        lista.innerHTML = `
            <div class="no-produto-msg">
                <span style="font-size:2rem;">📝</span>
                <span>Nenhuma atividade adicionada</span>
            </div>`;
        return;
    }

    lista.innerHTML = atividades.map((a, i) => `
        <div class="painel-item">
            <div class="painel-item-info">
                <div class="painel-item-codigo">
                    ${a.tipoLivre
                        ? `<span style="font-size:0.7rem;background:rgba(245,158,11,0.15);color:var(--warning);border:1px solid var(--warning);border-radius:4px;padding:0.1rem 0.35rem;">LIVRE</span>`
                        : a.codigo}
                    <span style="font-size:0.7rem;color:var(--text-muted);margin-left:0.35rem;">${(window.CATEGORIAS[a.categoria]?.nome || a.categoria)}</span>
                </div>
                <div class="painel-item-nome">${a.atividade}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem;">
                    Peso ${a.peso} × ${a.complexidade}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <span class="painel-item-pts">${a.pontos} pts</span>
                <button onclick="editarAtividadePainel(${i})" title="Editar"
                    style="background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:4px;padding:0.15rem 0.45rem;cursor:pointer;font-size:0.75rem;transition:all 0.15s;"
                    onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary-light)'"
                    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">✏️</button>
                <button class="painel-item-remove" onclick="removerAtividadePainel(${i})" title="Remover">×</button>
            </div>
        </div>`).join('');
}

async function removerAtividadePainel(idx) {
    if (!produtoAtualNov) return;
    Notify.confirm('Remover esta atividade do produto?', async () => {
        produtoAtualNov.atividades.splice(idx, 1);
        await MockAPI.updateProduto(produtoAtualNov.id, produtoAtualNov);
        atualizarPainel();
        Notify.success('Atividade removida!');
    });
}

function editarAtividadePainel(idx) {
    if (!produtoAtualNov) return;
    const ativ = produtoAtualNov.atividades[idx];
    if (!ativ) return;

    const complexidades = window.COMPLEXIDADES || [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8];
    const complexBtns = complexidades.map(v =>
        '<button onclick="selecionarComplexEditar(' + v + ')" data-val="' + v + '" style="padding:0.4rem 0.9rem;border-radius:6px;border:2px solid ' + (ativ.complexidade===v?'var(--primary)':'var(--border)') + ';background:' + (ativ.complexidade===v?'var(--primary)':'transparent') + ';color:' + (ativ.complexidade===v?'white':'var(--text-secondary)') + ';cursor:pointer;font-size:0.9rem;font-weight:700;transition:all 0.15s;">' + v + '</button>'
    ).join('');

    const box = document.createElement('div');
    box.id = 'modalEditarAtiv';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:20000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    const inner = document.createElement('div');
    inner.style.cssText = 'background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:440px;width:100%;max-height:90vh;overflow-y:auto;';
    inner.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">' +
            '<h3 style="font-size:1rem;margin:0;">✏️ Editar Atividade</h3>' +
            '<button id="btnFecharEditModal" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.4rem;line-height:1;">&times;</button>' +
        '</div>' +
        // Código (somente leitura)
        '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">' +
            '<span style="font-family:var(--code-font);font-size:0.85rem;color:var(--secondary-light);font-weight:700;background:var(--bg-dark);padding:0.2rem 0.6rem;border-radius:4px;">' + (ativ.tipoLivre ? 'LIVRE' : ativ.codigo) + '</span>' +
            '<span style="font-size:0.75rem;color:var(--text-muted);">' + (window.CATEGORIAS?.[ativ.categoria]?.nome || ativ.categoria) + '</span>' +
        '</div>' +
        // Descrição — editável sempre
        '<div style="margin-bottom:1rem;">' +
            '<label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Descrição</label>' +
            '<textarea id="editDescricao" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.85rem;resize:vertical;min-height:65px;box-sizing:border-box;">' + ativ.atividade + '</textarea>' +
        '</div>' +
        // Peso — dropdown 2 a 20 de 2 em 2
        '<div style="margin-bottom:1rem;">' +
            '<label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Peso</label>' +
            '<select id="editPeso" onchange="atualizarPreviewEditar()" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.95rem;font-weight:700;box-sizing:border-box;cursor:pointer;">' +
                [2,4,6,8,10,12,14,16,18,20].map(v => '<option value="' + v + '"' + (ativ.peso === v ? ' selected' : '') + '>' + v + '</option>').join('') +
            '</select>' +
        '</div>' +
        // Complexidade
        '<div style="margin-bottom:1rem;">' +
            '<label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Complexidade (multiplicador)</label>' +
            '<div id="complexEditBtns" style="display:flex;flex-wrap:wrap;gap:0.5rem;">' + complexBtns + '</div>' +
        '</div>' +
        // Preview pontos
        '<div style="background:rgba(16,185,129,0.08);border:1px solid var(--success);border-radius:8px;padding:0.75rem;text-align:center;margin-bottom:1.25rem;">' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem;">Pontos Calculados</div>' +
            '<div id="editPontosValor" style="font-size:2rem;font-weight:700;color:var(--success);font-family:var(--code-font);">' + ativ.pontos + '</div>' +
            '<div id="editPontosFormula" style="font-size:0.75rem;color:var(--text-muted);">' + ativ.peso + ' x ' + ativ.complexidade + ' = ' + ativ.pontos + ' pts</div>' +
        '</div>' +
        // Botões
        '<div style="display:flex;gap:0.75rem;">' +
            '<button id="btnCancelarEditModal" class="btn btn-secondary" style="flex:1;">Cancelar</button>' +
            '<button id="btnSalvarEditModal" class="btn btn-primary" style="flex:1;">💾 Salvar</button>' +
        '</div>';

    box.appendChild(inner);
    document.body.appendChild(box);

    box._complexSel = ativ.complexidade;
    box._editIdx = idx;

    box.querySelector('#btnFecharEditModal').onclick = () => box.remove();
    box.querySelector('#btnCancelarEditModal').onclick = () => box.remove();
    box.querySelector('#btnSalvarEditModal').onclick = () => confirmarEdicaoAtiv(idx);
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
}

function selecionarComplexEditar(val) {
    const box = document.getElementById('modalEditarAtiv');
    if (!box) return;
    box._complexSel = val;
    box.querySelectorAll('#complexEditBtns button').forEach(b => {
        const active = parseFloat(b.dataset.val) === val;
        b.style.background  = active ? 'var(--primary)' : 'transparent';
        b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
    });
    atualizarPreviewEditar();
}

function atualizarPreviewEditar() {
    const box = document.getElementById('modalEditarAtiv');
    if (!box) return;
    const pesoInput = box.querySelector('#editPeso');
    const peso = pesoInput ? (parseFloat(pesoInput.value) || 0) : 0;
    const complex = box._complexSel || 1;
    const pts = +(peso * complex).toFixed(1);
    const valEl = box.querySelector('#editPontosValor');
    const frmEl = box.querySelector('#editPontosFormula');
    if (valEl) valEl.textContent = pts;
    if (frmEl) frmEl.textContent = peso + ' x ' + complex + ' = ' + pts + ' pts';
}

async function confirmarEdicaoAtiv(idx) {
    const box = document.getElementById('modalEditarAtiv');
    if (!box || !produtoAtualNov) return;
    const ativ = produtoAtualNov.atividades[idx];
    if (!ativ) return;

    const novaDesc  = box.querySelector('#editDescricao');
    const novoPeso  = box.querySelector('#editPeso');
    const novaComplex = box._complexSel || ativ.complexidade;

    if (novaDesc && novaDesc.value.trim()) ativ.atividade  = novaDesc.value.trim();
    if (novoPeso && parseFloat(novoPeso.value) > 0)  ativ.peso = parseFloat(novoPeso.value);

    ativ.complexidade = novaComplex;
    ativ.pontos = +(ativ.peso * novaComplex).toFixed(1);

    await MockAPI.updateProduto(produtoAtualNov.id, produtoAtualNov);
    box.remove();
    atualizarPainel();
    Notify.success('Atividade atualizada!');
}

