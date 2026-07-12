import { app, protocol, net, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { basename } from 'path'
import { homedir } from 'os'
import { pathToFileURL } from 'node:url'
import { EdgeTTS } from 'node-edge-tts'
import fs from 'node:fs/promises'
import path from 'node:path'

function toAppTtsUrl(filePath: string): string {
  return pathToFileURL(filePath).toString().replace(/^file:/, 'app-tts:')
}

app.disableHardwareAcceleration()

// Must run before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-tts', privileges: { standard: true, stream: true, bypassCSP: false } }
])

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
      lastZoom: 1.0,
      ttsEngine: 'webspeech'
    })
  })

  ipcMain.handle('settings:save', (_event, settings: unknown) => {
    writeJSON(SETTINGS_FILE, settings)
  })

  // ── Edge TTS handlers ──────────────────────────────────────────────

  let voiceCache: { name: string; shortName: string; gender: string; locale: string }[] | null = null

  ipcMain.handle('tts:listVoices', async () => {
    if (voiceCache) return voiceCache
    try {
      const res = await fetch(
        'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4'
      )
      const voices = await res.json() as any[]
      voiceCache = voices.map(v => ({
        name: v.Name,
        shortName: v.ShortName,
        gender: v.Gender,
        locale: v.Locale
      }))
      return voiceCache
    } catch (err) {
      console.error('[Dokumen] Failed to fetch TTS voices:', err)
      return []
    }
  })

  let activeRequestId: string | null = null

  ipcMain.handle('tts:speak', async (_e, { text, voice, rate, pitch, volume, requestId }: {
    text: string; voice: string; rate: string; pitch: string; volume: string; requestId: string
  }) => {
    activeRequestId = requestId
    const id = crypto.randomUUID()
    const tempDir = app.getPath('temp')
    const audioPath = path.join(tempDir, `dokumen-tts-${id}.mp3`)
    const subsPath = path.join(tempDir, `dokumen-tts-${id}.json`)

    try {
      const tts = new EdgeTTS({ voice, rate, pitch, volume, saveSubtitles: true, timeout: 60000 })
      await tts.ttsPromise(text, audioPath)

      // Request may have been superseded while we awaited network I/O
      if (activeRequestId !== requestId) {
        fs.unlink(audioPath).catch(() => {})
        fs.unlink(subsPath).catch(() => {})
        return null
      }

      let subtitles: { part: string; start: number; end: number }[] = []
      try {
        const raw = await fs.readFile(subsPath, 'utf-8')
        subtitles = JSON.parse(raw)
      } catch {
        // subtitle file may not exist if saveSubtitles failed silently
      }

      return {
        requestId,
        audioUrl: toAppTtsUrl(audioPath),
        subtitles,
        cleanup: [audioPath, subsPath]
      }
    } catch (err) {
      console.error('[Dokumen] TTS synthesis failed:', err)
      fs.unlink(audioPath).catch(() => {})
      fs.unlink(subsPath).catch(() => {})
      return null
    }
  })

  ipcMain.handle('tts:stop', () => {
    activeRequestId = null
  })

  ipcMain.handle('tts:cleanup', async (_e, filePaths: string[]) => {
    await Promise.all(filePaths.map(p => fs.unlink(p).catch(() => {})))
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

    // Serve TTS audio files from disk via custom protocol
    protocol.handle('app-tts', async (request) => {
      const fileUrl = request.url.replace(/^app-tts:/, 'file:')
      try {
        const response = await net.fetch(fileUrl)
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'no-store')
        return new Response(response.body, { status: response.status, headers })
      } catch {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[app-tts] file not found:', fileUrl)
        }
        return new Response('Not Found', { status: 404 })
      }
    })

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
