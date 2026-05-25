const { app, BrowserWindow, ipcMain, dialog, net, nativeImage } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

// 🛠️ MUDAR LA CACHÉ DE ELECTRON A LA RUTA SEGURA DE MINECRAFT
const rutaRoaming = app.getPath('appData'); 
const cacheKurai = path.join(rutaRoaming, '.minecraft', '.KuraiLauncher', 'cache');

if (!fs.existsSync(cacheKurai)){
    fs.mkdirSync(cacheKurai, { recursive: true });
}
app.setPath('userData', cacheKurai); 

let mainWindow;

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
}

app.whenReady().then(createWindow);

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
        console.error("[MANAGER] Error al obtener datos del archivo, se usarán por defecto:", e);
    }
    data.list = Array.isArray(data.list) ? data.list : [];
    data.accounts = Array.isArray(data.accounts) ? data.accounts.filter(acc => typeof acc === 'string' && !acc.includes('[object Object]')) : [];
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    return data;
}

ipcMain.handle('get-mojang-versions', async () => {
    return await fetchMojangVersions();
});

ipcMain.handle('get-profiles', () => {
    return getSanitizedData();
});

ipcMain.on('save-profile', (event, nuevoPerfil) => {
    try { 
        let data = profilesManager.getAll();
        if (!data) {
            data = { list: [], selectedProfile: "", accounts: [], selectedAccount: "", settings: {} };
        }
        if (!data.list || !Array.isArray(data.list)) {
            data.list = [];
        }

        data.list.push(nuevoPerfil);
        
        if (!data.selectedProfile || data.selectedProfile === "") {
            data.selectedProfile = nuevoPerfil.id;
        }
        
        profilesManager.save(data); 
        console.log(`[OK] Perfil "${nuevoPerfil.name}" creado correctamente.`);
    } catch(e){
        console.error("Error crítico al crear perfil rápido:", e);
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
        const data = profilesManager.getAll();
        const index = data.list.findIndex(p => p.id === updatedProfile.id);
        if (index !== -1) {
            data.list[index] = updatedProfile;
            profilesManager.save(data);
        }
    } catch(e){}
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
    } catch(e){
        console.error("Error guardando opciones:", e);
    }
    mainWindow.webContents.send('data-updated', getSanitizedData());
});

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

// --- CANAL DE LANZAMIENTO CON ESCANEO AGRESIVO DE JAVA 25 ---
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
    
    // 🔍 LISTA DE RUTAS AMPLIADA: Buscamos todas las variantes de instalación posibles de Oracle e Eclipse Temurin para Java 25
    const posiblesRutasJava = [
        "C:\\Program Files\\Java\\jdk-25\\bin\\javaw.exe",
        "C:\\Program Files\\Java\\jre-25\\bin\\javaw.exe",
        "C:\\Program Files\\Eclipse Foundation\\jdk-25-hotspot\\bin\\javaw.exe",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-25-hotspot\\bin\\javaw.exe",
        "C:\\Program Files (x86)\\Java\\jdk-25\\bin\\javaw.exe"
    ];

    for (const ruta of posiblesRutasJava) {
        if (fs.existsSync(ruta)) {
            javaPathManual = ruta;
            break;
        }
    }

    // 💡 Si no está en las rutas por defecto, escaneamos dinámicamente la carpeta C:\Program Files\Java para encontrar cualquier subcarpeta que empiece con "jdk-25"
    if (!javaPathManual) {
        const baseJavaDir = "C:\\Program Files\\Java";
        if (fs.existsSync(baseJavaDir)) {
            try {
                const carpetas = fs.readdirSync(baseJavaDir);
                const carpetaJdk25 = carpetas.find(f => f.toLowerCase().includes('jdk-25') || f.toLowerCase().includes('25'));
                if (carpetaJdk25) {
                    const rutaDetectada = path.join(baseJavaDir, carpetaJdk25, 'bin', 'javaw.exe');
                    if (fs.existsSync(rutaDetectada)) {
                        javaPathManual = rutaDetectada;
                    }
                }
            } catch (err) {
                console.error("Error escaneando directorio de Java:", err);
            }
        }
    }

    // 🚨 ÚLTIMA SALVAGUARDA: Si fallan los escaneos manuales, tiramos de 'javaw' global (pero avisando en debug)
    if (!javaPathManual) {
        console.log("[DEBUG] No se halló el ejecutable físico de Java 25. Usando comando de entorno global.");
        javaPathManual = "javaw"; 
    }

    console.log(`[DEBUG] Ejecutando Minecraft con el binario de Java asignado en: ${javaPathManual}`);

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
        
        // Atrapamos tanto el error de código de clase como el mensaje de LinkageError explícito
        if (e.includes("UnsupportedClassVersionError") || e.includes("class file version 69.0") || e.includes("LinkageError occurred")) {
            if (mainWindow) {
                mainWindow.webContents.send('status-msg', 'Error: Versión de Java incompatible o desactualizada detectada.');
                mainWindow.webContents.send('java-missing-error');
            }
        }
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