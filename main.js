const { app, BrowserWindow, ipcMain, dialog, net, nativeImage, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');
const os = require('os'); 
const { Client, Authenticator } = require('minecraft-launcher-core');
const msmc = require('msmc');
const profilesManager = require('./profiles-manager');
const launcher = new Client();


// CONSTANTES DE VERSIÓN DEL LAUNCHER
const LAUNCHER_VERSION = require('./package.json').version;
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/version.json';

// --- CONFIGURACIÓN DE DISCORD RICH PRESENCE (CON DEPURACIÓN) ---
const DiscordRPC = require('discord-rpc-revamp');

const discordClientId = '1509574161603887124'; 
try {
    DiscordRPC.register(discordClientId);
} catch (e) {
    console.error("[DISCORD RPC] Error al registrar el Client ID:", e);
}

const rpc = new DiscordRPC.Client({ transport: 'ipc' });
let rpcConnected = false;
let startTimestamp = null;

function updateDiscordPresence(details, state, partySize = 0, partyMax = 0) {
    if (!rpcConnected || !rpc) {
        console.log("[DISCORD RPC] No se pudo actualizar el estado: RPC no conectado.");
        return;
    }

    const presence = {
        details: details,
        state: state,
        startTimestamp: startTimestamp,
        largeImageKey: 'logo_grande', 
        largeImageText: 'Kurai Launcher',
        instance: false,
    };

    if (partyMax > 0) {
        presence.partySize = partySize;
        presence.partyMax = partyMax;
    }

    rpc.setActivity(presence).catch(err => console.error("[DISCORD RPC] Error actualizando actividad:", err));
}

function startRpcConnection() {
    if (rpcConnected) return;

    console.log("[DISCORD RPC] Intentando conectar con la aplicación de Discord...");

    try {
        const loginMethod = rpc.login || rpc.connect;
        
        if (typeof loginMethod === 'function') {
            loginMethod.call(rpc, { clientId: discordClientId })
                .then(() => {
                    rpcConnected = true;
                    startTimestamp = Date.now();
                    console.log('¡Discord Rich Presence activado y conectado con éxito!');
                    updateDiscordPresence('En el menú principal', '');
                })
                .catch((err) => {
                    rpcConnected = false;
                    console.warn("[DISCORD RPC] Discord no está abierto o rechazó la conexión. Reintentando en 15s...", err.message || err);
                    setTimeout(startRpcConnection, 15000); // Reintentar
                });
        } else {
            console.error("[DISCORD RPC] Error crítico: No se encontró el método de inicio de sesión en discord-rpc-revamp.");
        }
    } catch (e) {
        rpcConnected = false;
        console.error("[DISCORD RPC] Excepción capturada al intentar conectar:", e);
        setTimeout(startRpcConnection, 15000);
    }
}

// Iniciar conexión de alta prioridad inmediatamente
startRpcConnection();

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

const RUTAS_JAVA_21 = [
    "C:\\Program Files\\Eclipse Adoptium\\jdk-21.*-hotspot\\bin\\javaw.exe",
    "C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe",
    "C:\\Program Files\\Java\\jre-21\\bin\\javaw.exe",
    "C:\\Program Files\\Eclipse Foundation\\jdk-21-hotspot\\bin\\javaw.exe",
    "C:\\Program Files (x86)\\Java\\jdk-21\\bin\\javaw.exe"
];

function obtenerRutaJava21() {
    // 1. Buscar en la ruta de usuario (AppData\Local\Programs\Eclipse Adoptium) para JDK 25 o JDK 21
    try {
        const localProgramsDir = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Eclipse Adoptium');
        if (fs.existsSync(localProgramsDir)) {
            const carpetas = fs.readdirSync(localProgramsDir);
            const carpetaJdk = carpetas.find(f => f.toLowerCase().includes('jdk-25') || f.toLowerCase().includes('jdk-21') || f.toLowerCase().includes('25.') || f.toLowerCase().includes('21.'));
            if (carpetaJdk) {
                const rutaDetectada = path.join(localProgramsDir, carpetaJdk, 'bin', 'javaw.exe');
                if (fs.existsSync(rutaDetectada)) return rutaDetectada;
            }
        }
    } catch (e) {}

    // 2. Buscar en Program Files de forma global
    const baseJavaDirs = [
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files (x86)\\Java"
    ];

    for (const baseJavaDir of baseJavaDirs) {
        if (fs.existsSync(baseJavaDir)) {
            try {
                const carpetas = fs.readdirSync(baseJavaDir);
                const carpetaJdk = carpetas.find(f => f.toLowerCase().includes('jdk-25') || f.toLowerCase().includes('jdk-21') || f.toLowerCase().includes('25') || f.toLowerCase().includes('21'));
                if (carpetaJdk) {
                    const rutaDetectada = path.join(baseJavaDir, carpetaJdk, 'bin', 'javaw.exe');
                    if (fs.existsSync(rutaDetectada)) return rutaDetectada;
                }
            } catch (err) {}
        }
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
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
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
    const javaPath = obtenerRutaJava21();
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
    // Obtenemos los ajustes guardados mediante profilesManager
    const data = getSanitizedData();
    const userChannel = data.settings?.updateChannel || (LAUNCHER_VERSION.toLowerCase().includes('beta') ? 'beta' : 'stable');
    const allowPrereleases = (userChannel === 'beta');

    const updateApiUrl = 'https://api.github.com/repos/SuzuKurai/KuraiLauncher/releases';

    const request = net.request({
        url: updateApiUrl,
        headers: { 'User-Agent': 'KuraiLauncher' }
    });

    request.on('response', (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            try {
                const releases = JSON.parse(body);
                if (!Array.isArray(releases) || releases.length === 0) return;

                // Filtramos según el canal configurado por el usuario en el index
                const validReleases = releases.filter(rel => {
                    if (allowPrereleases) return true; // Si eligió Beta, acepta tanto estables como pre-releases
                    return !rel.prerelease;        // Si eligió Estable, ignora las pre-releases
                });

                if (validReleases.length === 0) return;

                const latestRelease = validReleases[0];
                const latestVersionTag = latestRelease.tag_name.replace(/^v/, '');

                if (latestVersionTag !== LAUNCHER_VERSION) {
                    mainWindow.webContents.send('update-available', {
                        current: LAUNCHER_VERSION, 
                        latest: latestVersionTag, 
                        url: latestRelease.html_url || 'https://github.com/SuzuKurai/KuraiLauncher/releases'
                    });
                }
            } catch (e) {
                console.error("Error al procesar las actualizaciones:", e);
            }
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
ipcMain.handle('check-java-status', () => {
        const javaPath = obtenerRutaJava21();
        return javaPath !== null;
    });
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

function injectVanillaSkin(minecraftRoot, versionId, base64Data) {
    if (!base64Data) return;
    try {
        // Las texturas base de entidad en las versiones modernas suelen estar en los assets o se pueden forzar.
        // Una forma muy limpia en Vanilla sin romper hashes es colocar un archivo de skin local 
        // o parchear la textura predeterminada de los assets.
        const assetsDir = path.join(minecraftRoot, 'assets');
        // O si prefieres usar un enfoque directo para texturas de entidad:
        console.log(`[SKIN SYSTEM] Preparando skin personalizada para modo Vanilla...`);
        
        // Guardamos la skin subida en una ruta fija que tu launcher pueda inyectar
        const customSkinPath = path.join(minecraftRoot, '.KuraiLauncher', 'skins', 'current_custom.png');
        const dir = path.dirname(customSkinPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(customSkinPath, Buffer.from(base64Data, 'base64'));
        console.log(`[SKIN SYSTEM] Skin personalizada guardada en: ${customSkinPath}`);
    } catch (error) {
        console.error("[SKIN SYSTEM] Error al inyectar skin en vanilla:", error);
    }
}

function setupCustomSkinLoader(minecraftRoot, username, base64Data) {
    try {
        const configDirRoot = path.join(minecraftRoot, 'CustomSkinLoader');
        const configDirModern = path.join(minecraftRoot, 'config', 'CustomSkinLoader');
        
        // Configuración estándar para que CustomSkinLoader lea las skins locales de .KuraiLauncher
        const configContent = JSON.stringify({
            version: 14,
            loadlist: [
                { name: "KuraiLocal", type: "LocalSkin", root: ".KuraiLauncher" },
                { name: "Mojang", type: "MojangAPI" }
            ]
        }, null, 4);

        if (!fs.existsSync(configDirRoot)) fs.mkdirSync(configDirRoot, { recursive: true });
        if (!fs.existsSync(configDirModern)) fs.mkdirSync(configDirModern, { recursive: true });

        fs.writeFileSync(path.join(configDirRoot, 'CustomSkinLoader.json'), configContent, 'utf8');
        fs.writeFileSync(path.join(configDirModern, 'CustomSkinLoader.json'), configContent, 'utf8');

        // Ruta donde el loader buscará la skin del usuario offline
        const skinsDir = path.join(minecraftRoot, '.KuraiLauncher', 'skins');
        if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });

        const targetSkinPath = path.join(skinsDir, `${username}.png`);

        if (base64Data) {
            fs.writeFileSync(targetSkinPath, Buffer.from(base64Data, 'base64'));
            console.log(`[SKIN SYSTEM] Skin local guardada con éxito para el usuario no-premium: ${username} en ${targetSkinPath}`);
        } else {
            // Si no se subió una nueva en este inicio pero ya existía, la respetamos
            if (!fs.existsSync(targetSkinPath)) {
                console.log(`[SKIN SYSTEM] No hay skin personalizada subida para ${username}.`);
            }
        }
    } catch (error) {
        console.error("[SKIN SYSTEM] Error gestionando Custom Skin Loader:", error);
    }
}

ipcMain.handle('login-microsoft', async () => {
    try {
        const authManager = new msmc.Auth("249d8bd5-fbef-42a3-a443-05e94664b93e"); 
        const xboxManager = await authManager.launch("raw");
        const mcUser = await xboxManager.getMinecraft();

        if (mcUser && mcUser.mclc()) {
            const profile = mcUser.profile;
            
            const premiumAccountObj = {
                username: profile.name,
                uuid: profile.id,
                isPremium: true,
                mclcAuth: mcUser.mclc() 
            };

            profilesManager.saveAccount(premiumAccountObj); 
            
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

// Permite comprobar actualizaciones manualmente desde los ajustes
ipcMain.handle('check-for-updates-manual', async () => {
    const data = getSanitizedData();
    const userChannel = data.settings?.updateChannel || (LAUNCHER_VERSION.toLowerCase().includes('beta') ? 'beta' : 'stable');
    const allowPrereleases = (userChannel === 'beta');

    try {
        const response = await net.fetch('https://api.github.com/repos/SuzuKurai/KuraiLauncher/releases', {
            headers: { 'User-Agent': 'KuraiLauncher' }
        });
        const releases = await response.json();

        if (!Array.isArray(releases) || releases.length === 0) {
            return { hasUpdate: false, latest: LAUNCHER_VERSION, message: 'No se encontraron lanzamientos disponibles.' };
        }

        const validReleases = releases.filter(rel => {
            if (allowPrereleases) return true;
            return !rel.prerelease;
        });

        if (validReleases.length === 0) {
            return { hasUpdate: false, latest: LAUNCHER_VERSION, message: 'No hay actualizaciones disponibles en el canal seleccionado.' };
        }

        const latestRelease = validReleases[0];
        const latestVersionTag = latestRelease.tag_name.replace(/^v/, '');

        if (latestVersionTag !== LAUNCHER_VERSION) {
            return {
                hasUpdate: true,
                current: LAUNCHER_VERSION,
                latest: latestVersionTag,
                url: latestRelease.html_url || 'https://github.com/SuzuKurai/KuraiLauncher/releases'
            };
        } else {
            // AQUÍ ESTABA EL ERROR: Aseguramos devolver 'latest' también cuando son iguales
            return { hasUpdate: false, latest: latestVersionTag };
        }
    } catch (error) {
        console.error("Error comprobando actualizaciones:", error);
        return { hasUpdate: false, latest: LAUNCHER_VERSION, error: 'Error al conectar con el servidor de actualizaciones.' };
    }
});

// --- EVENTO DE LANZAMIENTO INTEGRAL ---
ipcMain.on('launch-game', async (event, fullSkinBase64) => {
    const data = getSanitizedData();
    const globalSettings = data.settings || {}; 
    const currentProfile = data.list.find(p => p.id === data.selectedProfile);

    if (!currentProfile) {
        mainWindow.webContents.send('status-msg', 'Error: Selecciona o crea un perfil primero.');
        return;
    }

    const activeUser = typeof data.selectedAccount === 'object' ? data.selectedAccount.username : data.selectedAccount || "KuraiUser";
    
    // CAMBIO AQUÍ: Sincronizar estado de Discord al iniciar preparativos
    startTimestamp = Date.now();
    updateDiscordPresence(`Preparando Minecraft`, `Cuenta: ${activeUser}`);

    mainWindow.webContents.send('status-msg', `Iniciando Minecraft versión ${currentProfile.version || "Desconocida"}...`);

    const defaultRoot = path.join(app.getPath('appData'), '.minecraft');
    let finalRoot = defaultRoot;
    if (globalSettings.gamePath && globalSettings.gamePath.trim() !== "") {
        finalRoot = globalSettings.gamePath.trim();
    } else if (currentProfile.path && currentProfile.path.trim() !== "") {
        finalRoot = currentProfile.path;
    }

    let base64Data = typeof fullSkinBase64 === 'string' ? fullSkinBase64.trim() : '';
    let esValido = false;

    if (base64Data) {
        if (base64Data.includes(';base64,')) {
            base64Data = base64Data.split(';base64,')[1];
        }
        if (base64Data.length > 0) esValido = true;
    }

    let cleanVersion = (currentProfile.version || "1.21").toString()
        .replace(/release:/i, '').replace(/snapshot:/i, '').replace(/beta\/alpha:/i, '').trim();

    setupCustomSkinLoader(finalRoot, activeUser, esValido ? base64Data : null);

    const parseRamToMb = (ramString) => {
        let num = parseInt(ramString, 10);
        if (isNaN(num)) return 4096;
        if (ramString.toLowerCase().includes('g')) return num * 1024;
        return num;
    };

    const maxRamMb = `${parseRamToMb(globalSettings.maxMemory || "4G")}M`;
    const minRamMb = `${parseRamToMb(globalSettings.minMemory || "2G")}M`;

    let javaPathManual = obtenerRutaJava21() || "javaw";

    let customJvmArgs = [];
    if(globalSettings.jvmArgs && globalSettings.jvmArgs.trim() !== "") {
        customJvmArgs = globalSettings.jvmArgs.trim().split(' ');
    }

    const activeAccountName = typeof data.selectedAccount === 'object' ? data.selectedAccount.username : data.selectedAccount;
    const accountData = data.accounts.find(acc => {
        if (typeof acc === 'object') return acc.username === activeAccountName;
        return acc === activeAccountName;
    });

    const isPremiumAccount = accountData && typeof accountData === 'object' && accountData.isPremium;

    // SÓLO aplicamos CustomSkinLoader si la cuenta es NO-PREMIUM
    if (!isPremiumAccount) {
        setupCustomSkinLoader(finalRoot, activeUser, esValido ? base64Data : null);
        console.log(`[SKIN SYSTEM] Cuenta no-premium detectada. Aplicando CustomSkinLoader para: ${activeUser}`);
    } else {
        console.log(`[SKIN SYSTEM] Cuenta premium detectada (${activeUser}). Omitiendo CustomSkinLoader para usar la skin oficial de Mojang/Microsoft.`);
    }

    let authOpts = {};

    if (accountData && typeof accountData === 'object' && accountData.isPremium && accountData.mclcAuth) {
        authOpts = accountData.mclcAuth;
        console.log(`[LAUNCHER] Iniciando en modo PREMIUM como: ${activeAccountName}`);
    } else {
        // Generar un UUID offline estándar tipo Mojang (OfflinePlayer:Nombre)
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(`OfflinePlayer:${activeUser}`).digest('hex');
        const offlineUuid = `${hash.substring(0,8)}-${hash.substring(8,12)}-4${hash.substring(13,16)}-a${hash.substring(17,20)}-${hash.substring(20,32)}`;

        authOpts = {
            access_token: "0",
            client_token: "0",
            accessToken: "0",
            clientToken: "0",
            uuid: offlineUuid,
            name: activeUser,
            user_properties: {}, // <--- DEBE SER UN OBJETO VACÍO, NO UN STRING "{}"
            meta: { type: "legacy", demo: false } // <--- Usar "legacy" en vez de "mojang" para evitar comprobaciones de red
        };
        console.log(`[LAUNCHER] Iniciando en modo NO-PREMIUM como: ${activeUser} (UUID: ${offlineUuid})`);
    }

    let opts = {
        authorization: authOpts, 
        root: finalRoot,
        javaPath: javaPathManual,
        version: { number: cleanVersion, type: "release" },
        memory: { max: maxRamMb, min: minRamMb },
        customArgs: customJvmArgs,
        overrides: { checkStrict: false }
    };

    // Remover listeners para evitar el aviso MaxListenersExceededWarning
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
        
        // Si el juego da error antes de abrir, regresamos el RPC al menú
        startTimestamp = Date.now();
        updateDiscordPresence('En el menú principal', '');
    });
    
    launcher.on('progress', (e) => { if(mainWindow) mainWindow.webContents.send('progress', e); });

    launcher.launch(opts).then(() => {
        const behavior = globalSettings.launcherBehavior || "hide";
        
        // CAMBIO AQUÍ: Actualizar presencia al entrar oficialmente al juego
        startTimestamp = Date.now();
        updateDiscordPresence('Jugando a Minecraft ${cleanVersion}', `Jugador: ${activeUser}`);

        if (behavior === "hide" && mainWindow) {
            mainWindow.minimize();
        } else if (behavior === "close") {
            app.quit();
        }
    });
});