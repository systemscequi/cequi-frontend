/**
 * CEQUI — Gráficos com Chart.js
 * Cores adaptadas dinamicamente ao tema claro/escuro via variáveis CSS
 */

class ChartManager {
    constructor() {
        this.charts = {};
        this.loadChartJS();
    }

    loadChartJS() {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => { this.chartJsLoaded = true; };
        document.head.appendChild(script);
    }

    async waitForChartJS() {
        while (!this.chartJsLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Lê as variáveis CSS do tema atual em tempo real
    _themeColors() {
        const style = getComputedStyle(document.documentElement);
        const get = v => style.getPropertyValue(v).trim();
        const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
        return {
            textSecondary: get('--text-secondary') || (isDark ? '#A0AEC0' : '#4A5568'),
            textMuted:     get('--text-muted')      || (isDark ? '#718096' : '#718096'),
            textPrimary:   get('--text-primary')    || (isDark ? '#F7FAFC' : '#1A202C'),
            bgCard:        get('--bg-card')          || (isDark ? '#1A202C' : '#FFFFFF'),
            border:        get('--border')           || (isDark ? '#2D3748' : '#CBD5E0'),
            accent:        get('--accent')           || (isDark ? '#10B981' : '#059669'),
            warning:       get('--warning')          || (isDark ? '#F59E0B' : '#D97706'),
            gridLine:      isDark ? 'rgba(74,85,104,0.20)' : 'rgba(203,213,224,0.50)',
            tooltipBg:     isDark ? 'rgba(26,32,44,0.97)'  : 'rgba(255,255,255,0.97)',
            tooltipTitle:  get('--text-primary'),
            tooltipBody:   get('--text-secondary'),
            tooltipBorder: get('--border'),
        };
    }

    _categoryColors() {
        return ['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
    }

    async createProductivityChart(canvasId, data) {
        await this.waitForChartJS();
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const c = this._themeColors();
        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Pontos',
                    data: data.points,
                    borderColor: c.accent,
                    backgroundColor: c.accent + '1A',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: c.accent,
                    pointBorderColor: c.bgCard,
                    pointBorderWidth: 2
                }, {
                    label: 'Meta',
                    data: data.meta,
                    borderColor: c.warning,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true, position: 'top',
                        labels: { color: c.textSecondary, font: { family: 'Work Sans', size: 12 }, padding: 20, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle,
                        bodyColor: c.tooltipBody, borderColor: c.tooltipBorder,
                        borderWidth: 1, padding: 12, displayColors: true,
                        callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + ' pts' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: c.gridLine, drawBorder: false },
                        ticks: { color: c.textMuted, font: { family: 'JetBrains Mono', size: 11 }, callback: v => v + ' pts' }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: c.textMuted, font: { family: 'Work Sans', size: 11 } }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    async createCategoryChart(canvasId, data) {
        await this.waitForChartJS();
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const c = this._themeColors();
        this.charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{ data: data.values, backgroundColor: this._categoryColors(), borderWidth: 0, hoverOffset: 10 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: c.textSecondary, font: { family: 'Work Sans', size: 11 }, padding: 15, boxWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle,
                        bodyColor: c.tooltipBody, borderColor: c.tooltipBorder,
                        borderWidth: 1, padding: 12,
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return ctx.label + ': ' + ctx.parsed + ' pts (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    async createTeamComparisonChart(canvasId, data) {
        await this.waitForChartJS();
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const c = this._themeColors();
        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{ label: 'Pontos', data: data.values, backgroundColor: c.accent, borderRadius: 6, maxBarThickness: 50 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: c.tooltipBg, titleColor: c.tooltipTitle,
                        bodyColor: c.tooltipBody, borderColor: c.tooltipBorder,
                        borderWidth: 1, padding: 12
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: c.gridLine, drawBorder: false },
                        ticks: { color: c.textMuted, font: { family: 'JetBrains Mono', size: 11 } }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: c.textMuted, font: { family: 'Work Sans', size: 10 } }
                    }
                }
            }
        });
    }
}

window.Charts = new ChartManager();
