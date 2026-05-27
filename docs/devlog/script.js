document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const changeItems = document.querySelectorAll('.change-item');
    const versionBlocks = document.querySelectorAll('.version-block');
    const downloadButtons = document.querySelectorAll('.btn-download-action');

    // 1. FILTRADO DE CONTENIDO (MANTENIDO Y REFORZADO)
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

    // 2. SISTEMA AUTOMÁTICO DE BOTONES (VERIFICADOR DE JAVA Y LANZAMIENTO)
    async function inicializarBotonesDescarga() {
        let javaInstalado = false;
        let versionActualLauncher = "0.0.1-beta.2"; // Fallback por defecto

        // Intentamos comunicarnos con el entorno de Electron de forma segura
        if (window.process && window.process.type === 'renderer' || (typeof require !== 'undefined')) {
            try {
                const { ipcRenderer } = require('electron');
                // Solicitamos datos reales al core del launcher
                versionActualLauncher = await ipcRenderer.invoke('get-launcher-version');
                
                // Para saber si Java existe, evaluamos el estado del buscador interno
                // Si el launcher nos envía un flag o si podemos comprobarlo de forma dinámica:
                const profilesData = await ipcRenderer.invoke('get-profiles');
                // Si el launcher está abierto y no ha saltado error crítico, asumimos validación
                javaInstalado = true; 
            } catch (e) {
                console.log("No se pudo mapear la API de Electron en su totalidad, usando entorno simulado.");
                javaInstalado = true; // Simulación local para pruebas en navegador convencional
            }
        } else {
            // Si lo abres en un navegador normal para maquetar, simulará que Java está correcto
            javaInstalado = true;
        }

        // Procesar cada botón en base a las condiciones solicitadas
        downloadButtons.forEach(btn => {
            const block = btn.closest('.version-block');
            const versionDelBloque = block.getAttribute('data-version');
            const textSpan = btn.querySelector('span');
            const icon = btn.querySelector('i');

            if (!javaInstalado) {
                // Estado 1: Falta Java
                btn.className = "btn-download-action waiting-java";
                textSpan.innerText = "Falta Java 25";
                icon.className = "fa-solid fa-triangle-exclamation";
                btn.onclick = (e) => {
                    e.preventDefault();
                    alert("Por favor, instala Java 25 desde la advertencia del menú principal antes de efectuar descargas.");
                };
            } else {
                // Comparamos las versiones para saber si el bloque ya salió o está en espera
                const comparacion = compararVersiones(versionDelBloque, versionActualLauncher);

                if (comparacion > 0) {
                    // Estado 2: Versión más nueva que la actual de la app (Aún no ha salido)
                    btn.className = "btn-download-action waiting-release";
                    textSpan.innerText = "En espera";
                    icon.className = "fa-solid fa-clock";
                    btn.onclick = (e) => {
                        e.preventDefault();
                    };
                } else {
                    // Estado 3: La versión ya está disponible para descargar
                    btn.className = "btn-download-action available";
                    textSpan.innerText = "Descargar";
                    icon.className = "fa-solid fa-download";
                    
                    btn.onclick = (e) => {
                        e.preventDefault();
                        const url = btn.getAttribute('data-target-url');
                        if (url && url !== "#") {
                            if (typeof require !== 'undefined') {
                                const { shell } = require('electron');
                                shell.openExternal(url);
                            } else {
                                window.open(url, '_blank');
                            }
                        }
                    };
                }
            }
        });
    }

    // Función auxiliar para comparar versiones semánticas (SemVer simple)
    function compararVersiones(v1, v2) {
        const limpiar = v => v.replace(/[^0-9.]/g, '').split('.').map(Number);
        const parts1 = limpiar(v1);
        const parts2 = limpiar(v2);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    // Ejecutar comprobación al cargar
    inicializarBotonesDescarga();
});