import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { basename } from 'path'
import { homedir } from 'os'

app.disableHardwareAcceleration()

process.on('uncaughtException', (err) => {
  console.error('[Dokumen] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Dokumen] Unhandled rejection:', reason)
})

let mainWindow: BrowserWindow | null = null
const pendingFiles: string[] = []

const DATA_DIR = join(homedir(), '.dokumen')
const BOOKMARKS_FILE = join(DATA_DIR, 'bookmarks.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    }
  } catch {
    // ignore
  }
  return fallback
}

function writeJSON(filePath: string, data: unknown): void {
  ensureDataDir()
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function createWindow(): void {
  console.log('[Dokumen] Creating window...')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Dokumen',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  registerIPC()

  if (process.env['ELECTRON_RENDERER_URL']) {
    console.log('[Dokumen] Loading URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log('[Dokumen] Loading file:', htmlPath)
    mainWindow.loadFile(htmlPath)
  }

  mainWindow.webContents.on('crashed', () => {
    console.error('[Dokumen] Renderer process crashed!')
  })

  mainWindow.on('unresponsive', () => {
    console.error('[Dokumen] Window became unresponsive!')
  })

  mainWindow.once('ready-to-show', () => {
    console.log('[Dokumen] Window ready to show')
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Dokumen] Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    console.log('[Dokumen] Window closed')
    mainWindow = null
  })

  for (const filePath of pendingFiles) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('file:opened', filePath)
    })
  }
  pendingFiles.length = 0
}

function registerIPC(): void {
  ipcMain.handle('dialog:openFile', async () => {
    console.log('[Dokumen] Opening file dialog')
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    console.log('[Dokumen] File dialog result:', result)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('file:read', (_event, filePath: string) => {
    console.log('[Dokumen] Reading file:', filePath)
    if (!existsSync(filePath)) {
      throw new Error('File not found: ' + filePath)
    }
    const buffer = readFileSync(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  ipcMain.handle('file:getName', (_event, filePath: string) => {
    return basename(filePath, '.pdf')
  })

  ipcMain.handle('handler:isDefault', async () => {
    try {
      const { execSync } = require('child_process')
      if (process.platform === 'win32') {
        const output = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice" /v ProgId 2>nul',
          { encoding: 'utf-8', windowsHide: true }
        )
        return output.includes('Dokumen.PDF')
      }
      if (process.platform === 'linux') {
        const output = execSync('xdg-mime query default application/pdf', {
          encoding: 'utf-8', windowsHide: true
        })
        return output.trim().toLowerCase().includes('dokumen')
      }
      return false
    } catch {
      return false
    }
  })

  ipcMain.handle('handler:setDefault', async () => {
    if (process.platform === 'win32') {
      shell.openExternal('ms-settings:defaultapps')
    } else if (process.platform === 'linux') {
      const { exec } = require('child_process')
      const desktopDir = join(homedir(), '.local', 'share', 'applications')
      if (!existsSync(desktopDir)) mkdirSync(desktopDir, { recursive: true })
      writeFileSync(join(desktopDir, 'com.limitless.dokumen.desktop'), `[Desktop Entry]
Name=Dokumen
Exec=${process.execPath} %f
Icon=dokumen
Type=Application
MimeType=application/pdf;
Terminal=false
`, 'utf-8')
      exec('xdg-mime default com.limitless.dokumen.desktop application/pdf')
    }
  })

  ipcMain.handle('settings:getDismissCount', () => {
    const settings = readJSON(SETTINGS_FILE, { defaultPromptDismissCount: 0 })
    return settings.defaultPromptDismissCount || 0
  })

  ipcMain.handle('settings:setDismissCount', (_event, count: number) => {
    const settings = readJSON(SETTINGS_FILE, { defaultPromptDismissCount: 0 })
    settings.defaultPromptDismissCount = count
    writeJSON(SETTINGS_FILE, settings)
  })

  ipcMain.handle('bookmarks:load', () => {
    return readJSON(BOOKMARKS_FILE, [])
  })

  ipcMain.handle('bookmarks:save', (_event, bookmarks: unknown) => {
    writeJSON(BOOKMARKS_FILE, bookmarks)
  })

  ipcMain.handle('settings:load', () => {
    return readJSON(SETTINGS_FILE, {
      theme: 'light',
      defaultPromptDismissCount: 0,
      isDefaultHandler: false,
      recentFiles: [],
      lastFilePath: null,
      lastPage: 1,
      lastZoom: 1.0
    })
  })

  ipcMain.handle('settings:save', (_event, settings: unknown) => {
    writeJSON(SETTINGS_FILE, settings)
  })
}

// macOS early handlers
if (process.platform === 'darwin') {
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) {
      mainWindow.webContents.send('file:opened', filePath)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    } else {
      pendingFiles.push(filePath)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow) {
      mainWindow.webContents.send('protocol:open', url)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Single instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const args = process.argv.slice(1)
    for (const arg of args) {
      if (arg.startsWith('--')) continue
      try {
        if (existsSync(arg) && arg.toLowerCase().endsWith('.pdf')) {
          if (mainWindow) {
            mainWindow.webContents.send('file:opened', arg)
          } else {
            pendingFiles.push(arg)
          }
        }
      } catch {
        // ignore
      }
    }
  })

  app.whenReady().then(() => {
    console.log('[Dokumen] App ready, platform:', process.platform)
    createWindow()

    if (process.platform !== 'darwin') {
      const args = process.argv.slice(1)
      for (const arg of args) {
        if (arg.startsWith('--')) continue
        try {
          if (existsSync(arg) && arg.toLowerCase().endsWith('.pdf')) {
            pendingFiles.push(arg)
          }
        } catch {
          // ignore
        }
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
