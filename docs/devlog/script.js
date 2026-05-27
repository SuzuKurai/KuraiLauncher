document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const changeItems = document.querySelectorAll('.change-item');
    const versionBlocks = document.querySelectorAll('.version-block');
    const downloadButtons = document.querySelectorAll('.btn-download-action');

    // 1. FILTRADO DE CATEGORÍAS (Tus filtros de Novedades, Cambios y Bugs)
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
        // Recorremos todos los botones del devlog
        for (const btn of downloadButtons) {
            const textSpan = btn.querySelector('span');
            const icon = btn.querySelector('i');
            const targetUrl = btn.getAttribute('data-target-url');

            // Si el botón no tiene un enlace configurado, lo dejamos en espera
            if (!targetUrl || targetUrl === "#") {
                configurarBotonEnEspera(btn, textSpan, icon);
                continue;
            }

            try {
                // Hacemos una petición rápida (HEAD) para verificar si el enlace existe en GitHub
                // Usamos 'no-cors' o un fetch estándar. Al tratarse de GitHub público, podemos validar su estado:
                const response = await fetch(targetUrl, { method: 'HEAD' });

                if (response.ok) {
                    // Si el estado es 200-299: El archivo o tag EXISTE en GitHub
                    configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                } else {
                    // Si devuelve 404 u otro error: La versión aún NO ha sido publicada
                    configurarBotonEnEspera(btn, textSpan, icon);
                }
            } catch (error) {
                // Si da un error de red o CORS debido al entorno estricto del webview,
                // aplicamos un plan de respaldo: Intentamos con un fetch tipo GET normal
                try {
                    const responseGet = await fetch(targetUrl);
                    if (responseGet.status === 404) {
                        configurarBotonEnEspera(btn, textSpan, icon);
                    } else {
                        configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                    }
                } catch(e) {
                    // Si las políticas de seguridad del navegador bloquean la validación externa en vivo,
                    // por seguridad dejamos el botón disponible para que el usuario pueda clicarlo.
                    configurarBotonDisponible(btn, textSpan, icon, targetUrl);
                }
            }
        }
    }

    // Funciones auxiliares para cambiar los estilos dinámicamente según tus clases CSS:
    
    function configurarBotonDisponible(btn, textSpan, icon, url) {
        btn.className = "btn-download-action available"; // Aplica tu estilo verde
        textSpan.innerText = "Descargar";
        icon.className = "fa-solid fa-download";
        
        btn.onclick = (e) => {
            e.preventDefault();
            // Abre el enlace en el navegador externo del usuario
            if (typeof require !== 'undefined') {
                const { shell } = require('electron');
                shell.openExternal(url);
            } else {
                window.open(url, '_blank');
            }
        };
    }

    function configurarBotonEnEspera(btn, textSpan, icon) {
        btn.className = "btn-download-action waiting-release"; // Aplica tu estilo gris apagado
        textSpan.innerText = "En espera";
        icon.className = "fa-solid fa-clock";
        
        btn.onclick = (e) => {
            e.preventDefault(); // Deshabilita el clic para que no haga nada
        };
    }

    // Ejecutar la comprobación automática de enlaces al cargar la página
    verificarReleasesEnGithub();
});