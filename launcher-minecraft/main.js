const { app, BrowserWindow, ipcMain, dialog } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        resizable: true, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true 
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- FUNCIÓN AUXILIAR DE SEGURIDAD PARA PASAR DATOS LIMPIOS AL FRONTEND ---
function getSanitizedData() {
    let data = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
    try {
        const managerData = profilesManager.getAll();
        if (managerData && typeof managerData === 'object') {
            data = { ...data, ...managerData };
        }
    } catch (e) {
        console.error("[MANAGER] Error al obtener datos del archivo, se usarán por defecto:", e);
    }
    // Asegurar que las estructuras cruciales existan siempre limpias
    data.list = Array.isArray(data.list) ? data.list : [];
    data.accounts = Array.isArray(data.accounts) ? data.accounts.filter(acc => typeof acc === 'string' && !acc.includes('[object Object]')) : [];
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    return data;
}

// --- CANALES IPC PARA PERFILES ---

ipcMain.handle('get-profiles', () => {
    return getSanitizedData();
});

ipcMain.on('save-profile', (event, profile) => {
    try { 
        // Tu profiles-manager espera el perfil individual aquí
        profilesManager.save(profile); 
    } catch(e){
        console.error("Error guardando perfil individual:", e);
    }
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('delete-profile', (event, id) => {
    try { profilesManager.delete(id); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('select-profile', (event, id) => {
    try { profilesManager.select(id); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('update-profile-advanced', (event, updatedProfile) => {
    try { 
        // Tu manager maneja la actualización del perfil internamente a través de .save()
        profilesManager.save(updatedProfile); 
    } catch(e){
        console.error("Error actualizando perfil avanzado:", e);
    }
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecciona la carpeta para este perfil (.minecraft)'
    });
    return result.canceled ? null : result.filePaths[0];
});

// --- CANALES PARA CONFIGURACIÓN GLOBAL ---
ipcMain.on('save-settings', (event, newSettings) => {
    try {
        if (typeof profilesManager.saveSettings === 'function') {
            profilesManager.saveSettings(newSettings);
        } else {
            // Salvaguarda si no existe la función
            const data = getSanitizedData();
            data.settings = newSettings;
        }
    } catch(e){
        console.error("Error guardando opciones:", e);
    }
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

// --- CANALES PARA CUENTAS (CORREGIDOS UTILIZANDO LA LOGICA PROPIA DEL MANAGER) ---
ipcMain.on('save-account', (event, username) => {
    let cleanUsername = username;
    if (username && typeof username === 'object') {
        cleanUsername = username.username || username.name;
    }
    
    if (!cleanUsername || typeof cleanUsername !== 'string' || cleanUsername.includes('[object Object]') || cleanUsername.trim() === "") {
        console.error("[CUENTAS] Nombre de usuario inválido omitido:", username);
        return;
    }

    cleanUsername = cleanUsername.trim();
    
    try {
        // Tu profiles-manager posee la función nativa saveAccount para registrar usuarios
        if (typeof profilesManager.saveAccount === 'function') {
            profilesManager.saveAccount(cleanUsername);
        } else {
            console.error("No se encontró saveAccount en el manager.");
        }
    } catch (e) {
        console.error("[CUENTAS] Error al guardar cuenta mediante saveAccount:", e);
    }
    
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('select-account', (event, username) => {
    let cleanUsername = username && typeof username === 'object' ? (username.username || username.name) : username;
    if (!cleanUsername || cleanUsername.includes('[object Object]')) return;

    cleanUsername = cleanUsername.toString().trim();

    try { 
        if (typeof profilesManager.selectAccount === 'function') {
            profilesManager.selectAccount(cleanUsername);
        } else {
            // Si tu manager no maneja selectAccount nativo, modificamos la propiedad si es accesible
            const data = profilesManager.getAll();
            if(data) data.selectedAccount = cleanUsername;
        }
    } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('delete-account', (event, username) => {
    let cleanUsername = username && typeof username === 'object' ? (username.username || username.name) : username;
    if (!cleanUsername) return;

    cleanUsername = cleanUsername.toString().trim();

    try { 
        if (typeof profilesManager.deleteAccount === 'function') {
            profilesManager.deleteAccount(cleanUsername);
        }
    } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});


// --- CANAL OPTIMIZADO PARA LANZAR EL JUEGO ---
ipcMain.on('launch-game', async (event) => {
    const data = getSanitizedData();
    const currentProfile = data.list.find(p => p.id === data.selectedProfile);

    if (!currentProfile) {
        mainWindow.webContents.send('status-msg', 'Error: Selecciona o crea un perfil primero.');
        return;
    }

    const activeUser = data.selectedAccount || "KuraiUser";

    mainWindow.webContents.send('status-msg', `Iniciando Minecraft versión ${currentProfile.version || "Desconocida"}...`);
    console.log(`Iniciando Minecraft versión ${currentProfile.version} con el usuario: ${activeUser}...`);

    const defaultRoot = path.join(app.getPath('appData'), '.minecraft');
    const finalRoot = currentProfile.path && currentProfile.path.trim() !== "" ? currentProfile.path : defaultRoot;

    const globalSettings = data.settings || {};
    const rawMax = currentProfile.ram && currentProfile.ram.trim() !== "" ? currentProfile.ram : (globalSettings.maxMemory || "4G");
    const rawMin = globalSettings.minMemory || "2G";

    const parseRamToMb = (ramString) => {
        let num = parseInt(ramString, 10);
        if (isNaN(num)) return 4096;
        if (ramString.toLowerCase().includes('g')) return num * 1024;
        return num;
    };

    const maxRamMb = `${parseRamToMb(rawMax)}M`;
    const minRamMb = `${parseRamToMb(rawMin)}M`;

    let cleanVersion = (currentProfile.version || "1.21").toString()
        .replace(/release:/i, '')
        .replace(/snapshot:/i, '')
        .replace(/beta\/alpha:/i, '')
        .trim();

    let javaPathManual = undefined;
    const posiblesRutasJava = [
        "C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe",
        "C:\\Program Files (x86)\\Minecraft Launcher\\runtime\\java-runtime-gamma\\windows-x64\\java-runtime-gamma\\bin\\javaw.exe",
        path.join(app.getPath('appData'), 'Local\\Packages\\Microsoft.42941CD7D105E_8wekyb3d8bbwe\\LocalCache\\Local\\runtime\\java-runtime-gamma\\windows-x64\\java-runtime-gamma\\bin\\javaw.exe'),
        path.join(app.getPath('home'), 'CurseForge\\Minecraft\\Install\\runtime\\java-runtime-gamma\\windows-x64\\java-runtime-gamma\\bin\\javaw.exe')
    ];

    for (const ruta of posiblesRutasJava) {
        if (fs.existsSync(ruta)) {
            javaPathManual = ruta;
            break;
        }
    }

    let opts = {
        authorization: {
            access_token: "00000000000000000000000000000000", 
            client_token: "00000000000000000000000000000000",
            accessToken: "00000000000000000000000000000000", 
            clientToken: "00000000000000000000000000000000",
            uuid: "00000000-0000-0000-0000-000000000000",      
            name: activeUser,                                  
            user_properties: "{}",
            meta: { type: "mojang", demo: false }
        },
        root: finalRoot,
        javaPath: javaPathManual ? javaPathManual : undefined,                                      
        version: {
            number: cleanVersion,                    
            type: "release"
        },
        memory: {
            max: maxRamMb,                                       
            min: minRamMb                                        
        },
        overrides: { checkStrict: false }
    };

    console.log("=== PARÁMETROS ENVIADOS A MCLC ===");
    console.log("Versión de Minecraft:", `"${opts.version.number}"`);
    console.log("Java Utilizado:", opts.javaPath || "Por defecto del sistema");
    console.log("Memoria Asignada:", `Max: ${opts.memory.max} / Min: ${opts.memory.min}`);
    console.log("Ruta de Instancia:", opts.root);
    console.log("==================================");

    launcher.removeAllListeners('debug');
    launcher.removeAllListeners('data');
    launcher.removeAllListeners('error');
    launcher.removeAllListeners('progress');

    launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
    launcher.on('data', (e) => console.log(`[DATA] ${e}`));
    launcher.on('error', (e) => {
        console.error("[ERROR CRÍTICO]", e);
        mainWindow.webContents.send('status-msg', `Error al lanzar: ${e.message || e}`);
    });
    launcher.on('progress', (e) => { mainWindow.webContents.send('progress', e); });

    launcher.launch(opts);
});