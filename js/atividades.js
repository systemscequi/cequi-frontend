let atividades = {};
let categoriaAtual = 'DGSPI';
let editandoId = null;

const categorias = {
    DGSPI: 'Direção, gestão, supervisão, planejamento e informação',
    EAC: 'Engenharia de ar condicionado',
    EPCI: 'Engenharia de proteção contra incêndio',
    EEME: 'Engenharia de equipamentos mecânicos e eletrônicos',
    ECA: 'Engenharia de controle e automação',
    ETP: 'Engenharia de transportes prediais'
};

// ── Gera o próximo código automaticamente ────────────────────────────────
function gerarProximoCodigo(categoria) {
    const lista = atividades[categoria] || [];
    // Pega todos os números usados nesta categoria
    const nums = lista.map(a => {
        const match = a.codigo.match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
    });
    const proximo = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return categoria + String(proximo).padStart(2, '0');
}

function atualizarPreviewCodigo() {
    const el = document.getElementById('codigoPreview');
    if (el) el.value = editandoId ? '(editando)' : gerarProximoCodigo(categoriaAtual);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Tenta carregar do backend (MockAPI); se falhar, usa mock local
    try {
        const result = await MockAPI.getAtividades();
        if (result.success && result.data && typeof result.data === 'object') {
            atividades = result.data;
        } else {
            atividades = MOCK_ATIVIDADES;
        }
    } catch (e) {
        atividades = MOCK_ATIVIDADES;
    }
    setupEventListeners();
    renderizarTabela();
    atualizarPreviewCodigo();
});

function setupEventListeners() {
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            categoriaAtual = this.dataset.category;

            const isLivre = categoriaAtual === 'LIVRE';
            document.getElementById('categorySubtitle').textContent = isLivre
                ? 'Atividades criadas livremente pelos usuários'
                : `Categoria: ${categorias[categoriaAtual]}`;

            // Ocultar formulário na aba LIVRE (somente leitura)
            document.getElementById('atividadeForm').closest('.card').style.display = isLivre ? 'none' : '';

            renderizarTabela();
            limparForm();
            atualizarPreviewCodigo();
        });
    });

    document.getElementById('atividadeForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const atividade = document.getElementById('atividade').value;
        const peso = parseInt(document.getElementById('pesoPadrao').value);

        if (!atividades[categoriaAtual]) atividades[categoriaAtual] = [];

        if (editandoId) {
            const index = atividades[categoriaAtual].findIndex(a => a.id === editandoId);
            const codigoExistente = atividades[categoriaAtual][index].codigo;
            const atualizada = { id: editandoId, codigo: codigoExistente, atividade, peso, categoria: categoriaAtual };
            // Atualizar UI imediatamente
            atividades[categoriaAtual][index] = atualizada;
            // Persistir no backend (usa o id real do banco se disponível)
            const idBanco = atividades[categoriaAtual][index].idBanco || editandoId;
            MockAPI.updateAtividade(idBanco, { codigo: codigoExistente, atividade, peso, categoria: categoriaAtual })
                .catch(function() {}); // silencioso — UI já atualizada
        } else {
            const codigo = gerarProximoCodigo(categoriaAtual);
            const novoId = atividades[categoriaAtual].length + 1;
            const nova = { id: novoId, codigo, atividade, peso, categoria: categoriaAtual };
            atividades[categoriaAtual].push(nova);
            MockAPI.createAtividade({ codigo, atividade, peso, categoria: categoriaAtual })
                .catch(function() {}); // silencioso — UI já atualizada
        }

        renderizarTabela();
        limparForm();
        atualizarPreviewCodigo();
        Utils.showSuccess('Atividade salva com sucesso!');
    });

    document.getElementById('searchBox').addEventListener('input', Utils.debounce((e) => {
        const termo = e.target.value.toLowerCase();
        if (categoriaAtual === 'LIVRE') {
            const livres = coletarAtividadesLivres();
            renderizarTabelaLivre(livres.filter(a =>
                a.descricao.toLowerCase().includes(termo) ||
                a.servidor.toLowerCase().includes(termo) ||
                a.categoria.toLowerCase().includes(termo)
            ));
            return;
        }
        const filtrados = atividades[categoriaAtual].filter(ativ =>
            ativ.codigo.toLowerCase().includes(termo) ||
            ativ.atividade.toLowerCase().includes(termo)
        );
        renderizarTabela(filtrados);
    }, 300));
}

