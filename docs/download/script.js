document.addEventListener('DOMContentLoaded', () => {
    
    // Configuración de tu repositorio en GitHub
    const GITHUB_USER = "SuzuKurai";
    const GITHUB_REPO = "KuraiLauncher";
    const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases`;

    const heroContainer = document.getElementById('latest-hero-container');
    const tableBody = document.getElementById('versions-table-body');
    const filterButtons = document.querySelectorAll('.filter-bar .filter-btn');

    // Inicializador del sistema dinámico
    // Inicializador del sistema dinámico
    async function cargarReleasesDesdeGitHub() {
        try {
            const response = await fetch(API_URL);
            let data = null;

            // Intentamos parsear el JSON de la respuesta (venga con error o con datos exitosos)
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }

            // Si la respuesta NO fue exitosa (Status != 200-299)
            if (!response.ok) {
                const rateLimit =
                    response.status === 403 &&
                    (
                        response.headers.get("X-RateLimit-Remaining") === "0" ||
                        data?.message?.toLowerCase().includes("rate limit")
                    );

                if (rateLimit) {
                    throw new Error("RATE_LIMIT");
                }

                throw new Error("API_ERROR");
            }

            // ASIGNACIÓN CORRECTA: 'data' ya contiene el array de releases si response.ok es true
            const releases = data; 

            if (!releases || releases.length === 0) {
                heroContainer.innerHTML = `<div class="skeleton-loader">No se han encontrado releases públicas en GitHub.</div>`;
                return;
            }

            // 1. GENERAR EL HERO SPOTLIGHT (Primera posición devuelta por GitHub siempre es la más reciente)
            const latestRelease = releases[0];
            renderHero(latestRelease);

            // 2. GENERAR LA TABLA HISTÓRICA COMPLETA
            renderTabla(releases);

            // 3. ACTIVAR LOS FILTROS DINÁMICOS
            inicializarFiltros();

        } catch (error) {
            console.error("Error cargando descargas:", error);

            const isRateLimit = error.message === "RATE_LIMIT";

            heroContainer.innerHTML = "";

            heroContainer.innerHTML = `
                <div class="skeleton-loader"
                    style="border-color: var(--color-bug); color: var(--color-bug); display:flex; flex-direction:column; gap:12px;">

                    <div>
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${isRateLimit
                            ? "Límite de GitHub API alcanzado. Inténtalo más tarde."
                            : "No se pudo conectar con GitHub. Inténtalo más tarde."}
                    </div>

                    <a href="https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases"
                    target="_blank"
                    class="btn-download-action available"
                    style="margin-top:10px;">
                        <i class="fa-brands fa-github"></i>
                        Ver releases en GitHub
                    </a>

                </div>
            `;
        }
    }

    // Renderizador del Panel Superior Destacado
    function renderHero(release) {
        // Comprobar si en GitHub marcaste "This is a pre-release"
        const isBeta = release.prerelease;
        const badgeTexto = isBeta ? "LATEST BETA" : "LATEST STABLE";
        
        // Formatear fecha de manera elegante
        const fecha = new Date(release.published_at).toLocaleDateString('es-ES', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        // Buscador inteligente de instaladores dentro de tus Assets de GitHub
        // Si no encuentra los archivos específicos listados, redirigirá a la release general de GitHub
        const setupAsset = release.assets.find(asset => asset.name.toLowerCase().includes('setup'));
        const portableAsset = release.assets.find(asset => asset.name.toLowerCase().includes('portable'));

        const setupUrl = setupAsset ? setupAsset.browser_download_url : release.html_url;
        const portableUrl = portableAsset ? portableAsset.browser_download_url : release.html_url;

        heroContainer.innerHTML = `
            <div class="hero-download-card">
                <div class="hero-meta">
                    <h3>${release.name || release.tag_name} <span class="hero-tag-badge">${badgeTexto}</span></h3>
                    <p class="hero-description">
                        ${release.body ? marcarTextoComoLimpio(release.body) : "Nueva versión publicada de Kurai Launcher. Revisa el Devlog para ver la lista completa de cambios."}
                    </p>
                    <div class="hero-specs">
                        <span><i class="fa-solid fa-calendar-days"></i> Publicado: <strong>${fecha}</strong></span>
                        <span><i class="fa-solid fa-microchip"></i> Arquitectura: <strong>x64 bits</strong></span>
                        <span><i class="fa-solid fa-code-branch"></i> Entorno: <strong>Electron</strong></span>
                    </div>
                </div>
                <div class="hero-action-zone">
                    <a href="${setupUrl}" class="btn-download-action available" style="margin-top:0;">
                        <i class="fa-solid fa-download"></i> <span>Descargar (.exe)</span>
                    </a>
                    <a href="${portableUrl}" class="btn-download-action" style="margin-top:0; background: #252532; color: var(--text-main); border: 1px solid #3d3d52;">
                        <i class="fa-solid fa-box-archive"></i> Versión Portable
                    </a>
                </div>
            </div>
        `;
    }

    // Renderizador de las filas de la tabla
    function renderTabla(releases) {
        tableBody.innerHTML = ""; // Limpiar esqueleto

        releases.forEach(release => {
            const isBeta = release.prerelease;
            const claseTipo = isBeta ? "type-beta" : "type-release";
            const badgeClase = isBeta ? "badge-minor" : "badge-major";
            const badgeTexto = isBeta ? "Beta" : "Release";

            const fecha = new Date(release.published_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            // Enlaces directos a los archivos compilados
            const setupAsset = release.assets.find(asset => asset.name.toLowerCase().includes('setup'));
            const setupUrl = setupAsset ? setupAsset.browser_download_url : release.html_url;

            tableBody.innerHTML += `
                <tr class="version-row ${claseTipo}">
                    <td><strong>${release.tag_name}</strong></td>
                    <td><span class="badge ${badgeClase}">${badgeTexto}</span></td>
                    <td>${fecha}</td>
                    <td>
                        <div class="dl-group">
                            <a href="${setupUrl}" class="dl-inline-link"><i class="fa-solid fa-cube"></i> Obtener archivo</a>
                            <a href="${release.html_url}" target="_blank" class="dl-inline-link" style="background:transparent; border-color:#444;"><i class="fa-solid fa-up-right-from-square"></i> Ver en GitHub</a>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // Inicializador del sistema de pestañas de filtrado superior
    function inicializarFiltros() {
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const filterValue = button.getAttribute('data-filter');
                const tableRows = document.querySelectorAll('.version-row');

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
    }

    // Utilidad básica para limpiar descripciones en formato markdown plano del Hero
    function marcarTextoComoLimpio(textoMarkdown) {
        if(textoMarkdown.length > 220) {
            return textoMarkdown.substring(0, 217) + "...";
        }
        return textoMarkdown;
    }

    // Lanzamiento inicial del motor
    cargarReleasesDesdeGitHub();
});