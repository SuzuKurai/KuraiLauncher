const { app, BrowserWindow, ipcMain, dialog, net, nativeImage, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');
const os = require('os'); 
const { Client, Authenticator } = require('minecraft-launcher-core');
const msmc = require('msmc');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

// CONSTANTES DE VERSIÓN DEL LAUNCHER
const LAUNCHER_VERSION = '1.0.0-beta.1'; // Cambia esto manualmente con cada lanzamiento, o implementa un sistema de versionado automático para mantenerlo siempre actualizado.
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/version.json';

// --- CONFIGURACIÓN CENTRALIZADA DE LOGS ---
const logsDir = path.join(app.getPath('appData'), '.minecraft', '.KuraiLauncher', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function saveLogToFile(text) {
    const data = getSanitizedData(); 
    if (data.settings && data.settings.saveLogs === true) {
        const now = new Date();
        const logFileName = `${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()}-${now.getHours()}${now.getMinutes()}${now.getSeconds()}.txt`;
        const logFilePath = path.join(logsDir, logFileName);
        
        fs.appendFile(logFilePath, text + '\n', (err) => {
            if (err) console.error("Error al escribir log:", err);
        });
    }
}

const rutaRoaming = app.getPath('appData'); 
const cacheKurai = path.join(rutaRoaming, '.minecraft', '.KuraiLauncher', 'cache');

if (!fs.existsSync(cacheKurai)){
    fs.mkdirSync(cacheKurai, { recursive: true });
}
app.setPath('userData', cacheKurai); 

let mainWindow;
let consoleWindow = null; 

const ICONO_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/media/KuraiLauncher.png';

const RUTAS_JAVA_25 = [
    "C:\\Program Files\\Java\\jdk-25\\bin\\javaw.exe",
    "C:\\Program Files\\Java\\jre-25\\bin\\javaw.exe",
    "C:\\Program Files\\Eclipse Foundation\\jdk-25-hotspot\\bin\\javaw.exe",
    "C:\\Program Files\\Eclipse Adoptium\\jdk-25-hotspot\\bin\\javaw.exe",
    "C:\\Program Files (x86)\\Java\\jdk-25\\bin\\javaw.exe"
];

function obtenerRutaJava25() {
    for (const ruta of RUTAS_JAVA_25) {
        if (fs.existsSync(ruta)) return ruta;
    }
    const baseJavaDir = "C:\\Program Files\\Java";
    if (fs.existsSync(baseJavaDir)) {
        try {
            const carpetas = fs.readdirSync(baseJavaDir);
            const carpetaJdk25 = carpetas.find(f => f.toLowerCase().includes('jdk-25') || f.toLowerCase().includes('25'));
            if (carpetaJdk25) {
                const rutaDetectada = path.join(baseJavaDir, carpetaJdk25, 'bin', 'javaw.exe');
                if (fs.existsSync(rutaDetectada)) return rutaDetectada;
            }
        } catch (err) {}
    }
    return null;
}

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

    mainWindow.webContents.on('did-finish-load', () => {
        checkLauncherUpdates();
        verificarJavaAlInicio(); 
    });
}

function verificarJavaAlInicio() {
    const javaPath = obtenerRutaJava25();
    if (!javaPath) {
        mainWindow.webContents.send('java-missing-error');
    }
}

function createConsoleWindow() {
    if (consoleWindow) {
        consoleWindow.focus(); 
        return;
    }

    consoleWindow = new BrowserWindow({
        width: 750, height: 480, minWidth: 500, minHeight: 300,
        title: "Consola de Depuración - Kurai Launcher",
        backgroundColor: "#0a0a0f",
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    consoleWindow.setMenuBarVisibility(false);
    consoleWindow.loadFile('console.html');
    consoleWindow.on('closed', () => { consoleWindow = null; });
}

app.whenReady().then(createWindow);

function checkLauncherUpdates() {
    const request = net.request(UPDATE_CHECK_URL);
    request.on('response', (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.version && data.version !== LAUNCHER_VERSION) {
                    mainWindow.webContents.send('update-available', {
                        current: LAUNCHER_VERSION, latest: data.version, url: data.url || 'https://github.com/'
                    });
                }
            } catch (e) {}
        });
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
                } catch (e) { resolve([]); }
            });
        });
        request.on('error', () => resolve([]));
        request.end();
    });
}

