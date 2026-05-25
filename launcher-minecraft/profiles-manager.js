const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 🛠️ RUTA ÚNICA Y DINÁMICA DE DATOS
const rutaRoaming = app.getPath('appData'); 
const carpetaKurai = path.join(rutaRoaming, '.minecraft', '.KuraiLauncher');
const pathPerfiles = path.join(carpetaKurai, 'profiles.json');

// Asegura que existan las carpetas necesarias
function asegurarCarpeta() {
    if (!fs.existsSync(carpetaKurai)) {
        fs.mkdirSync(carpetaKurai, { recursive: true });
    }
}

// 🔥 FUNCIÓN DE SEGURIDAD INTERNA: Garantiza que nunca falten llaves ni arrays
function sanitizar(data) {
    let limpia = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
    if (data && typeof data === 'object') {
        limpia = { ...limpia, ...data };
    }
    limpia.list = Array.isArray(limpia.list) ? limpia.list : [];
    limpia.accounts = Array.isArray(limpia.accounts) ? limpia.accounts.filter(acc => typeof acc === 'string' && !acc.includes('[object Object]')) : [];
    limpia.settings = limpia.settings && typeof limpia.settings === 'object' ? limpia.settings : {};
    return limpia;
}

function getAll() {
    try {
        asegurarCarpeta();
        if (!fs.existsSync(pathPerfiles)) {
            const inicial = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
            fs.writeFileSync(pathPerfiles, JSON.stringify(inicial, null, 2), 'utf-8');
            return inicial;
        }
        const contenido = fs.readFileSync(pathPerfiles, 'utf-8');
        return sanitizar(JSON.parse(contenido)); // Pasamos el filtro al leer
    } catch (e) {
        console.error("Error leyendo perfiles:", e);
        return { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
    }
}

function save(data) {
    try {
        asegurarCarpeta();
        const dataLimpia = sanitizar(data); // Pasamos el filtro antes de escribir
        fs.writeFileSync(pathPerfiles, JSON.stringify(dataLimpia, null, 2), 'utf-8');
    } catch (e) {
        console.error("Error guardando perfiles:", e);
    }
}

function deleteProfile(id) {
    try {
        const data = getAll();
        data.list = data.list.filter(p => p.id !== id);
        if (data.selectedProfile === id) data.selectedProfile = "";
        save(data);
    } catch (e) {}
}

function select(id) {
    try {
        const data = getAll();
        data.selectedProfile = id;
        save(data);
    } catch (e) {}
}

function saveAccount(username) {
    try {
        const data = getAll();
        if (!data.accounts.includes(username)) {
            data.accounts.push(username);
        }
        data.selectedAccount = username;
        save(data);
    } catch (e) {}
}

function selectAccount(username) {
    try {
        const data = getAll();
        data.selectedAccount = username;
        save(data);
    } catch (e) {}
}

function deleteAccount(username) {
    try {
        const data = getAll();
        data.accounts = data.accounts.filter(acc => acc !== username);
        if (data.selectedAccount === username) data.selectedAccount = "";
        save(data);
    } catch (e) {}
}

function saveSettings(newSettings) {
    try {
        const data = getAll();
        data.settings = newSettings;
        save(data);
    } catch (e) {}
}

module.exports = {
    getAll,
    save,
    delete: deleteProfile,
    select,
    saveAccount,
    selectAccount,
    deleteAccount,
    saveSettings
};