import { contextBridge, ipcRenderer } from 'electron'
import type { LaunchdApi, TerminalDataEvent, TerminalExitEvent } from '../shared/types'

const api: LaunchdApi = {
  listServices: () => ipcRenderer.invoke('launchd:list'),
  refreshLiveServices: () => ipcRenderer.invoke('launchd:list-live'),
  createService: (input) => ipcRenderer.invoke('launchd:create', input),
  selectRepositoryForService: () => ipcRenderer.invoke('launchd:repository:select'),
  renameService: (label, alias) => ipcRenderer.invoke('launchd:rename', label, alias),
  clearAlias: (label) => ipcRenderer.invoke('launchd:clear-alias', label),
  moveServicesToFolder: (labels, folderPath) =>
    ipcRenderer.invoke('launchd:move-to-folder', labels, folderPath),
  saveAutomation: (label, settings) => ipcRenderer.invoke('launchd:save-automation', label, settings),
  runAction: (label, action) => ipcRenderer.invoke('launchd:action', label, action),
  readLogs: (label) => ipcRenderer.invoke('launchd:logs', label),
  readPlist: (label) => ipcRenderer.invoke('launchd:plist', label),
  savePlist: (label, content) => ipcRenderer.invoke('launchd:plist:save', label, content),
  readSource: (label) => ipcRenderer.invoke('launchd:source', label),
  openTerminal: (label, mode) => ipcRenderer.invoke('launchd:terminal:open', label, mode),
  writeTerminal: (id, data) => ipcRenderer.send('launchd:terminal:input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('launchd:terminal:resize', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.invoke('launchd:terminal:close', id),
  onTerminalData: (listener) => {
    const subscription = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => {
      listener(payload)
    }

    ipcRenderer.on('terminal:data', subscription)
    return () => ipcRenderer.removeListener('terminal:data', subscription)
  },
  onTerminalExit: (listener) => {
    const subscription = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => {
      listener(payload)
    }

    ipcRenderer.on('terminal:exit', subscription)
    return () => ipcRenderer.removeListener('terminal:exit', subscription)
  },
  openGhostty: (label, mode) => ipcRenderer.invoke('launchd:ghostty', label, mode),
  getLoginItemSettings: () => ipcRenderer.invoke('app:login-item-settings'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('app:set-open-at-login', enabled)
}

contextBridge.exposeInMainWorld('launchdControl', api)
