const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// Global Exception Handler
process.on('uncaughtException', (error) => {
    dialog.showErrorBox("Uncaught Error", error.stack || error.message);
    app.quit();
});

// Start the Express Server
try {
    require('./server.js');
} catch (e) {
    dialog.showErrorBox("Server Startup Error", e.stack || e.message);
    app.quit(); // Don't continue if backend fails
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'FoxFlix',
        icon: path.join(__dirname, 'public/logo.png'), // Ensure this exists or remove
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Remove default menu for cleaner look
    Menu.setApplicationMenu(null);

    // Clear session cache to ensure fresh UI reload
    win.webContents.session.clearCache();

    // Load the server URL
    setTimeout(() => {
        win.loadURL('http://localhost:3000');
    }, 1000);

    // Open external links in browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// IPC Handlers
const { ipcMain } = require('electron');
ipcMain.handle('open-path', async (event, filePath) => {
    console.log("Opening file externally:", filePath);
    const result = await shell.openPath(filePath);
    return result;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Select Movies Folder',
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// Auto Updater Setup (Foxora Digital)
const { autoUpdater } = require('electron-updater');

// Configure autoUpdater logger & settings
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
    // Avoid running updater checks in development mode
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Development build detected. Skipping online update checks.');
        return;
    }

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[AutoUpdater] Check for updates error:', err);
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        dialog.showMessageBox({
            type: 'info',
            title: 'FoxFlix Update Ready',
            message: `A new version (${info.version}) of FoxFlix by Foxora Digital is ready to install. Restart now?`,
            buttons: ['Restart Now', 'Later']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });
}

app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
