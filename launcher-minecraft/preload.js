const { shell } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.getElementById('social-links-menu');
    
    if (wrapper) {
        wrapper.addEventListener('click', (e) => {
            // Buscamos si el clic fue en un enlace o dentro de él (el icono)
            const anchor = e.target.closest('a');
            
            if (anchor) {
                e.preventDefault(); // Evita que Electron haga el cambio de página
                const url = anchor.href;
                shell.openExternal(url); // Lo abre en el navegador externo
            }
        });
    }
});