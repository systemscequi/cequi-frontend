/**
 * CEQUI - Sistema de Exportação
 * Exportar dados para PDF e Excel
 */

class ExportSystem {
    // Exportar para JSON (backup)
    exportJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.downloadFile(blob, filename + '.json');
    }

    // Exportar para CSV
    exportCSV(data, filename) {
        if (!data || data.length === 0) {
            Notify.error('Nenhum dado para exportar');
            return;
        }

        // Gerar CSV
        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escapar vírgulas e aspas
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return '"' + value.replace(/"/g, '""') + '"';
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM
        this.downloadFile(blob, filename + '.csv');
        Notify.success('CSV exportado com sucesso!');
    }

    // Exportar para Excel (usando HTML table)
    exportExcel(tableHtml, filename) {
        const template = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
            <head>
                <meta charset="utf-8">
                <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
                <x:Name>Relatório</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
            </head>
            <body>${tableHtml}</body>
            </html>
        `;

        const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
        this.downloadFile(blob, filename + '.xls');
        Notify.success('Excel exportado com sucesso!');
    }

    // Exportar para PDF (básico - via impressão)
    exportPDF() {
        Notify.info('Use Ctrl+P ou Cmd+P para imprimir como PDF');
        setTimeout(() => window.print(), 500);
    }

    // Exportar relatório completo
    exportRelatorio(tipo, dados) {
        const filename = `relatorio_${tipo}_${new Date().toISOString().split('T')[0]}`;
        
        if (tipo === 'csv') {
            this.exportCSV(dados, filename);
        } else if (tipo === 'excel') {
            // Converter dados para tabela HTML
            const table = this.dataToHTMLTable(dados);
            this.exportExcel(table, filename);
        } else if (tipo === 'json') {
            this.exportJSON(dados, filename);
        }
    }

    // Converter dados para tabela HTML
    dataToHTMLTable(data) {
        if (!data || data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const headerRow = headers.map(h => `<th>${h}</th>`).join('');
        const bodyRows = data.map(row => 
            `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`
        ).join('');

        return `
            <table border="1" cellpadding="5" cellspacing="0">
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        `;
    }

    // Backup completo do sistema
    backupCompleto() {
        const data = DataStore.exportAllData();
        const filename = `cequi_backup_${new Date().toISOString().split('T')[0]}`;
        this.exportJSON(data, filename);
        Notify.success('Backup completo exportado!');
    }

    // Restaurar backup
    restaurarBackup(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (DataStore.importAllData(data)) {
                    Notify.success('Backup restaurado com sucesso! Recarregando...');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    Notify.error('Erro ao restaurar backup');
                }
            } catch (error) {
                Notify.error('Arquivo de backup inválido');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    // Helper para download de arquivo
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.Exporter = new ExportSystem();
