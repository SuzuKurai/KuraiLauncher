const fs = require('fs');
const path = require('path');

// Rutas de tus archivos
const versionJsonPath = path.join(__dirname, 'version.json');
const packageJsonPath = path.join(__dirname, 'package.json');

try {
    // 1. Leer la versión desde tu version.json remoto/local
    if (!fs.existsSync(versionJsonPath)) {
        console.error('❌ Error: Crea primero un archivo version.json en la raíz.');
        process.exit(1);
    }
    
    const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const nuevaVersion = versionData.version;

    if (!nuevaVersion) {
        throw new Error("No se encontró el campo 'version' en version.json");
    }

    // 2. Actualizar el package.json
    const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageData.version = nuevaVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageData, null, 2), 'utf8');
    
    console.log(`\x1b[32m%s\x1b[0m`, `=>> [Kurai Sync] package.json actualizado a v${nuevaVersion}`);
} catch (error) {
    console.error('❌ Error sincronizando la versión:', error.message);
    process.exit(1);
}