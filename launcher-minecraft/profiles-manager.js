const fs = require('fs');
const path = require('path');

const profilesPath = path.join(__dirname, 'profiles.json');

// Estructura inicial mejorada con cuentas y opciones
const defaultData = {
    selectedProfile: null,
    list: [],
    selectedAccount: null,
    accounts: [],
    settings: {
        maxMemory: "4G",
        minMemory: "2G"
    }
};

if (!fs.existsSync(profilesPath)) {
    fs.writeFileSync(profilesPath, JSON.stringify(defaultData, null, 2));
}

function getProfiles() {
    const data = fs.readFileSync(profilesPath, 'utf-8');
    const parsed = JSON.parse(data);
    
    // 🛡️ Si el archivo es viejo y le faltan campos, se los agregamos en el aire
    if (!parsed.accounts) parsed.accounts = [];
    if (!parsed.settings) parsed.settings = { maxMemory: "4G", minMemory: "2G" };
    
    return parsed;
}

function saveProfiles(data) {
    fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
}

module.exports = {
    getAll: () => getProfiles(),

    // --- PERFILES ---
    save: (profile) => {
        const data = getProfiles();
        const index = data.list.findIndex(p => p.id === profile.id);
        if (index !== -1) data.list[index] = profile;
        else data.list.push(profile);
        saveProfiles(data);
    },
    delete: (id) => {
        const data = getProfiles();
        data.list = data.list.filter(p => p.id !== id);
        if (data.selectedProfile === id) data.selectedProfile = null;
        saveProfiles(data);
    },
    select: (id) => {
        const data = getProfiles();
        data.selectedProfile = id;
        saveProfiles(data);
    },

    // --- CUENTAS ---
    saveAccount: (username) => {
        const data = getProfiles();
        if (!data.accounts.includes(username)) {
            data.accounts.push(username);
        }
        data.selectedAccount = username; // Selecciona automáticamente la nueva cuenta
        saveProfiles(data);
    },
    deleteAccount: (username) => {
        const data = getProfiles();
        data.accounts = data.accounts.filter(acc => acc !== username);
        if (data.selectedAccount === username) data.selectedAccount = data.accounts[0] || null;
        saveProfiles(data);
    },
    selectAccount: (username) => {
        const data = getProfiles();
        data.selectedAccount = username;
        saveProfiles(data);
    },

    // --- CONFIGURACIÓN ---
    saveSettings: (settings) => {
        const data = getProfiles();
        data.settings = settings;
        saveProfiles(data);
    }
};