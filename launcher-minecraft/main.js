const { app, BrowserWindow, ipcMain, dialog, net, nativeImage, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

// CONSTANTES DE VERSIÓN DEL LAUNCHER
const LAUNCHER_VERSION = '0.0.1-beta.2';
// Cambia esto por la URL real de tu repositorio donde alojes el JSON de control de versión
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/version.json';

const rutaRoaming = app.getPath('appData'); 
const cacheKurai = path.join(rutaRoaming, '.minecraft', '.KuraiLauncher', 'cache');

if (!fs.existsSync(cacheKurai)){
    fs.mkdirSync(cacheKurai, { recursive: true });
}
app.setPath('userData', cacheKurai); 

let mainWindow;
let consoleWindow = null; 

const ICONO_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/media/KuraiLauncher.png';

async function createWindow() {
    let appIcon = null;
    try {
        const response = await net.fetch(ICONO_URL);
        const buffer = await response.arrayBuffer();
        appIcon = nativeImage.createFromBuffer(Buffer.from(buffer));
    } catch (error) {
        console.error("No se pudo cargar el icono online:", error);
    }

    mainWindow = new BrowserWindow({
        width: 1150,                       
        height: 720,                      
        minWidth: 950,
        minHeight: 600,
        resizable: true, 
        icon: appIcon || undefined,       
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true 
        }
    });

    mainWindow.setMenuBarVisibility(false); 
    mainWindow.loadFile('index.html');

    // Comprobar actualizaciones tras cargar la interfaz
    mainWindow.webContents.on('did-finish-load', () => {
        checkLauncherUpdates();
    });
}

function createConsoleWindow() {
    if (consoleWindow) {
        consoleWindow.focus(); 
        return;
    }

    consoleWindow = new BrowserWindow({
        width: 750,
        height: 480,
        minWidth: 500,
        minHeight: 300,
        title: "Consola de Depuración - Kurai Launcher",
        backgroundColor: "#0a0a0f",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    consoleWindow.setMenuBarVisibility(false);
    consoleWindow.loadFile('console.html');

    consoleWindow.on('closed', () => {
        consoleWindow = null; 
    });
}

app.whenReady().then(createWindow);

// FUNCIÓN PARA VERIFICAR SI HAY ACTUALIZACIONES EN LA WEB
function checkLauncherUpdates() {
    const request = net.request(UPDATE_CHECK_URL);
    request.on('response', (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            try {
                const data = JSON.parse(body);
                // Si la versión remota es diferente o superior a la local
                if (data.version && data.version !== LAUNCHER_VERSION) {
                    mainWindow.webContents.send('update-available', {
                        current: LAUNCHER_VERSION,
                        latest: data.version,
                        url: data.url || 'https://github.com/'
                    });
                }
            } catch (e) {
                console.error("Error leyendo JSON de actualización remota:", e);
            }
        });
    });
    request.on('error', (err) => {
        console.error("No se pudo conectar con el servidor de actualizaciones:", err);
    });
    request.end();
}

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

function getSanitizedData() {
    let data = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
    try {
        const managerData = profilesManager.getAll();
        if (managerData && typeof managerData === 'object') {
            data = { ...data, ...managerData };
        }
    } catch (e) {
        console.error("[MANAGER] Error al obtener datos:", e);
    }
    data.list = Array.isArray(data.list) ? data.list : [];
    data.accounts = Array.isArray(data.accounts) ? data.accounts.filter(acc => typeof acc === 'string') : [];
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    return data;
}

ipcMain.handle('get-mojang-versions', async () => {
    return await fetchMojangVersions();
});

ipcMain.handle('get-profiles', () => {
    return getSanitizedData();
});

ipcMain.handle('get-launcher-version', () => {
    return LAUNCHER_VERSION;
});

ipcMain.on('open-external-console', () => {
    createConsoleWindow();
});

ipcMain.on('open-url', (event, url) => {
    shell.openExternal(url); // Abre el navegador predeterminado del sistema con la URL de descarga
});

