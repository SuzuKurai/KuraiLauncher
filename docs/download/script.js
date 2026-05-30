document.addEventListener('DOMContentLoaded', () => {
    const blocks = Array.from(document.querySelectorAll('.version-block'));
    const spotlight = document.getElementById('latest-spotlight');

    // Función para comparar versiones tipo "0.0.1-beta.4"
    const parseVersion = (v) => {
        return v.replace(/[^0-9.]/g, '').split('.').map(Number);
    };

    // 1. Identificar la mayor versión
    blocks.sort((a, b) => {
        const vA = parseVersion(a.getAttribute('data-version'));
        const vB = parseVersion(b.getAttribute('data-version'));
        for(let i=0; i<3; i++) {
            if(vA[i] > vB[i]) return -1;
            if(vA[i] < vB[i]) return 1;
        }
        return 0;
    });

    // 2. Marcar la versión top como "Latest" y moverla al spotlight
    const latest = blocks[0];
    latest.classList.add('card-latest');
    
    const badge = document.createElement('div');
    badge.className = 'latest-badge';
    badge.innerText = 'Latest Release';
    
    latest.querySelector('.version-sidebar').prepend(badge);
    
    // Clonar al spotlight superior
    const clone = latest.cloneNode(true);
    spotlight.appendChild(clone);
    
    // Opcional: Eliminar la duplicada de la lista inferior
    // latest.style.display = 'none'; 
});