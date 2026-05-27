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

    // 2. DETECTOR DE RELEASES REALES EN GITHUB
    async function verificarReleasesEnGithub() {
        for (const btn of downloadButtons) {
            const textSpan = btn.querySelector('span');
            const icon = btn.querySelector('i');
            const targetUrl = btn.getAttribute('data-target-url');

            if (!targetUrl || targetUrl === "#") {
                configurarBotonEnEspera(btn, textSpan, icon);
                continue;
            }

            // EXTRAER EL TAG DEL ENLACE (Ej: "v0.0.1-beta.3")
            // Convertimos la URL interna de verificación a una consulta directa sobre los assets/archivos
            // Si el tag tiene la estructura clásica, apuntamos al .exe que genera GitHub al compilar.
            const parts = targetUrl.split('/tag/');
            const tag = parts.length > 1 ? parts[1] : '';
            
            // Generamos un enlace de validación al ejecutable oficial que DEBE existir en los servidores de GitHub.
            // Si la release no existe, el binario descarga dará un 404 rotundo e infalible.
            const urlVerificacionBinario = `https://github.com/SuzuKurai/KuraiLauncher/releases/download/${tag}/KuraiLauncher_Setup.exe`;

            try {
                // Hacemos la consulta al servidor de descargas (da 404 real si la release o el archivo no existen)
                const response = await fetch(urlVerificacionBinario, { method: 'HEAD' });

                if (response.status === 404) {
                    configurarBotonEnEspera(btn, textSpan, icon);
                } else {
                    // Si responde cualquier otra cosa válida, la release está lista
                    configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                }
            } catch (error) {
                // Plan de respaldo por si HEAD tiene restricciones en el entorno local
                try {
                    const responseGet = await fetch(urlVerificacionBinario);
                    if (responseGet.status === 404) {
                        configurarBotonEnEspera(btn, textSpan, icon);
                    } else {
                        configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                    }
                } catch(e) {
                    // Si hay un bloqueo estricto de CORS que impida leer los binarios, 
                    // consultamos la API de GitHub para verificar el tag de manera segura sin salir de la web
                    try {
                        const apiResponse = await fetch(`https://api.github.com/repos/SuzuKurai/KuraiLauncher/releases/tags/${tag}`);
                        if (apiResponse.ok) {
                            configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                        } else {
                            configurarBotonEnEspera(btn, textSpan, icon);
                        }
                    } catch(apiErr) {
                        // En caso de fallo absoluto de red total, permitimos el clic por defecto
                        configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                    }
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
            e.preventDefault();
        };
    }

    verificarReleasesEnGithub();
});