function getSanitizedData() {
    let data = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
    try {
        const managerData = profilesManager.getAll();
        if (managerData && typeof managerData === 'object') data = { ...data, ...managerData };
    } catch (e) {}
    data.list = Array.isArray(data.list) ? data.list : [];
    
    // CAMBIO AQUÍ: Ahora permitimos tanto strings (no-premium) como objetos (premium)
    data.accounts = Array.isArray(data.accounts) ? data.accounts.filter(acc => typeof acc === 'string' || typeof acc === 'object') : [];
    
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    return data;
}

ipcMain.handle('get-system-ram', () => {
    return Math.floor(os.totalmem() / (1024 * 1024 * 1024));
});

ipcMain.handle('get-mojang-versions', async () => { return await fetchMojangVersions(); });
ipcMain.handle('get-profiles', () => { return getSanitizedData(); });
ipcMain.handle('get-launcher-version', () => { return LAUNCHER_VERSION; });
ipcMain.on('open-external-console', () => { createConsoleWindow(); });
ipcMain.on('open-url', (event, url) => { shell.openExternal(url); });

ipcMain.on('save-profile', (event, perfilEntrante) => {
    try { 
        let data = profilesManager.getAll() || { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
        if (!data.list) data.list = [];
        const idx = data.list.findIndex(p => p.id === perfilEntrante.id);
        if (idx !== -1) data.list[idx] = { ...data.list[idx], ...perfilEntrante };
        else data.list.push(perfilEntrante);
        if (!data.selectedProfile) data.selectedProfile = perfilEntrante.id;
        profilesManager.save(data); 
    } catch(e){}
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
        const data = getSanitizedData();
        data.settings = { ...data.settings, ...newSettings };
        profilesManager.save(data);
    } catch(e){}
    if (mainWindow) mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('save-account', (event, username) => {
    if (!username || typeof username !== 'string' || username.trim() === "") return;
    try { profilesManager.saveAccount(username.trim()); } catch (e) {}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('select-account', (event, username) => {
    try { profilesManager.selectAccount(username); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('delete-account', (event, username) => {
    try { profilesManager.deleteAccount(username); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

// =========================================================================
// FUNCIÓN AUXILIAR: ASISTENTE DE CONFIGURACIÓN DE CUSTOM SKIN LOADER
// =========================================================================
function setupCustomSkinLoader(minecraftRoot, username, base64Data) {
    try {
        // Rutas donde las variantes del mod buscan la configuración global (.minecraft o dentro de /config)
        const configDirRoot = path.join(minecraftRoot, 'CustomSkinLoader');
        const configDirModern = path.join(minecraftRoot, 'config', 'CustomSkinLoader');
        
        const configContent = JSON.stringify({
            version: 14,
            loadlist: [
                {
                    name: "KuraiLocal",
                    type: "LocalSkin",
                    root: ".KuraiLauncher" // Buscará texturas en .minecraft/.KuraiLauncher/skins/
                },
                {
                    name: "Mojang",
                    type: "MojangAPI" // Si no hay local, descarga de la base oficial de Minecraft
                }
            ]
        }, null, 4);

        if (!fs.existsSync(configDirRoot)) fs.mkdirSync(configDirRoot, { recursive: true });
        if (!fs.existsSync(configDirModern)) fs.mkdirSync(configDirModern, { recursive: true });

        fs.writeFileSync(path.join(configDirRoot, 'CustomSkinLoader.json'), configContent, 'utf8');
        fs.writeFileSync(path.join(configDirModern, 'CustomSkinLoader.json'), configContent, 'utf8');

        // Estructurar directorio de skins locales del Launcher
        const skinsDir = path.join(minecraftRoot, '.KuraiLauncher', 'skins');
        if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });

        const targetSkinPath = path.join(skinsDir, `${username}.png`);

        if (base64Data) {
            fs.writeFileSync(targetSkinPath, Buffer.from(base64Data, 'base64'));
            console.log(`[SKIN SYSTEM] Skin local asociada con éxito para el usuario: ${username}`);
        } else {
            if (fs.existsSync(targetSkinPath)) fs.unlinkSync(targetSkinPath);
        }
    } catch (error) {
        console.error("[SKIN SYSTEM] Error gestionando Custom Skin Loader:", error);
    }
}

// --- MANEJADOR DE AUTENTICACIÓN PREMIUM (MICROSOFT) ---
ipcMain.handle('login-microsoft', async () => {
    try {
        const authManager = new msmc.Auth("249d8bd5-fbef-42a3-a443-05e94664b93e"); 
        const xboxManager = await authManager.launch("raw");
        const mcUser = await xboxManager.getMinecraft();

        if (mcUser && mcUser.mclc()) {
            const profile = mcUser.profile;
            
            const premiumAccountObj = {
                username: profile.name,
                isPremium: true,
                mclcAuth: mcUser.mclc() 
            };

            // CAMBIO AQUÍ: Guardamos el objeto completo, no solo el string del nombre
            profilesManager.saveAccount(premiumAccountObj); 
            
            // Forzamos la selección automática de la nueva cuenta premium añadida
            if (typeof profilesManager.selectAccount === 'function') {
                profilesManager.selectAccount(premiumAccountObj.username);
            }
            
            return { success: true, username: profile.name };
        }
        return { success: false, error: 'No se pudo obtener el perfil de Minecraft.' };
    } catch (error) {
        console.error("Error en login de Microsoft:", error);
        return { success: false, error: error.message };
    }
});

// --- EVENTO DE LANZAMIENTO INTEGRAL (SISTEMA CUSTOM SKIN LOADER) ---
ipcMain.on('launch-game', async (event, fullSkinBase64) => {
    const data = getSanitizedData();
    const globalSettings = data.settings || {}; 
    const currentProfile = data.list.find(p => p.id === data.selectedProfile);

    if (!currentProfile) {
        mainWindow.webContents.send('status-msg', 'Error: Selecciona o crea un perfil primero.');
        return;
    }

    const activeUser = data.selectedAccount || "KuraiUser";
    mainWindow.webContents.send('status-msg', `Iniciando Minecraft versión ${currentProfile.version || "Desconocida"}...`);

    const defaultRoot = path.join(app.getPath('appData'), '.minecraft');
    let finalRoot = defaultRoot;
    if (globalSettings.gamePath && globalSettings.gamePath.trim() !== "") {
        finalRoot = globalSettings.gamePath.trim();
    } else if (currentProfile.path && currentProfile.path.trim() !== "") {
        finalRoot = currentProfile.path;
    }

    // Procesamiento seguro de la cadena Base64 entrante
    let base64Data = typeof fullSkinBase64 === 'string' ? fullSkinBase64.trim() : '';
    let esValido = false;

    if (base64Data) {
        if (base64Data.includes(';base64,')) {
            base64Data = base64Data.split(';base64,')[1];
        }
        if (base64Data.length > 0) {
            esValido = true;
        }
    }

    let cleanVersion = (currentProfile.version || "1.21").toString()
        .replace(/release:/i, '').replace(/snapshot:/i, '').replace(/beta\/alpha:/i, '').trim();

    // Invocar módulo inteligente de Custom Skin Loader
    setupCustomSkinLoader(finalRoot, activeUser, esValido ? base64Data : null);

    const parseRamToMb = (ramString) => {
        let num = parseInt(ramString, 10);
        if (isNaN(num)) return 4096;
        if (ramString.toLowerCase().includes('g')) return num * 1024;
        return num;
    };

    const maxRamMb = `${parseRamToMb(globalSettings.maxMemory || "4G")}M`;
    const minRamMb = `${parseRamToMb(globalSettings.minMemory || "2G")}M`;

    let javaPathManual = obtenerRutaJava25() || "javaw"; 

    let customJvmArgs = [];
    if(globalSettings.jvmArgs && globalSettings.jvmArgs.trim() !== "") {
        customJvmArgs = globalSettings.jvmArgs.trim().split(' ');
    }

    // --- DENTRO DE IPCMAIN.ON('LAUNCH-GAME') ---
    
    // Buscamos los datos completos de la cuenta actualmente seleccionada
    const activeAccountName = typeof data.selectedAccount === 'object' ? data.selectedAccount.username : data.selectedAccount;
    const accountData = data.accounts.find(acc => {
        if (typeof acc === 'object') return acc.username === activeAccountName;
        return acc === activeAccountName;
    });

    let authOpts = {};

    // Si la cuenta es un objeto y tiene los datos de autenticación de Microsoft válidos
    if (accountData && typeof accountData === 'object' && accountData.isPremium && accountData.mclcAuth) {
        // Inyectamos los tokens oficiales de Microsoft para saltar el modo Offline
        authOpts = accountData.mclcAuth;
        console.log(`[LAUNCHER] Iniciando en modo PREMIUM como: ${activeAccountName}`);
    } else {
        // Si no, iniciamos en modo Offline tradicional (No-Premium)
        authOpts = {
            access_token: "00000000000000000000000000000000", client_token: "00000000000000000000000000000000",
            accessToken: "00000000000000000000000000000000", clientToken: "00000000000000000000000000000000",
            uuid: "00000000-0000-0000-0000-000000000000", name: activeUser, user_properties: "{}",
            meta: { type: "mojang", demo: false }
        };
        console.log(`[LAUNCHER] Iniciando en modo NO-PREMIUM como: ${activeUser}`);
    }

    let opts = {
        authorization: authOpts, // Usará los datos dinámicos que acabamos de calcular
        root: finalRoot,
        javaPath: javaPathManual,
        version: { number: cleanVersion, type: "release" },
        memory: { max: maxRamMb, min: minRamMb },
        customArgs: customJvmArgs,
        overrides: { checkStrict: false }
    };

//    let opts = {
//        authorization: {
//            access_token: "00000000000000000000000000000000", client_token: "00000000000000000000000000000000",
//            accessToken: "00000000000000000000000000000000", clientToken: "00000000000000000000000000000000",
//            uuid: "00000000-0000-0000-0000-000000000000", name: activeUser, user_properties: "{}",
//            meta: { type: "mojang", demo: false }
//        },
//        root: finalRoot,
//        javaPath: javaPathManual,                                      
//        version: { number: cleanVersion, type: "release" },
//        memory: { max: maxRamMb, min: minRamMb },
//        customArgs: customJvmArgs, 
//        overrides: { checkStrict: false }
//    };

    launcher.removeAllListeners('debug');
    launcher.removeAllListeners('data');
    launcher.removeAllListeners('error');
    launcher.removeAllListeners('progress');

    const sendLogTick = (level, text) => {
        if (consoleWindow) consoleWindow.webContents.send('console-tick-log', { level, text });
    };

    launcher.on('debug', (e) => { sendLogTick('debug', `[DEBUG] ${e}`); saveLogToFile(`[DEBUG] ${e}`); });
    launcher.on('data', (e) => {
        sendLogTick('info', `[INFO] ${e}`); saveLogToFile(`[INFO] ${e}`); 
        if (e.includes("UnsupportedClassVersionError") || e.includes("class file version 69.0") || e.includes("LinkageError occurred")) {
            if (mainWindow) {
                mainWindow.webContents.send('status-msg', 'Error: Versión de Java incompatible.');
                mainWindow.webContents.send('java-missing-error');
            }
        }
    });

    launcher.on('error', (e) => {
        sendLogTick('error', `[ERROR] ${e.message || e}`); saveLogToFile(`[ERROR] ${e.message || e}`); 
        if(mainWindow) mainWindow.webContents.send('status-msg', `Error al lanzar: ${e.message || e}`);
    });
    
    launcher.on('progress', (e) => { if(mainWindow) mainWindow.webContents.send('progress', e); });

    launcher.launch(opts).then(() => {
        const behavior = globalSettings.launcherBehavior || "hide";
        if (behavior === "hide" && mainWindow) mainWindow.minimize();
        else if (behavior === "close") app.quit();
    });
});