ipcMain.on('save-profile', (event, perfilEntrante) => {
    try { 
        let data = profilesManager.getAll();
        if (!data) data = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
        if (!data.list) data.list = [];
        
        const indexExistente = data.list.findIndex(p => p.id === perfilEntrante.id);
        if (indexExistente !== -1) {
            data.list[indexExistente] = { ...data.list[indexExistente], ...perfilEntrante };
        } else {
            data.list.push(perfilEntrante);
        }

        if (!data.selectedProfile) data.selectedProfile = perfilEntrante.id;
        profilesManager.save(data); 
    } catch(e){
        console.error("Error al guardar perfil:", e);
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

ipcMain.on('save-settings', (event, newSettings) => {
    try {
        if (typeof profilesManager.saveSettings === 'function') {
            profilesManager.saveSettings(newSettings);
        } else {
            const data = getSanitizedData();
            data.settings = newSettings;
            if (profilesManager.save) profilesManager.save(data);
        }
    } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('save-account', (event, username) => {
    if (!username || typeof username !== 'string' || username.trim() === "") return;
    try { if (typeof profilesManager.saveAccount === 'function') profilesManager.saveAccount(username.trim()); } catch (e) {}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('select-account', (event, username) => {
    try { if (typeof profilesManager.selectAccount === 'function') profilesManager.selectAccount(username); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('delete-account', (event, username) => {
    try { if (typeof profilesManager.deleteAccount === 'function') profilesManager.deleteAccount(username); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('launch-game', async (event) => {
    const data = getSanitizedData();
    const currentProfile = data.list.find(p => p.id === data.selectedProfile);

    if (!currentProfile) {
        mainWindow.webContents.send('status-msg', 'Error: Selecciona o crea un perfil primero.');
        return;
    }

    const activeUser = data.selectedAccount || "KuraiUser";
    mainWindow.webContents.send('status-msg', `Iniciando Minecraft versión ${currentProfile.version || "Desconocida"}...`);

    const globalSettings = data.settings || {};
    const defaultRoot = path.join(app.getPath('appData'), '.minecraft');
    let finalRoot = defaultRoot;
    if (globalSettings.gamePath && globalSettings.gamePath.trim() !== "") {
        finalRoot = globalSettings.gamePath.trim();
    } else if (currentProfile.path && currentProfile.path.trim() !== "") {
        finalRoot = currentProfile.path;
    }

    const rawMax = globalSettings.maxMemory || "4G";
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
        "C:\\Program Files\\Java\\jdk-25\\bin\\javaw.exe",
        "C:\\Program Files\\Java\\jre-25\\bin\\javaw.exe",
        "C:\\Program Files\\Eclipse Foundation\\jdk-25-hotspot\\bin\\javaw.exe",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-25-hotspot\\bin\\javaw.exe",
        "C:\\Program Files (x86)\\Java\\jdk-25\\bin\\javaw.exe"
    ];

    for (const ruta of posiblesRutasJava) {
        if (fs.existsSync(ruta)) { javaPathManual = ruta; break; }
    }

    if (!javaPathManual) {
        const baseJavaDir = "C:\\Program Files\\Java";
        if (fs.existsSync(baseJavaDir)) {
            try {
                const carpetas = fs.readdirSync(baseJavaDir);
                const carpetaJdk25 = carpetas.find(f => f.toLowerCase().includes('jdk-25') || f.toLowerCase().includes('25'));
                if (carpetaJdk25) {
                    const rutaDetectada = path.join(baseJavaDir, carpetaJdk25, 'bin', 'javaw.exe');
                    if (fs.existsSync(rutaDetectada)) javaPathManual = rutaDetectada;
                }
            } catch (err) {}
        }
    }

    if (!javaPathManual) javaPathManual = "javaw"; 

    let customJvmArgs = [];
    if(globalSettings.jvmArgs && globalSettings.jvmArgs.trim() !== "") {
        customJvmArgs = globalSettings.jvmArgs.trim().split(' ');
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
        javaPath: javaPathManual,                                      
        version: { number: cleanVersion, type: "release" },
        memory: { max: maxRamMb, min: minRamMb },
        customArgs: customJvmArgs, 
        overrides: { checkStrict: false }
    };

    launcher.removeAllListeners('debug');
    launcher.removeAllListeners('data');
    launcher.removeAllListeners('error');
    launcher.removeAllListeners('progress');

    const sendLogTick = (level, text) => {
        if (consoleWindow) consoleWindow.webContents.send('console-tick-log', { level, text });
    };

    launcher.on('debug', (e) => { sendLogTick('debug', `[DEBUG] ${e}`); });

    launcher.on('data', (e) => {
        sendLogTick('info', `[INFO] ${e}`);
        if (e.includes("UnsupportedClassVersionError") || e.includes("class file version 69.0") || e.includes("LinkageError occurred")) {
            if (mainWindow) {
                mainWindow.webContents.send('status-msg', 'Error: Versión de Java incompatible detectada.');
                mainWindow.webContents.send('java-missing-error');
            }
        }
    });

    launcher.on('error', (e) => {
        sendLogTick('error', `[ERROR] ${e.message || e}`);
        if(mainWindow) mainWindow.webContents.send('status-msg', `Error al lanzar: ${e.message || e}`);
    });
    
    launcher.on('progress', (e) => { if(mainWindow) mainWindow.webContents.send('progress', e); });

    launcher.launch(opts).then(() => {
        const behavior = globalSettings.launcherBehavior || "hide";
        if (behavior === "hide" && mainWindow) {
            mainWindow.minimize();
        } else if (behavior === "close") {
            app.quit();
        }
    });
});