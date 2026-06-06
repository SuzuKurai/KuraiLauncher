const { app, BrowserWindow, ipcMain, dialog, net, nativeImage, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const msmc = require('msmc');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

// CONSTANTES DE VERSIÓN DEL LAUNCHER
const LAUNCHER_VERSION = require('./package.json').version;
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/SuzuKurai/KuraiLauncher/refs/heads/main/launcher-minecraft/version.json';

// --- CONFIGURACIÓN DE DISCORD RICH PRESENCE (ALTA PRIORIDAD SANEADO) ---
const DiscordRPC = require('discord-rpc-revamp');

const discordClientId = 'ad348cc338d2d1bc8705f779ba93b9e7312abc74e3a9ca6402594750fbe15022'; 

const AUTHLIBINJECTOR_INFO = {
    fabric: 'https://maven.tenshire.com/releases/com/github/GoldenGemAuthlib-TenshiRE/authlib-injector/2.0.0/authlib-injector-2.0.0-fabric-mc1.21.jar',
    neoforge: 'https://maven.tenshire.com/releases/com/github/GoldenGemAuthlib-TenshiRE/authlib-injector/2.0.0/authlib-injector-2.0.0-neoforge-mc1.21.jar'
};

const CUSTOMSKINLOADER_INFO = {
    fabric: 'https://edge.forgecdn.net/files/6351/89/CustomSkinLoader_Fabric-14.23.jar',
    neoforge: 'https://cdn.modrinth.com/versions/Lh26q8wJ/CustomSkinLoader-neoforge-1.21.0.jar'
};

DiscordRPC.register(discordClientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });
let rpcConnected = false;
let startTimestamp = null;

function updateDiscordPresence(details, state, partySize = 0, partyMax = 0) {
    if (!rpcConnected || !rpc) return;

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

    rpc.setActivity(presence).catch(err => console.error("Error actualizando RPC:", err));
}

