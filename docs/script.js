document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================================
    // 1. SISTEMA NATIVO DE FILTRADO (Para la sección del Devlog / Historial)
    // =========================================================================
    const filterButtons = document.querySelectorAll('.filter-btn');
    const changeItems = document.querySelectorAll('.change-item');
    const versionBlocks = document.querySelectorAll('.version-block');

    if (filterButtons.length > 0) {
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const filterValue = button.getAttribute('data-filter');

                if (filterValue === 'all') {
                    changeItems.forEach(item => item.style.display = 'flex');
                    versionBlocks.forEach(block => block.style.display = 'flex');
                    return;
                }

                versionBlocks.forEach(block => {
                    let hasVisibleChanges = false;
                    const itemsInBlock = block.querySelectorAll('.change-item');

                    itemsInBlock.forEach(item => {
                        if (item.classList.contains(`type-${filterValue}`)) {
                            item.style.display = 'flex';
                            hasVisibleChanges = true;
                        } else {
                            item.style.display = 'none';
                        }
                    });

                    block.style.display = hasVisibleChanges ? 'flex' : 'none';
                });
            });
        });
    }


    // =========================================================================
    // 2. MOTOR DE AUTOMATIZACIÓN DE GITHUB API (Para el Hero de la Landing Page)
    // =========================================================================
    const GITHUB_USER = "SuzuKurai";
    const GITHUB_REPO = "KuraiLauncher";
    const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases`;

    const heroContainer = document.getElementById('latest-hero-container');

    // Solo ejecutamos la petición si el contenedor del Hero existe en el HTML actual (Página de Inicio)
    if (heroContainer) {
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

        function renderizarHeroDestacado(release) {
            // Evaluamos si marcaste la casilla "This is a pre-release" al publicarla en GitHub
            const isBeta = release.prerelease;
            const badgeTexto = isBeta ? "LATEST BETA" : "LATEST STABLE";

            // Formateamos la fecha de publicación al español de forma elegante
            const fechaPublicacion = new Date(release.published_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            // Buscador inteligente dentro de los binarios adjuntos (Assets) que subes a GitHub
            const setupAsset = release.assets.find(asset => asset.name.toLowerCase().includes('setup'));
            const portableAsset = release.assets.find(asset => asset.name.toLowerCase().includes('portable'));

            // Si aún no has subido ejecutables compilados, el botón redirige de manera segura a la release en GitHub
            const setupUrl = setupAsset ? setupAsset.browser_download_url : release.html_url;
            const portableUrl = portableAsset ? portableAsset.browser_download_url : release.html_url;

            // Inyectamos la estructura respetando estrictamente tus clases css y variables de color nativas
            heroContainer.innerHTML = `
                <div class="hero-download-card">
                    <div class="hero-meta">
                        <h3>${release.name || release.tag_name} <span class="hero-tag-badge">${badgeTexto}</span></h3>
                        <p class="hero-description">
                            ${release.body ? acortarTextoMarkdown(release.body) : "Nueva versión de Kurai Launcher disponible para descargar. Revisa el Devlog para ver el historial completo de cambios."}
                        </p>
                        <div class="hero-specs">
                            <span><i class="fa-solid fa-calendar-days"></i> Lanzamiento: <strong>${fechaPublicacion}</strong></span>
                            <span><i class="fa-solid fa-microchip"></i> Arquitectura: <strong>x64 bits</strong></span>
                            <span><i class="fa-solid fa-code-branch"></i> Entorno: <strong>Electron</strong></span>
                        </div>
                    </div>
                    <div class="hero-action-zone">
                        <a href="${setupUrl}" class="btn-download-action available" style="margin-top:0;">
                            <i class="fa-solid fa-download"></i> <span>Descargar (.exe)</span>
                        </a>
                        <a href="${portableUrl}" class="btn-download-action btn-portable-fallback" style="margin-top:0; background-color: var(--bg-sidebar); color: var(--text-main); border: 1px solid #2a2a38;">
                            <i class="fa-solid fa-box-archive"></i> Versión Portable
                        </a>
                    </div>
                </div>
            `;

            // Vincular soporte nativo para entornos de ejecución de Electron o Navegadores de escritorio convencionales
            const actionButtons = heroContainer.querySelectorAll('.btn-download-action');
            actionButtons.forEach(btn => {
                const targetUrl = btn.getAttribute('href');
                btn.addEventListener('click', (e) => {
                    if (typeof require !== 'undefined') {
                        e.preventDefault();
                        const { shell } = require('electron');
                        shell.openExternal(targetUrl);
                    }
                    // Si se ejecuta en un navegador web común, el enlace href normal abrirá la descarga
                });
            });
        }

        // Limpiador básico para recortar textos excesivamente largos del patch-note en la tarjeta Hero
        function acortarTextoMarkdown(texto) {
            if (texto.length > 200) {
                return texto.substring(0, 197) + "...";
            }
            return texto;
        }

        // Ejecutar sincronización asíncrona
        cargarLatestRelease();
    }
});