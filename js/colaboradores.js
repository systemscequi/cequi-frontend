/**
 * CEQUI - Colaboradores
 * Cadastro, edição de senha e nível de acesso
 */

let colaboradores = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadColaboradores();
    setupEventListeners();
});

// ─── Carregar ────────────────────────────────────────────────────────
async function loadColaboradores() {
    try {
        // Usar MockAPI.getTodosColaboradores se disponível (backend ativo)
        // senão usar getColaboradores normal
        const fn = typeof MockAPI.getTodosColaboradores === 'function'
            ? MockAPI.getTodosColaboradores
            : MockAPI.getColaboradores;
        const result = await fn.call(MockAPI);
        if (result && result.success) {
            colaboradores = result.data;
            renderizarTabela();
        }
    } catch (err) {
        console.error(err);
        Notify.error('Erro ao carregar colaboradores');
    }
}

// ─── Tabela ──────────────────────────────────────────────────────────
function renderizarTabela(dados = colaboradores) {
    const tbody = document.getElementById('colaboradoresTable');

    if (!dados.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
            <div class="empty-state-icon">👤</div><p>Nenhum colaborador cadastrado</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = dados.map(col => {
        const isAdmin  = col.role === 'admin';
        const roleBadge = isAdmin
            ? `<span class="badge-admin">🔑 Admin</span>`
            : `<span class="badge-user">👤 Usuário</span>`;
        // Senha é hash bcrypt no banco — mostrar indicador seguro
        const senhaTexto = col.senha && col.senha.startsWith('$2')
            ? '<span style="color:var(--success);font-size:0.75rem;">✓ Definida</span>'
            : (col.senha ? '••••••••' : '—');

        return `
        <tr onclick="abrirModalEdicao(${col.id})">
            <td><span class="ponto-badge">P${col.ponto}</span></td>
            <td style="font-weight:600;">${col.nome}</td>
            <td><span class="area-badge">${col.area}</span></td>
            <td>${roleBadge}</td>
            <td><span class="senha-dots" title="Clique para editar">${senhaTexto}</span></td>
            <td onclick="event.stopPropagation()">
                <div class="actions-cell">
                    <button class="btn-icon edit"   onclick="abrirModalEdicao(${col.id})" title="Editar">✏️</button>
                    <button class="btn-icon delete" onclick="excluirColaborador(${col.id})" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─── Modal de edição ─────────────────────────────────────────────────
function abrirModalEdicao(id) {
    document.getElementById('modalColaborador')?.remove();

    const col = colaboradores.find(c => c.id === id);
    if (!col) return;

    const isAdmin = col.role === 'admin';

    const overlay = document.createElement('div');
    overlay.id = 'modalColaborador';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-box">

            <!-- Cabeçalho -->
            <div class="modal-header">
                <div>
                    <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.3rem;">Editando colaborador</div>
                    <div style="font-size:1.15rem;font-weight:700;">${col.nome}</div>
                    <span class="ponto-badge" style="margin-top:0.4rem;display:inline-block;">P${col.ponto}</span>
                </div>
                <button class="modal-close" onclick="document.getElementById('modalColaborador').remove()">×</button>
            </div>

            <!-- Nome + Ponto -->
            <div style="display:grid;grid-template-columns:1fr auto;gap:1rem;margin-bottom:1.25rem;">
                <div>
                    <label class="form-label">Nome <span class="required">*</span></label>
                    <input type="text" id="editNome" class="form-input" value="${col.nome}" style="width:100%;">
                </div>
                <div style="width:90px;">
                    <label class="form-label">Ponto <span class="required">*</span></label>
                    <input type="number" id="editPonto" class="form-input" value="${col.ponto}" min="1" style="width:100%;">
                </div>
            </div>

            <!-- Área -->
            <div style="margin-bottom:1.25rem;">
                <label class="form-label">Área Temática <span class="required">*</span></label>
                <select id="editArea" class="form-select" style="width:100%;">
                    <option value="Mecânica"   ${col.area==='Mecânica'   ?'selected':''}>Mecânica</option>
                    <option value="Eletrônica" ${col.area==='Eletrônica' ?'selected':''}>Eletrônica</option>
                    <option value="CEQUI"      ${col.area==='CEQUI'      ?'selected':''}>CEQUI</option>
                </select>
            </div>

            <!-- Nível de acesso -->
            <div style="margin-bottom:1.25rem;">
                <label class="form-label">Nível de Acesso <span class="required">*</span></label>
                <div class="role-grid">
                    <div id="cardUser" class="role-card ${!isAdmin ? 'selected-user' : ''}" onclick="selecionarRole('user')">
                        <div class="role-card-icon">👤</div>
                        <div class="role-card-label" style="color:${!isAdmin ? 'var(--success)' : 'var(--text-secondary)'};">Usuário</div>
                        <div class="role-card-sub">Acesso aos próprios dados</div>
                    </div>
                    <div id="cardAdmin" class="role-card ${isAdmin ? 'selected-admin' : ''}" onclick="selecionarRole('admin')">
                        <div class="role-card-icon">🔑</div>
                        <div class="role-card-label" style="color:${isAdmin ? '#f59e0b' : 'var(--text-secondary)'};">Admin</div>
                        <div class="role-card-sub">Acesso total ao sistema</div>
                    </div>
                </div>
                <input type="hidden" id="editRole" value="${col.role || 'user'}">
            </div>

            <!-- Senha -->
            <div style="margin-bottom:1.75rem;">
                <label class="form-label">Nova Senha de Acesso</label>
                <div class="senha-wrapper">
                    <input type="password" id="editSenha" class="form-input"
                           placeholder="Deixe em branco para manter a atual"
                           autocomplete="new-password">
                    <button type="button" class="btn-eye" id="btnOlho" onclick="toggleOlho()" title="Mostrar senha">👁️</button>
                </div>
                <div class="senha-hint" id="senhaHint">
                    🔒 Deixe em branco para <strong>manter a senha atual</strong>. Preencha para redefinir.
                </div>
                <div id="senhaNovaConfirm" style="display:none;margin-top:0.5rem;padding:0.5rem 0.75rem;background:rgba(16,185,129,0.1);border:1px solid var(--success);border-radius:6px;font-size:0.82rem;color:var(--success);">
                    ✅ Nova senha: <code id="senhaNovaTexto" style="font-family:var(--code-font);"></code>
                </div>
            </div>

            <!-- Rodapé -->
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;padding-top:1rem;border-top:1px solid var(--border);">
                <button onclick="document.getElementById('modalColaborador').remove()"
                        class="btn btn-secondary">Cancelar</button>
                <button onclick="salvarEdicao(${col.id})" class="btn btn-primary">💾 Salvar Alterações</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Mostrar confirmação ao digitar nova senha
    document.getElementById('editSenha').addEventListener('input', function() {
        const confirm = document.getElementById('senhaNovaConfirm');
        const texto   = document.getElementById('senhaNovaTexto');
        if (this.value.length >= 4) {
            confirm.style.display = 'block';
            texto.textContent = this.value;
        } else {
            confirm.style.display = 'none';
        }
    });
}

// ─── Selecionar role via cards ────────────────────────────────────────
function selecionarRole(role) {
    const cardUser  = document.getElementById('cardUser');
    const cardAdmin = document.getElementById('cardAdmin');
    const hiddenRole = document.getElementById('editRole');
    if (!cardUser || !cardAdmin || !hiddenRole) return;

    hiddenRole.value = role;

    cardUser.className  = 'role-card' + (role === 'user'  ? ' selected-user'  : '');
    cardAdmin.className = 'role-card' + (role === 'admin' ? ' selected-admin' : '');

    cardUser.querySelector('.role-card-label').style.color  = role === 'user'  ? 'var(--success)' : 'var(--text-secondary)';
    cardAdmin.querySelector('.role-card-label').style.color = role === 'admin' ? '#f59e0b'        : 'var(--text-secondary)';
}

// ─── Toggle visibilidade senha ────────────────────────────────────────
function toggleOlho() {
    const input = document.getElementById('editSenha');
    const btn   = document.getElementById('btnOlho');
    if (!input) return;
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
    else                           { input.type = 'password'; btn.textContent = '👁️'; }
}

// ─── Salvar edição ────────────────────────────────────────────────────
function salvarEdicao(id) {
    const nome  = document.getElementById('editNome')?.value.trim();
    const ponto = parseInt(document.getElementById('editPonto')?.value);
    const area  = document.getElementById('editArea')?.value;
    const role  = document.getElementById('editRole')?.value || 'user';
    const senha = document.getElementById('editSenha')?.value.trim();

    if (!nome)               { Notify.error('Informe o nome!'); return; }
    if (!ponto || ponto < 1) { Notify.error('Informe o ponto!'); return; }
    if (!area)               { Notify.error('Selecione a área!'); return; }
    if (senha && senha.length < 4) { Notify.error('Senha deve ter ao menos 4 caracteres!'); return; }

    const dup = colaboradores.find(c => c.ponto === ponto && c.id !== id);
    if (dup) { Notify.error(`Ponto ${ponto} já está em uso por ${dup.nome}!`); return; }

    // Só inclui senha no payload se foi preenchida
    const payload = { nome, ponto, area, role };
    if (senha) payload.senha = senha;

    const idx = colaboradores.findIndex(c => c.id === id);
    if (idx !== -1) {
        MockAPI.updateColaborador(id, payload)
            .then(function(result) {
                if (result.success) {
                    // Recarregar lista para mostrar dados atualizados do banco
                    loadColaboradores();
                    Notify.success('Colaborador atualizado!');
                } else {
                    Notify.error(result.message || 'Erro ao atualizar.');
                }
            }).catch(function() {
                Notify.error('Erro de conexão ao salvar.');
            });
    }

    document.getElementById('modalColaborador')?.remove();
}

// ─── Novo colaborador ─────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('colaboradorForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const nome  = document.getElementById('nomeServidor').value.trim();
        const ponto = parseInt(document.getElementById('ponto').value);
        const area  = document.getElementById('areaTematica').value;
        const role  = document.getElementById('novoRole').value;
        const senha = document.getElementById('novaSenha').value.trim() || 'cequi2026';

        if (!nome || !ponto || !area) { Notify.error('Preencha todos os campos obrigatórios!'); return; }

        const dup = colaboradores.find(c => c.ponto === ponto);
        if (dup) { Notify.error(`Ponto ${ponto} já está em uso por ${dup.nome}!`); return; }

        MockAPI.createColaborador({ nome, ponto, area, role, senha })
            .then(function(result) {
                if (result.success) {
                    document.getElementById('colaboradorForm').reset();
                    Notify.success('Colaborador cadastrado com sucesso!');
                    // Recarregar lista completa do banco
                    loadColaboradores();
                } else {
                    Notify.error(result.message || 'Erro ao cadastrar colaborador.');
                }
            }).catch(function() {
                Notify.error('Erro de conexão ao salvar colaborador.');
            });
    });

    document.getElementById('searchBox').addEventListener('input', Utils.debounce(e => {
        const t = e.target.value.toLowerCase();
        renderizarTabela(colaboradores.filter(c =>
            c.nome.toLowerCase().includes(t) ||
            c.area.toLowerCase().includes(t) ||
            String(c.ponto).includes(t)
        ));
    }, 300));
}

// ─── Excluir ──────────────────────────────────────────────────────────
function excluirColaborador(id) {
    id = parseInt(id);
    const col = colaboradores.find(c => parseInt(c.id) === id);
    if (!col) return;

    // Proteção: não pode excluir a própria conta
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (session && parseInt(session.userId) === id) {
        Notify.error('Você não pode excluir sua própria conta.');
        return;
    }

    // Proteção: não pode excluir o último admin
    const admins = colaboradores.filter(c => c.role === 'admin' && parseInt(c.id) !== id);
    if (col.role === 'admin' && admins.length === 0) {
        Notify.error('Não é possível excluir o único administrador do sistema.');
        return;
    }

    Notify.confirm(`Excluir "${col.nome}"? Esta ação não pode ser desfeita.`, () => {
        console.log('🗑️ Confirmado — chamando deleteColaborador id:', id);
        MockAPI.deleteColaborador(id).then(result => {
            console.log('🗑️ Resultado:', result);
            if (result && result.success) {
                colaboradores = colaboradores.filter(c => parseInt(c.id) !== id);
                DataStore.saveColaboradores(colaboradores);
                renderizarTabela();
                Notify.success('Colaborador excluído!');
            } else {
                Notify.error(result?.message || 'Erro ao excluir colaborador.');
            }
        }).catch(e => {
            console.log('🗑️ Erro:', e);
            Notify.error('Erro ao conectar com o servidor.');
        });
    });
}

// Expor funções globais para onclick inline
window.excluirColaborador = excluirColaborador;
window.abrirModalEdicao   = abrirModalEdicao;
