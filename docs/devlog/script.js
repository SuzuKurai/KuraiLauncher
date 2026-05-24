document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const changeItems = document.querySelectorAll('.change-item');
    const versionBlocks = document.querySelectorAll('.version-block');

    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Cambiar estado activo de los botones
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const filterValue = button.getAttribute('data-filter');

            // Si el filtro es "Todos los cambios"
            if (filterValue === 'all') {
                changeItems.forEach(item => item.style.display = 'flex');
                versionBlocks.forEach(block => block.style.display = 'flex');
                return;
            }

            // Filtrar líneas de cambios individuales
            versionBlocks.forEach(block => {
                let hasVisibleChanges = false;
                const itemsInBlock = block.querySelectorAll('.change-item');

                itemsInBlock.forEach(item => {
                    // Verificamos si el item contiene la clase de filtro específica
                    if (item.classList.contains(`type-${filterValue}`)) {
                        item.style.display = 'flex';
                        hasVisibleChanges = true; // Este bloque tiene al menos un cambio del tipo filtrado
                    } else {
                        item.style.display = 'none';
                    }
                });

                // Si la versión entera no tiene ningún cambio que coincida, ocultamos el bloque completo
                if (hasVisibleChanges) {
                    block.style.display = 'flex';
                } else {
                    block.style.display = 'none';
                }
            });
        });
    });
});