// ── Coleta todas as atividades livres de todos os produtos/servidores ──
function coletarAtividadesLivres() {
    const todos = DataStore.getProdutos() || [];
    const colaboradores = window.MOCK_COLABORADORES || [];
    const livres = [];

    todos.forEach(prod => {
        const servidor = colaboradores.find(c => c.id === prod.servidorId);
        const nomeServidor = servidor ? servidor.nome : 'Desconhecido';
        (prod.atividades || []).forEach((a, idx) => {
            if (a.tipoLivre) {
                // Gera código sequencial LIVRE01, LIVRE02...
                const num = String(livres.length + 1).padStart(2, '0');
                livres.push({
                    codigo:       a.codigo && a.codigo !== 'LIVRE' ? a.codigo : 'LIVRE' + num,
                    descricao:    a.atividade,
                    categoria:    a.categoria || '—',
                    peso:         a.peso,
                    complexidade: a.complexidade,
                    pontos:       a.pontos,
                    observacao:   a.observacao || '',
                    servidor:     nomeServidor,
                    produto:      prod.nome,
                    produtoId:    prod.id,
                    atividadeIdx: idx
                });
            }
        });
    });

    return livres;
}

function renderizarTabelaLivre(dados) {
    const tbody = document.getElementById('atividadesTable');
    document.getElementById('atividadeCount').textContent =
        `${dados.length} ${dados.length === 1 ? 'atividade livre' : 'atividades livres'}`;

    // Atualizar cabeçalho
    tbody.closest('table').querySelector('thead tr').innerHTML = `
        <th>Código</th>
        <th>Servidor</th>
        <th>Produto</th>
        <th>Descrição</th>
        <th>Categoria</th>
        <th>Peso × Cx.</th>
        <th>Pontos</th>
        <th>Ações</th>
    `;

    if (dados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-state-icon">🆓</div>
                    <p>Nenhuma atividade livre registrada</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = dados.map((a, i) => `
        <tr>
            <td><span class="code-badge" style="background:rgba(245,158,11,0.15);color:var(--warning);border:1px solid var(--warning);font-size:0.75rem;">${a.codigo}</span></td>
            <td style="font-size:0.82rem;white-space:nowrap;">${a.servidor}</td>
            <td style="font-size:0.78rem;color:var(--text-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.produto}">${a.produto}</td>
            <td style="font-size:0.83rem;">${a.descricao}${a.observacao ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">Obs: ${a.observacao}</div>` : ''}</td>
            <td><span class="code-badge cat-${a.categoria}" style="font-size:0.75rem;">${a.categoria}</span></td>
            <td style="text-align:center;font-size:0.82rem;">${a.peso} × ${a.complexidade}</td>
            <td><span class="peso-badge">${a.pontos} pts</span></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon" onclick="abrirModalTornarPadrao(${a.produtoId}, ${a.atividadeIdx})" title="Tornar Padrão"
                        style="background:rgba(99,102,241,0.12);border:1px solid #6366f1;color:#818cf8;border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.9rem;">⭐</button>
                    <button class="btn-icon edit" onclick="editarAtividadeLivre(${a.produtoId}, ${a.atividadeIdx})" title="Editar">✏️</button>
                    <button class="btn-icon delete" onclick="excluirAtividadeLivre(${a.produtoId}, ${a.atividadeIdx})" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function editarAtividadeLivre(produtoId, atividadeIdx) {
    const prod = DataStore.getProdutos().find(p => p.id === produtoId);
    if (!prod || !prod.atividades[atividadeIdx]) return;
    const a = prod.atividades[atividadeIdx];

    const complexidades = window.COMPLEXIDADES || [0.5, 1, 1.5];
    const complexBtns = complexidades.map(v =>
        `<button type="button" onclick="selecionarComplexLivre(${v})" data-val="${v}"
            style="padding:0.4rem 0.9rem;border-radius:6px;border:2px solid ${a.complexidade===v?'var(--primary)':'var(--border)'};
                   background:${a.complexidade===v?'var(--primary)':'transparent'};
                   color:${a.complexidade===v?'white':'var(--text-secondary)'};
                   cursor:pointer;font-size:0.9rem;font-weight:700;transition:all 0.15s;">${v}</button>`
    ).join('');

    const pesoOpts = [2,4,6,8,10,12,14,16,18,20].map(v =>
        `<option value="${v}"${a.peso===v?' selected':''}>${v}</option>`
    ).join('');

    const box = document.createElement('div');
    box.id = 'modalEditarLivre';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:20000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    box._complexSel = a.complexidade;

    box.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:440px;width:100%;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="font-size:1rem;margin:0;">✏️ Editar Atividade Livre</h3>
                <button onclick="document.getElementById('modalEditarLivre').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.4rem;line-height:1;">&times;</button>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
                <span style="font-size:0.75rem;background:rgba(245,158,11,0.15);color:var(--warning);border:1px solid var(--warning);border-radius:4px;padding:0.2rem 0.6rem;font-weight:700;">LIVRE</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${(window.CATEGORIAS?.[a.categoria]?.icone||'')} ${a.categoria}</span>
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Descrição</label>
                <textarea id="livreEditDesc" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.85rem;resize:vertical;min-height:65px;box-sizing:border-box;">${a.atividade}</textarea>
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Peso</label>
                <select id="livreEditPeso" onchange="atualizarPreviewLivre()" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.95rem;font-weight:700;box-sizing:border-box;cursor:pointer;">
                    ${pesoOpts}
                </select>
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Complexidade (multiplicador)</label>
                <div id="livreComplexBtns" style="display:flex;flex-wrap:wrap;gap:0.5rem;">${complexBtns}</div>
            </div>
            <div style="background:rgba(16,185,129,0.08);border:1px solid var(--success);border-radius:8px;padding:0.75rem;text-align:center;margin-bottom:1.25rem;">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem;">Pontos Calculados</div>
                <div id="livreEditPtsValor" style="font-size:2rem;font-weight:700;color:var(--success);font-family:var(--code-font);">${a.pontos}</div>
                <div id="livreEditPtsFormula" style="font-size:0.75rem;color:var(--text-muted);">${a.peso} × ${a.complexidade} = ${a.pontos} pts</div>
            </div>
            <div style="display:flex;gap:0.75rem;">
                <button onclick="document.getElementById('modalEditarLivre').remove()" class="btn btn-secondary" style="flex:1;">Cancelar</button>
                <button onclick="salvarEdicaoLivre(${produtoId}, ${atividadeIdx})" class="btn btn-primary" style="flex:1;">💾 Salvar</button>
            </div>
        </div>`;

    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
}

function selecionarComplexLivre(val) {
    const box = document.getElementById('modalEditarLivre');
    if (!box) return;
    box._complexSel = val;
    box.querySelectorAll('#livreComplexBtns button').forEach(b => {
        const active = parseFloat(b.dataset.val) === val;
        b.style.background  = active ? 'var(--primary)' : 'transparent';
        b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
        b.style.color       = active ? 'white' : 'var(--text-secondary)';
    });
    atualizarPreviewLivre();
}

function atualizarPreviewLivre() {
    const box = document.getElementById('modalEditarLivre');
    if (!box) return;
    const peso    = parseFloat(document.getElementById('livreEditPeso').value) || 0;
    const complex = box._complexSel || 1;
    const pts     = +(peso * complex).toFixed(1);
    document.getElementById('livreEditPtsValor').textContent   = pts;
    document.getElementById('livreEditPtsFormula').textContent = `${peso} × ${complex} = ${pts} pts`;
}

async function salvarEdicaoLivre(produtoId, atividadeIdx) {
    const prod = DataStore.getProdutos().find(p => p.id === produtoId);
    if (!prod || !prod.atividades[atividadeIdx]) return;

    const box     = document.getElementById('modalEditarLivre');
    const desc    = document.getElementById('livreEditDesc').value.trim();
    const peso    = parseFloat(document.getElementById('livreEditPeso').value);
    const complex = box ? box._complexSel : prod.atividades[atividadeIdx].complexidade;

    if (!desc) { Notify.warning('Preencha a descrição!'); return; }

    prod.atividades[atividadeIdx].atividade    = desc;
    prod.atividades[atividadeIdx].peso         = peso;
    prod.atividades[atividadeIdx].complexidade = complex;
    prod.atividades[atividadeIdx].pontos       = +(peso * complex).toFixed(1);

    await MockAPI.updateProduto(produtoId, prod);
    box?.remove();
    Notify.success('Atividade livre atualizada!');
    renderizarTabelaLivre(coletarAtividadesLivres());
}

function abrirModalTornarPadrao(produtoId, atividadeIdx) {
    const prod = DataStore.getProdutos().find(p => p.id === produtoId);
    if (!prod || !prod.atividades[atividadeIdx]) return;
    const a = prod.atividades[atividadeIdx];

    const catOpts = Object.entries(categorias).map(([key, nome]) =>
        `<option value="${key}"${a.categoria===key?' selected':''}>${key} — ${nome}</option>`
    ).join('');

    const pesoOpts = [2,4,6,8,10,12,14,16,18,20].map(v =>
        `<option value="${v}"${a.peso===v?' selected':''}>${v}</option>`
    ).join('');

    const box = document.createElement('div');
    box.id = 'modalTornarPadrao';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:20000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    box.innerHTML = `
        <div style="background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;padding:1.75rem;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;animation:scaleIn 0.2s ease;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <div>
                    <h3 style="font-size:1rem;margin:0;">⭐ Tornar Atividade Padrão</h3>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:0.25rem 0 0;">Revise os dados antes de confirmar</p>
                </div>
                <button onclick="document.getElementById('modalTornarPadrao').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.4rem;line-height:1;">&times;</button>
            </div>

            <!-- Categoria -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Categoria <span style="color:var(--danger);">*</span></label>
                <select id="padrao-categoria" onchange="atualizarCodigoPadrao()" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.9rem;box-sizing:border-box;cursor:pointer;">
                    ${catOpts}
                </select>
            </div>

            <!-- Código gerado -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Código (gerado automaticamente)</label>
                <input id="padrao-codigo" readonly style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--secondary-light);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.95rem;font-weight:700;box-sizing:border-box;opacity:0.8;cursor:not-allowed;" value="">
            </div>

            <!-- Descrição -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Descrição <span style="color:var(--danger);">*</span></label>
                <textarea id="padrao-descricao" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.85rem;resize:vertical;min-height:70px;box-sizing:border-box;">${a.atividade}</textarea>
            </div>

            <!-- Peso -->
            <div style="margin-bottom:1.5rem;">
                <label style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.4rem;">Peso Padrão <span style="color:var(--danger);">*</span></label>
                <select id="padrao-peso" style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.95rem;font-weight:700;box-sizing:border-box;cursor:pointer;">
                    ${pesoOpts}
                </select>
            </div>

            <div style="background:rgba(99,102,241,0.08);border:1px solid #6366f1;border-radius:8px;padding:0.85rem;margin-bottom:1.25rem;font-size:0.82rem;color:#a5b4fc;">
                ⚠️ Esta atividade será adicionada à lista de <strong>atividades padrão</strong> da categoria selecionada e ficará disponível para todos os servidores.
            </div>

            <div style="display:flex;gap:0.75rem;">
                <button onclick="document.getElementById('modalTornarPadrao').remove()" class="btn btn-secondary" style="flex:1;">Cancelar</button>
                <button onclick="confirmarTornarPadrao(${produtoId}, ${atividadeIdx})" class="btn btn-primary" style="flex:1;background:#6366f1;border-color:#6366f1;">⭐ Confirmar</button>
            </div>
        </div>`;

    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });

    // Gerar código inicial após DOM renderizar
    setTimeout(() => atualizarCodigoPadrao(), 0);
}

function atualizarCodigoPadrao() {
    const cat = document.getElementById('padrao-categoria')?.value;
    const el  = document.getElementById('padrao-codigo');
    if (cat && el) el.value = gerarProximoCodigo(cat);
}

function confirmarTornarPadrao(produtoId, atividadeIdx) {
    const cat       = document.getElementById('padrao-categoria').value;
    const descricao = document.getElementById('padrao-descricao').value.trim();
    const peso      = parseInt(document.getElementById('padrao-peso').value);
    // Usa o código exibido no campo (sempre sincronizado com a categoria via atualizarCodigoPadrao)
    const codigo    = document.getElementById('padrao-codigo').value || gerarProximoCodigo(cat);

    if (!descricao) { Notify.warning('Preencha a descrição!'); return; }

    Notify.confirm(
        `Adicionar "${descricao.substring(0,50)}${descricao.length>50?'...':''}" como atividade padrão da categoria ${cat} com código ${codigo}?`,
        () => {
            if (!atividades[cat]) atividades[cat] = [];
            const novoId = atividades[cat].length + 1;
            atividades[cat].push({ id: novoId, codigo, atividade: descricao, peso, categoria: cat });

            document.getElementById('modalTornarPadrao')?.remove();
            Notify.success(`Atividade ${codigo} adicionada como padrão em ${cat}!`);

            if (categoriaAtual === cat) renderizarTabela();
            renderizarTabelaLivre(coletarAtividadesLivres());
        }
    );
}

async function excluirAtividadeLivre(produtoId, atividadeIdx) {
    Notify.confirm('Deseja excluir esta atividade livre?', async () => {
        const prod = DataStore.getProdutos().find(p => p.id === produtoId);
        if (!prod) return;
        prod.atividades.splice(atividadeIdx, 1);
        await MockAPI.updateProduto(produtoId, prod);
        Notify.success('Atividade livre excluída!');
        renderizarTabelaLivre(coletarAtividadesLivres());
    });
}

function renderizarTabela(dados = null) {
    if (categoriaAtual === 'LIVRE') {
        const livres = dados || coletarAtividadesLivres();
        // Restaurar cabeçalho padrão antes de renderizar
        document.querySelector('#atividadesTable').closest('table').querySelector('thead tr').innerHTML = `
            <th>Código</th><th>Atividade</th><th>Peso</th><th>Ações</th>`;
        renderizarTabelaLivre(livres);
        return;
    }

    // Restaurar cabeçalho padrão (caso venha da aba LIVRE)
    document.querySelector('#atividadesTable').closest('table').querySelector('thead tr').innerHTML = `
        <th>Código</th><th>Atividade</th><th>Peso</th><th>Ações</th>`;

    const tbody = document.getElementById('atividadesTable');
    const atividadesCategoria = dados || atividades[categoriaAtual] || [];

    document.getElementById('atividadeCount').textContent = `${atividadesCategoria.length} ${atividadesCategoria.length === 1 ? 'atividade' : 'atividades'}`;

    if (atividadesCategoria.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p>Nenhuma atividade cadastrada</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = atividadesCategoria.map(ativ => `
        <tr>
            <td><span class="code-badge cat-${ativ.categoria}">${ativ.codigo}</span></td>
            <td>${Utils.truncate(ativ.atividade, 80)}</td>
            <td><span class="peso-badge">${ativ.peso} pts</span></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon edit" onclick="editarAtividade(${ativ.id})" title="Editar">✏️</button>
                    <button class="btn-icon delete" onclick="excluirAtividade(${ativ.id})" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function editarAtividade(id) {
    const ativ = atividades[categoriaAtual].find(a => a.id === id);
    if (ativ) {
        document.getElementById('atividade').value = ativ.atividade;
        document.getElementById('pesoPadrao').value = ativ.peso;
        const el = document.getElementById('codigoPreview');
        if (el) el.value = ativ.codigo + ' (editando)';
        editandoId = id;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function excluirAtividade(id) {
    Notify.confirm('Deseja excluir esta atividade?', () => {
        MockAPI.deleteAtividade(id).catch(function() {});
        atividades[categoriaAtual] = atividades[categoriaAtual].filter(a => a.id !== id);
        renderizarTabela();
        atualizarPreviewCodigo();
        Utils.showSuccess('Atividade excluída!');
    });
}

function limparForm() {
    document.getElementById('atividadeForm').reset();
    editandoId = null;
    atualizarPreviewCodigo();
}
