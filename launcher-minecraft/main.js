const { app, BrowserWindow, ipcMain, dialog, net } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1150,
        height: 750,
        resizable: true, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true 
        }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- FUNCIÓN PARA CONSULTAR LA API EN TIEMPO REAL DE MOJANG ---
function fetchMojangVersions() {
    return new Promise((resolve) => {
        const request = net.request('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        
        request.on('response', (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.versions || []);
                } catch (e) {
                    console.error("Error al procesar JSON de Mojang:", e);
                    resolve([]);
                }
            });
        });

        request.on('error', (err) => {
            console.error("Error de red conectando con Mojang:", err);
            resolve([]);
        });

        request.end();
    });
}

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
    data.list = Array.isArray(data.list) ? data.list : [];
    data.accounts = Array.isArray(data.accounts) ? data.accounts.filter(acc => typeof acc === 'string' && !acc.includes('[object Object]')) : [];
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    return data;
}

// --- CANAL IPC PARA DESCARGAR VERSIONES EN VIVO ---
ipcMain.handle('get-mojang-versions', async () => {
    return await fetchMojangVersions();
});

// --- CANALES IPC PARA PERFILES ---
ipcMain.handle('get-profiles', () => {
    return getSanitizedData();
});

ipcMain.on('save-profile', (event, profile) => {
    try { profilesManager.save(profile); } catch(e){}
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
    try { profilesManager.save(updatedProfile); } catch(e){}
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
            const data = getSanitizedData();
            data.settings = newSettings;
            if (profilesManager.save) profilesManager.save(data);
        }
    } catch(e){
        console.error("Error guardando opciones:", e);
    }
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

// --- CANALES PARA CUENTAS ---
ipcMain.on('save-account', (event, username) => {
    let cleanUsername = username;
    if (username && typeof username === 'object') cleanUsername = username.username || username.name;
    if (!cleanUsername || typeof cleanUsername !== 'string' || cleanUsername.includes('[object Object]') || cleanUsername.trim() === "") return;

    cleanUsername = cleanUsername.trim();
    try {
        if (typeof profilesManager.saveAccount === 'function') {
            profilesManager.saveAccount(cleanUsername);
        }
    } catch (e) {}
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

    launcher.removeAllListeners('debug');
    launcher.removeAllListeners('data');
    launcher.removeAllListeners('error');
    launcher.removeAllListeners('progress');

    launcher.on('debug', (e) => {
        console.log(`[DEBUG] ${e}`);
        if(mainWindow) mainWindow.webContents.send('console-log', `[DEBUG] ${e}`);
    });
    launcher.on('data', (e) => {
        console.log(`[DATA] ${e}`);
        if(mainWindow) mainWindow.webContents.send('console-log', `[INFO] ${e}`);
    });
    launcher.on('error', (e) => {
        console.error("[ERROR CRÍTICO]", e);
        if(mainWindow) {
            mainWindow.webContents.send('console-log', `[ERROR] ${e.message || e}`);
            mainWindow.webContents.send('status-msg', `Error al lanzar: ${e.message || e}`);
        }
    });
    
    launcher.on('progress', (e) => { mainWindow.webContents.send('progress', e); });

    launcher.launch(opts);
});