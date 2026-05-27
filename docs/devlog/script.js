document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const changeItems = document.querySelectorAll('.change-item');
    const versionBlocks = document.querySelectorAll('.version-block');
    const downloadButtons = document.querySelectorAll('.btn-download-action');

    // 1. FILTRADO DE CATEGORÍAS (Novedades, Cambios y Bugs)
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

    // 2. DETECTOR DE RELEASE EN GITHUB (Verificación automática por enlace)
    async function verificarReleasesEnGithub() {
        for (const btn of downloadButtons) {
            const textSpan = btn.querySelector('span');
            const icon = btn.querySelector('i');
            const targetUrl = btn.getAttribute('data-target-url');

            if (!targetUrl || targetUrl === "#") {
                configurarBotonEnEspera(btn, textSpan, icon);
                continue;
            }

            try {
                // Hacemos una petición HEAD (más rápida y ligera que un GET) para validar si el enlace de la release existe
                const response = await fetch(targetUrl, { method: 'HEAD' });

                if (response.ok) {
                    configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                } else {
                    configurarBotonEnEspera(btn, textSpan, icon);
                }
            } catch (error) {
                // Plan de respaldo: Intentamos con fetch tipo GET por si las restricciones del entorno bloquean HEAD
                try {
                    const responseGet = await fetch(targetUrl);
                    if (responseGet.status === 404) {
                        configurarBotonEnEspera(btn, textSpan, icon);
                    } else {
                        configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                    }
                } catch(e) {
                    // Si hay un bloqueo estricto de CORS en el Webview local, por seguridad permitimos el clic
                    configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                }
            }
        }
    }

    function configurarBotonDisponible(btn, textSpan, icon, url) {
        btn.className = "btn-download-action available"; 
        textSpan.innerText = "Descargar";
        icon.className = "fa-solid fa-download";
        
        btn.onclick = (e) => {
            e.preventDefault();
            if (typeof require !== 'undefined') {
                const { shell } = require('electron');
                shell.openExternal(url);
            } else {
                window.open(url, '_blank');
            }
        };
    }

    function configurarBotonEnEspera(btn, textSpan, icon) {
        btn.className = "btn-download-action waiting-release"; 
        textSpan.innerText = "En espera";
        icon.className = "fa-solid fa-clock";
        
        btn.onclick = (e) => {
            e.preventDefault(); // Deshabilita cualquier acción de clic
        };
    }

    verificarReleasesEnGithub();
});