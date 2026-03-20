/**
 * CEQUI - Sistema de Notificações
 * Toast notifications modernas
 */

class NotificationSystem {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Criar container de notificações
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        const colors = {
            success: { bg: 'rgba(16, 185, 129, 0.95)', border: '#10B981' },
            error: { bg: 'rgba(239, 68, 68, 0.95)', border: '#EF4444' },
            warning: { bg: 'rgba(245, 158, 11, 0.95)', border: '#F59E0B' },
            info: { bg: 'rgba(59, 130, 246, 0.95)', border: '#3B82F6' }
        };

        toast.style.cssText = `
            background: ${colors[type].bg};
            border-left: 4px solid ${colors[type].border};
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            font-family: var(--body-font);
            font-size: 0.9rem;
            max-width: 400px;
        `;

        toast.innerHTML = `
            <span style="font-size: 1.5rem;">${icons[type]}</span>
            <span style="flex: 1;">${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; opacity: 0.7; padding: 0; width: 24px; height: 24px;">×</button>
        `;

        this.container.appendChild(toast);

        // Auto-remover após duração
        if (duration > 0) {
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    }

    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    loading(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-loading';
        toast.style.cssText = `
            background: rgba(26, 32, 44, 0.95);
            border-left: 4px solid #10B981;
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            font-family: var(--body-font);
            font-size: 0.9rem;
        `;

        toast.innerHTML = `
            <div class="spinner" style="
                width: 20px;
                height: 20px;
                border: 3px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            "></div>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);
        return toast;
    }

    confirm(message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;

        overlay.innerHTML = `
            <div style="
                background: var(--bg-mid);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 2rem;
                max-width: 400px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                animation: scaleIn 0.3s ease;
            ">
                <div style="font-size: 3rem; text-align: center; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: var(--text-primary); margin-bottom: 1rem; text-align: center;">Confirmação</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; text-align: center;">${message}</p>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn-cancel" style="
                        flex: 1;
                        padding: 0.75rem;
                        background: transparent;
                        border: 1px solid var(--border);
                        color: var(--text-secondary);
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Cancelar</button>
                    <button class="btn-confirm" style="
                        flex: 1;
                        padding: 0.75rem;
                        background: var(--danger);
                        border: none;
                        color: white;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('.btn-cancel').onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };

        overlay.querySelector('.btn-confirm').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }
}

// Adicionar animações CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes scaleIn {
        from {
            transform: scale(0.9);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Inicializar globalmente
window.Notify = new NotificationSystem();

// Atualizar Utils para usar o novo sistema
Utils.showSuccess = (message) => Notify.success(message);
Utils.showError = (message) => Notify.error(message);
Utils.showWarning = (message) => Notify.warning(message);
Utils.showInfo = (message) => Notify.info(message);
Utils.showLoading = (message) => Notify.loading(message);
Utils.confirm = (message, onConfirm, onCancel) => Notify.confirm(message, onConfirm, onCancel);
