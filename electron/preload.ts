import { contextBridge, ipcRenderer } from 'electron'

export interface TTSSpeakParams {
  text: string
  voice: string
  rate: string
  pitch: string
  volume: string
  requestId: string
}

export interface TTSVoice {
  name: string
  shortName: string
  gender: string
  locale: string
}

export interface TTSSpeakResult {
  requestId: string
  audioUrl: string
  subtitles: { part: string; start: number; end: number }[]
  cleanup: string[]
}

const electronAPI = {
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('file:read', filePath),
  getFileName: (filePath: string): Promise<string> => ipcRenderer.invoke('file:getName', filePath),

  onFileOpened: (callback: (filePath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => callback(filePath)
    ipcRenderer.on('file:opened', handler)
    return () => {
      ipcRenderer.removeListener('file:opened', handler)
    }
  },

  onProtocolUrl: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => callback(url)
    ipcRenderer.on('protocol:open', handler)
    return () => {
      ipcRenderer.removeListener('protocol:open', handler)
    }
  },

  isDefaultPDFHandler: (): Promise<boolean> => ipcRenderer.invoke('handler:isDefault'),
  setAsDefaultPDFHandler: (): Promise<void> => ipcRenderer.invoke('handler:setDefault'),
  getDefaultPromptDismissCount: (): Promise<number> => ipcRenderer.invoke('settings:getDismissCount'),
  setDefaultPromptDismissCount: (count: number): Promise<void> => ipcRenderer.invoke('settings:setDismissCount', count),

  loadBookmarks: (): Promise<any[]> => ipcRenderer.invoke('bookmarks:load'),
  saveBookmarks: (bookmarks: any[]): Promise<void> => ipcRenderer.invoke('bookmarks:save', bookmarks),
  loadSettings: (): Promise<any> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: any): Promise<void> => ipcRenderer.invoke('settings:save', settings),

  // Edge TTS
  ttsListVoices: (): Promise<TTSVoice[]> => ipcRenderer.invoke('tts:listVoices'),
  ttsSpeak: (params: TTSSpeakParams): Promise<TTSSpeakResult | null> => ipcRenderer.invoke('tts:speak', params),
  ttsStop: (): Promise<void> => ipcRenderer.invoke('tts:stop'),
  ttsCleanup: (filePaths: string[]): Promise<void> => ipcRenderer.invoke('tts:cleanup', filePaths),

  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
