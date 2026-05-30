document.addEventListener('DOMContentLoaded', () => {
    
    // --- LÓGICA DE CONTROLADORES DE FILTRO DE LA TABLA ---
    const tableFilters = document.querySelectorAll('.filter-bar .filter-btn');
    const tableRows = document.querySelectorAll('.version-row');

    tableFilters.forEach(button => {
        button.addEventListener('click', () => {
            tableFilters.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const filterValue = button.getAttribute('data-filter');

            tableRows.forEach(row => {
                if (filterValue === 'all') {
                    row.style.display = 'table-row';
                } else {
                    if (row.classList.contains(`type-${filterValue}`)) {
                        row.style.display = 'table-row';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
        });
    });

    // --- MOTOR DE DETECCION DINÁMICA DE LATEST RELEASES ---
    function generarHeroDestacado() {
        const rows = Array.from(document.querySelectorAll('.version-row'));
        const heroContainer = document.getElementById('latest-hero-container');
        
        if (!heroContainer || rows.length === 0) return;

        // Función matemática para segmentar strings de versionado semántico (Semantic Versioning)
        const parseSemVer = (versionStr) => {
            const clean = versionStr.toLowerCase().replace('v', '');
            const parts = clean.split('-'); // Divide la compilación base del modificador alpha/beta
            const numbers = parts[0].split('.').map(Number); // Genera array numérico [0, 0, 1]
            
            // Si tiene un tag beta (ej: beta.4), extraemos el sub-indexador de ciclo
            let betaWeight = 9999; // Las versiones finales estables tienen prioridad máxima sobre betas
            if (parts[1] && parts[1].includes('beta')) {
                const subBeta = parts[1].split('.');
                betaWeight = subBeta[1] ? Number(subBeta[1]) : 0;
            }
            return { numbers, betaWeight, isBeta: !!parts[1] };
        };

        // Ordenamiento dinámico de la matriz de datos de mayor a menor
        rows.sort((rowA, rowB) => {
            const dataA = parseSemVer(rowA.getAttribute('data-version'));
            const dataB = parseSemVer(rowB.getAttribute('data-version'));

            for (let i = 0; i < Math.max(dataA.numbers.length, dataB.numbers.length); i++) {
                const numA = dataA.numbers[i] || 0;
                const numB = dataB.numbers[i] || 0;
                if (numA !== numB) return numB - numA;
            }
            // Si el Core numérico es igual, desempata el sub-indexador beta
            return dataB.betaWeight - dataA.betaWeight;
        });

        // Extraemos la versión más reciente del sistema
        const latestRow = rows[0];
        const vTag = latestRow.getAttribute('data-version');
        const vUrl = latestRow.getAttribute('data-url');
        const infoVersion = parseSemVer(vTag);
        
        const badgeTexto = infoVersion.isBeta ? "LATEST BETA" : "LATEST STABLE";

        // Construcción del Layout Estructural del Hero Automático
        heroContainer.innerHTML = `
            <div class="hero-download-card">
                <div class="hero-meta">
                    <h3>${vTag} <span class="hero-tag-badge">${badgeTexto}</span></h3>
                    <p class="hero-description">
                        Experimenta el rendimiento optimizado de la compilación más reciente de Kurai. 
                        Incluye soporte completo de instancias independientes, depuración dinámica en consola separada y asignador inteligente de memoria RAM.
                    </p>
                    <div class="hero-specs">
                        <span><i class="fa-solid fa-microchip"></i> Arquitectura: <strong>x64 bits</strong></span>
                        <span><i class="fa-solid fa-code-branch"></i> Entorno: <strong>Electron</strong></span>
                        <span><i class="fa-solid fa-box-open"></i> Formato base: <strong>Setup.exe</strong></span>
                    </div>
                </div>
                <div class="hero-action-zone">
                    <a href="${vUrl}/KuraiLauncher_Setup.exe" class="btn-download-action available" style="margin-top:0;">
                        <i class="fa-solid fa-download"></i> <span>Descargar instalador (.exe)</span>
                    </a>
                    <a href="${vUrl}/KuraiLauncher_Portable.zip" class="btn-download-action waiting-java" style="margin-top:0; color: var(--text-muted); border-color:#444;">
                        <i class="fa-solid fa-box-archive"></i> Versión Portable (.zip)
                    </a>
                </div>
            </div>
        `;

        // Interceptores de descarga nativos de Electron / Navegadores de escritorio convencionales[cite: 2]
        heroContainer.querySelectorAll('.btn-download-action.available').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof require !== 'undefined') {
                    const { shell } = require('electron');
                    shell.openExternal(vUrl);
                } else {
                    window.open(vUrl, '_blank');
                }
            });
        });
    }

    // Ejecución inicial del parser
    generarHeroDestacado();
});