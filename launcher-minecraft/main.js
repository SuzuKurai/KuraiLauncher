const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const profilesManager = require('./profiles-manager');
const launcher = new Client();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1050,
        height: 700,
        resizable: false, // Opcional: Bloquea el tamaño para que el diseño no se rompa
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true // 🔥 ESENCIAL: Permite cargar páginas web dentro de la app
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- CANALES IPC PARA PERFILES ---

ipcMain.handle('get-profiles', () => {
    return profilesManager.getAll();
});

ipcMain.on('save-profile', (event, profile) => {
    profilesManager.save(profile);
    mainWindow.webContents.send('profiles-updated', profilesManager.getAll());
});

ipcMain.on('delete-profile', (event, id) => {
    profilesManager.delete(id);
    mainWindow.webContents.send('profiles-updated', profilesManager.getAll());
});

ipcMain.on('select-profile', (event, id) => {
    profilesManager.select(id);
    mainWindow.webContents.send('profiles-updated', profilesManager.getAll());
});

// --- CANAL PARA LANZAR EL JUEGO ---
ipcMain.on('launch-game', async (event) => {
    const data = profilesManager.getAll();
    const currentProfile = data.list.find(p => p.id === data.selectedProfile);

    if (!currentProfile) {
        mainWindow.webContents.send('status-msg', 'Error: Selecciona o crea un perfil primero.');
        return;
    }

    console.log(`Iniciando Minecraft versión ${currentProfile.version}...`);

    let opts = {
        authorization: {
            access_token: "null",
            client_token: "null",
            uuid: "00000000-0000-0000-0000-000000000000", // UUID genérico para offline
            name: "KuraiUser",                            // Nombre del jugador
            user_properties: "{}",
            meta: {
                type: "msa", // Simula cuenta Microsoft para evitar bloqueos del juego
                demo: false
            }
        },
        root: path.join(__dirname, ".minecraft"),
        version: {
            number: currentProfile.version,
            type: "release"
        },
        memory: {
            max: "4G",
            min: "2G"
        }
    };

    launcher.launch(opts);

    launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
    launcher.on('data', (e) => console.log(`[DATA] ${e}`));
    
    // 🛠️ AÑADE ESTA LÍNEA para capturar si el motor del juego se rompe
    launcher.on('error', (e) => {
        console.error("[ERROR CRÍTICO]", e);
        mainWindow.webContents.send('status-msg', `Error al lanzar: ${e.message || e}`);
    });

    launcher.on('progress', (e) => {
        mainWindow.webContents.send('progress', e);
    });
});