function startRpcConnection() {
    if (rpcConnected) return;

    try {
        const loginMethod = rpc.login || rpc.connect;
        
        if (typeof loginMethod === 'function') {
            loginMethod.call(rpc, { clientId: discordClientId })
                .then(() => {
                    rpcConnected = true;
                    startTimestamp = new Date();
                    console.log('¡Discord Rich Presence activado con éxito!');
                    updateDiscordPresence('En el menú principal', 'Eligiendo versión para jugar');
                })
                .catch((err) => {
                    rpcConnected = false;
                    setTimeout(startRpcConnection, 15000); // Reintentar si Discord está cerrado
                });
        } else {
            console.error("No se pudo mapear el método de conexión del cliente de Discord.");
        }
    } catch (e) {
        rpcConnected = false;
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

const crypto = require('crypto');

function generateOfflineUUID(username) {
    return crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

ipcMain.on('delete-account', (event, username) => {
    try { profilesManager.deleteAccount(username); } catch(e){}
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

ipcMain.on('save-skin', (event, { username, skinBase64 }) => {
    try {
        const data = getSanitizedData();
        const globalSettings = data.settings || {};
        const defaultRoot = path.join(app.getPath('appData'), '.minecraft');
        let finalRoot = globalSettings.gamePath && globalSettings.gamePath.trim() !== "" ? globalSettings.gamePath.trim() : defaultRoot;
        
        const cleanBase64 = skinBase64.includes(';base64,') ? skinBase64.split(';base64,')[1] : skinBase64;
        
        if (cleanBase64 && cleanBase64.length > 0) {
            setupCustomSkinLoader(finalRoot, username, cleanBase64);
        }
    } catch(e) {}
});

async function downloadMod(url, destPath) {
    return new Promise((resolve, reject) => {
        const request = net.request(url);
        const file = fs.createWriteStream(destPath);
        
        request.on('response', (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        });
        
        request.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
        
        request.end();
    });
}

async function installOfflineSkinMods({ loaderType, minecraftRoot, mcVersion }) {
    try {
        const modsDir = path.join(minecraftRoot, 'mods');
        if (!fs.existsSync(modsDir)) {
            fs.mkdirSync(modsDir, { recursive: true });
        }

        // Descargar e instalar el loader si no está el compatible
        const versionsDir = path.join(minecraftRoot, 'versions');
        let hasCompatibleLoader = false;
        
        if (fs.existsSync(versionsDir)) {
            const allVersions = fs.readdirSync(versionsDir);
            hasCompatibleLoader = allVersions.some(v => {
                const lowerName = v.toLowerCase();
                if (loaderType === 'fabric' && lowerName.includes('fabric-loader')) {
                    return v.endsWith(`-${mcVersion}`) || v.includes(`-${mcVersion}.`);
                }
                if (loaderType === 'neoforge' && lowerName.includes('neoforge')) {
                    return v.includes(mcVersion.replace(/\./g, ''));
                }
                if (loaderType === 'forge' && lowerName.includes('forge')) {
                    return v.includes(`${mcVersion}-forge-`);
                }
                if (loaderType === 'quilt' && lowerName.includes('quilt-loader')) {
                    return v.endsWith(`-${mcVersion}`) || v.includes(`-${mcVersion}.`);
                }
                return false;
            });
        }

        if (!hasCompatibleLoader && loaderType) {
            // Descargar e instalar el loader automáticamente
            console.log(`[LAUNCHER] Instalando ${loaderType} para ${mcVersion}...`);
            
            // URLs de installers universales (que permiten seleccionar versión)
            const installerUrls = {
                fabric: `https://maven2.fabricmc.net/net/fabricmc/fabric-installer/1.1.1/fabric-installer-1.1.1.jar`,
                neoforge: `https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.152/neoforge-21.1.152-installer.jar`
            };
            
            const installerUrl = installerUrls[loaderType];
            if (!installerUrl) {
                return { success: false, needsLoader: true, message: `No hay instalador automático para ${loaderType}` };
            }

            const installerPath = path.join(minecraftRoot, `${loaderType}-installer.jar`);
            
            try {
                await downloadMod(installerUrl, installerPath);
                
                // Ejecutar el installer con Java
                const javaPath = obtenerRutaJava25() || "javaw";
                const installResult = await new Promise((resolve, reject) => {
                    // Usar parámetros para instalar automáticamente
                    const cmd = `"${javaPath}" -jar "${installerPath}" client -mcversion ${mcVersion} -dir "${minecraftRoot}"`;
                    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
                        try {
                            fs.unlinkSync(installerPath);
                        } catch (e) {}
                        if (error) {
                            console.error(`[LAUNCHER] Error instalando ${loaderType}:`, error.message);
                            resolve({ installed: false, error: error.message });
                        } else {
                            console.log(`[LAUNCHER] ${loaderType} instalado correctamente`);
                            resolve({ installed: true });
                        }
                    });
                });

                if (installResult.installed) {
                    return { success: true, message: `${loaderType} instalado correctamente` };
                }
            } catch (e) {
                console.error(`[LAUNCHER] Error descargando/instalando:`, e.message);
            }
            
            // Si falla, abrir URL manual
            return { 
                success: false, 
                needsLoader: true,
                message: `No se pudo instalar automáticamente. Instala ${loaderType} manualmente.` 
            };
        }

        // Si ya tiene loader o no se pudo instalar, solo instalar CustomSkinLoader
        const existingMods = fs.readdirSync(modsDir);
        existingMods.forEach(f => {
            if (f.toLowerCase().includes('customskinloader')) {
                fs.unlinkSync(path.join(modsDir, f));
            }
        });

        // Descargar CustomSkinLoader desde Modrinth (buscar versión compatible)
        const cslSearchUrl = `https://api.modrinth.com/v3/project/Lh26q8wJ/version?g=1.21&l=${loaderType}`;
        const cslSearchUrlAlt = `https://api.modrinth.com/v3/project/Lh26q8wJ/version?g=1.21.1&l=${loaderType}`;
        
        let cslUrl = '';
        const versionResponse = await new Promise((resolve, reject) => {
            const req = net.request(cslSearchUrl);
            let body = '';
            req.on('response', (res) => {
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(JSON.parse(body)));
            });
            req.on('error', reject);
            req.end();
        });
        
        cslUrl = versionResponse?.[0]?.files?.[0]?.url;
        
        // Si no se encontró para 1.21, probar 1.21.1
        if (!cslUrl && mcVersion === '1.21.1') {
            const versionResponseAlt = await new Promise((resolve, reject) => {
                const req = net.request(cslSearchUrlAlt);
                let body = '';
                req.on('response', (res) => {
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(JSON.parse(body)));
                });
                req.on('error', reject);
                req.end();
            });
            cslUrl = versionResponseAlt?.[0]?.files?.[0]?.url;
        }
        
        if (cslUrl) {
            const cslDest = path.join(modsDir, 'CustomSkinLoader.jar');
            await downloadMod(cslUrl, cslDest);
            return { success: true, message: 'CustomSkinLoader instalado correctamente' };
        }
        
        return { success: false, error: 'No se encontró CustomSkinLoader para la versión' };
    } catch (error) {
        console.error("[SKIN SYSTEM] Error instalando mods:", error);
        return { success: false, error: error.message };
    }
}

function getLatestForgeVersion(mcVersion) {
    const forgeVersions = {
        '1.21.1': '32.0.0',
        '1.21': '31.0.0',
        '1.20.1': '47.2.0'
    };
    return forgeVersions[mcVersion] || '47.2.0';
}

ipcMain.handle('install-offline-skin-mods', async (event, params) => {
    return await installOfflineSkinMods(params);
});

function getSkinBase64ForUser(minecraftRoot, username) {
    try {
        const localSkinDir = path.join(minecraftRoot, 'CustomSkinLoader', 'Local', 'skins');
        const targetSkinPath = path.join(localSkinDir, `${username}.png`);
        const offlineUuid = generateOfflineUUID(username);
        const uuidSkinPath = path.join(localSkinDir, `${offlineUuid}.png`);
        
        if (fs.existsSync(targetSkinPath)) {
            return fs.readFileSync(targetSkinPath).toString('base64');
        }
        if (fs.existsSync(uuidSkinPath)) {
            return fs.readFileSync(uuidSkinPath).toString('base64');
        }
    } catch (error) {
        console.error("[SKIN SYSTEM] Error leyendo skin existente:", error);
    }
    return null;
}

function detectVersionType(version) {
    // Detectar tipo de versión basado en el nombre
    const lower = version.toLowerCase();
    
    // Las snapshots modernas (26.x, 25wxx) también son snapshots
    const majorVersion = parseInt(version.split('.')[0]);
    const isModernSnapshot = !isNaN(majorVersion) && majorVersion >= 25;
    
    if (lower.includes('snapshot') || lower.match(/^\d+w\d+[a-z]*$/) || lower.match(/^\d+\.?\d*\.?\d*-?pre/) || isModernSnapshot) {
        return "snapshot";
    }
    if (lower.includes('beta') || lower.includes('alpha')) {
        return "old_beta";
    }
    // Verificar en el archivo JSON de la versión
    try {
        const versionJsonPath = path.join(app.getPath('appData'), '.minecraft', 'versions', version, `${version}.json`);
        if (fs.existsSync(versionJsonPath)) {
            const json = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            const jsonType = json.type || "release";
            return jsonType;
        }
    } catch (e) {}
    return "release";
}

function setupCustomSkinLoader(minecraftRoot, username, base64Data) {
    try {
        const modsDir = path.join(minecraftRoot, 'mods');
        const hasCustomSkinLoader = fs.existsSync(modsDir) && 
            fs.readdirSync(modsDir).some(f => f.toLowerCase().includes('customskinloader'));
        
        if (!hasCustomSkinLoader) {
            console.log(`[SKIN SYSTEM] CustomSkinLoader no está instalado. Las skins no premium no funcionarán sin el mod.`);
            console.log(`[SKIN SYSTEM] Instale CustomSkinLoader desde: https://www.curseforge.com/minecraft/mc-mods/customskinloader`);
        }

        const configDirRoot = path.join(minecraftRoot, 'CustomSkinLoader');
        const configDirModern = path.join(minecraftRoot, 'config', 'CustomSkinLoader');
        
        const localSkinDir = path.join(minecraftRoot, 'CustomSkinLoader', 'Local', 'skins');
        if (!fs.existsSync(localSkinDir)) fs.mkdirSync(localSkinDir, { recursive: true });

        if (base64Data) {
            const targetSkinPath = path.join(localSkinDir, `${username}.png`);
            fs.writeFileSync(targetSkinPath, Buffer.from(base64Data, 'base64'));

            const offlineUuid = generateOfflineUUID(username);
            const uuidSkinPath = path.join(localSkinDir, `${offlineUuid}.png`);
            fs.writeFileSync(uuidSkinPath, Buffer.from(base64Data, 'base64'));
            
            console.log(`[SKIN SYSTEM] Skin local asociada con éxito para el usuario: ${username} (UUID: ${offlineUuid})`);
        } else {
            console.log(`[SKIN SYSTEM] Preparando sistema de skins para usuario no premium: ${username}`);
        }

        const configContent = JSON.stringify({
            version: 14,
            loadlist: [
                { name: "LocalSkin", type: "LocalSkin", enable: true },
                { name: "Mojang", type: "MojangAPI", enable: true }
            ]
        }, null, 4);

        if (!fs.existsSync(configDirRoot)) fs.mkdirSync(configDirRoot, { recursive: true });
        if (!fs.existsSync(configDirModern)) fs.mkdirSync(configDirModern, { recursive: true });

        fs.writeFileSync(path.join(configDirRoot, 'CustomSkinLoader.json'), configContent, 'utf8');
        fs.writeFileSync(path.join(configDirModern, 'CustomSkinLoader.json'), configContent, 'utf8');

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
    startTimestamp = new Date();
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
    } else {
        const savedSkin = getSkinBase64ForUser(finalRoot, activeUser);
        if (savedSkin) {
            base64Data = savedSkin;
            esValido = true;
        }
    }

    let cleanVersion = (currentProfile.version || "1.21").toString()
        .replace(/release:/i, '').replace(/snapshot:/i, '').replace(/beta\/alpha:/i, '').trim();

    // Si offlineSkinsEnabled está activo, instalar mods necesarios
    const offlineSkinsEnabled = globalSettings.offlineSkinsEnabled === true;
    const loaderType = currentProfile.loader || globalSettings.offlineSkinsLoader || '';
    
    // Construir versión correcta según el loader
    let versionForLaunch = cleanVersion;
    let versionTypeForLaunch = detectVersionType(cleanVersion);
    
    // Si hay loader configurado, verificar que está instalado
    if (loaderType && loaderType !== '') {
        const versionsDir = path.join(finalRoot, 'versions');
        if (fs.existsSync(versionsDir)) {
            const allVersions = fs.readdirSync(versionsDir).filter(v => {
                const fullPath = path.join(versionsDir, v);
                try {
                    return fs.statSync(fullPath).isDirectory() && ((loaderType === 'fabric' && v.includes('fabric-loader')) || (loaderType === 'neoforge' && v.includes('neoforge')) || (loaderType === 'forge' && v.includes(`${cleanVersion}-forge`)) || (loaderType === 'quilt' && v.includes('quilt-loader')));
                } catch (e) { return false; }
            });
            
            // Verificar que hay loader compatible con la versión MC
            const hasCompatibleLoader = allVersions.some(v => {
                if (loaderType === 'fabric') {
                    return v.endsWith(`-${cleanVersion}`) || v.includes(`-${cleanVersion}.`);
                } else if (loaderType === 'neoforge') {
                    return v.includes(cleanVersion.replace(/\./g, ''));
                } else if (loaderType === 'forge') {
                    return v.includes(`${cleanVersion}-forge-`);
                }
                return false;
            });

            if (!hasCompatibleLoader) {
                mainWindow.webContents.send('status-msg', `${loaderType} ${cleanVersion} no está instalado.`);
                mainWindow.webContents.send('open-url', loaderType === 'fabric' ? 
                    'https://fabricmc.net/use/' : 
                    loaderType === 'neoforge' ? 'https://neoforge.dev/' :
                    loaderType === 'forge' ? 'https://files.minecraftforge.net/' :
                    'https://quiltmc.org/');
                return;
            }
            console.log(`[LAUNCHER] Loader ${loaderType} compatible detectado`);
        }
    }
    
    console.log(`[LAUNCHER DEBUG] Profile loader: ${currentProfile.loader}, MC version: ${cleanVersion}, type: ${versionTypeForLaunch}`);
    
    // Verificar que el loader está instalado (para mostrar en consola)
setupCustomSkinLoader(finalRoot, activeUser, base64Data);

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

    const activeAccountName = typeof data.selectedAccount === 'object' ? data.selectedAccount.username : data.selectedAccount;
    const accountData = data.accounts.find(acc => {
        if (typeof acc === 'object') return acc.username === activeAccountName;
        return acc === activeAccountName;
    });

    let authOpts = {};

    if (accountData && typeof accountData === 'object' && accountData.isPremium && accountData.mclcAuth) {
        authOpts = accountData.mclcAuth;
        console.log(`[LAUNCHER] Iniciando en modo PREMIUM como: ${activeAccountName}`);
    } else {
        const offlineUuid = generateOfflineUUID(activeUser);
        authOpts = {
            access_token: "00000000000000000000000000000000", client_token: "00000000000000000000000000000000",
            accessToken: "00000000000000000000000000000000", clientToken: "00000000000000000000000000000000",
            uuid: offlineUuid, name: activeUser, user_properties: "{}",
            meta: { type: "mojang", demo: false, xuid: "-1" }
        };
        console.log(`[LAUNCHER] Iniciando en modo NO-PREMIUM como: ${activeUser} (UUID: ${offlineUuid})`);
    }

    let opts = {
        authorization: authOpts, 
        root: finalRoot,
        javaPath: javaPathManual,
        version: { number: versionForLaunch, type: versionTypeForLaunch },
        memory: { max: maxRamMb, min: minRamMb },
        customArgs: customJvmArgs,
        overrides: { checkStrict: false }
    };

    console.log(`[LAUNCHER DEBUG] Launch options:`, JSON.stringify(opts, null, 2));
    console.log(`[LAUNCHER DEBUG] Version JSON check:`, path.join(finalRoot, 'versions', versionForLaunch, `${versionForLaunch}.json`));

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
        startTimestamp = new Date();
        updateDiscordPresence('En el menú principal', 'Planeando la siguiente partida');
    });
    
    launcher.on('progress', (e) => { if(mainWindow) mainWindow.webContents.send('progress', e); });

    launcher.launch(opts).then(() => {
        const behavior = globalSettings.launcherBehavior || "hide";
        
        // CAMBIO AQUÍ: Actualizar presencia al entrar oficialmente al juego
        startTimestamp = new Date();
        updateDiscordPresence('Jugando a Minecraft', `Versión: ${cleanVersion} 🚀`);

        if (behavior === "hide" && mainWindow) {
            mainWindow.minimize();
        } else if (behavior === "close") {
            app.quit();
        }
    });
});