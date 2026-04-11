import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'node:path'
import type {
  LaunchdAction,
  LaunchdGhosttyMode,
  LaunchdService,
  LaunchdTerminalMode,
  LoginItemSettings,
  ServiceAutomationSettings
} from '../shared/types'
import { startAutomationCoordinator, type AutomationCoordinator } from './automation'
import {
  listServices,
  openGhostty,
  performAction,
  readLogs,
  readPlistDocument,
  readServiceSource,
  savePlistDocument
} from './launchd'
import {
  closeTerminalSession,
  closeWindowTerminals,
  disposeAllTerminals,
  openTerminalSession,
  resizeTerminalSession,
  writeTerminalInput
} from './terminal'
import {
  ensureLoginItemPreferenceInitialized,
  getAliases,
  getAutomationSettings,
  removeAlias,
  setAlias,
  setAliases,
  setAutomationSettings
} from './store'

let mainWindow: BrowserWindow | null = null
let cachedServices: LaunchdService[] = []
let tray: Tray | null = null
let isQuitting = false
let automationCoordinator: AutomationCoordinator | null = null
const TRAY_ICON_SIZE = 18

function normalizeAliasPath(value: string): string {
  return value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

function getAliasLeafName(service: LaunchdService): string {
  const aliasPath = normalizeAliasPath(service.alias ?? '')

  if (!aliasPath) {
    return service.name
  }

  const segments = aliasPath.split('/')
  return segments[segments.length - 1] ?? service.name
}

function getLoginItemSettings(): LoginItemSettings {
  return {
    openAtLogin: app.getLoginItemSettings().openAtLogin
  }
}

async function refreshServices(): Promise<LaunchdService[]> {
  const [aliases, automations] = await Promise.all([getAliases(), getAutomationSettings()])
  cachedServices = await listServices(aliases, automations)
  return cachedServices
}

async function withService<T>(
  label: string,
  callback: (service: LaunchdService) => Promise<T>
): Promise<T> {
  const services = cachedServices.length > 0 ? cachedServices : await refreshServices()
  const service = services.find((candidate) => candidate.label === label)

  if (!service) {
    throw new Error(`Service not found: ${label}`)
  }

  return callback(service)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#ece4d7',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      app.dock?.hide()
    }
  })

  mainWindow.on('closed', () => {
    if (mainWindow) {
      closeWindowTerminals(mainWindow)
    }
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  }

  if (process.platform === 'darwin') {
    app.dock?.show()
  }

  if (mainWindow?.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow?.show()
  mainWindow?.focus()
}

function createRocketTraySvg(size: number): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#000000"
        d="M14.52 2.7c-2.85.82-5.64 3.46-7.02 6.95L4.42 11a1.1 1.1 0 0 0-.63 1.4l1.02 2.56-1.78 1.78a1.1 1.1 0 0 0 1.55 1.55l1.78-1.78 2.56 1.02A1.1 1.1 0 0 0 10.32 17l1.34-3.08c3.49-1.38 6.13-4.17 6.95-7.02.29-1 .44-2.08.42-3.2-.02-1.07-.9-1.95-1.97-1.97-1.12-.02-2.2.13-3.2.42Zm-4.76 8.62a14.25 14.25 0 0 1 3.52-4.72c.96-.86 1.98-1.46 2.98-1.73.22-.06.47-.1.75-.13-.03.28-.07.53-.13.75-.27 1-.87 2.02-1.73 2.98a14.25 14.25 0 0 1-4.72 3.52l-.84 1.94-1.42-.57-.57-1.42 1.94-.84Zm6.26-4.9a1.38 1.38 0 1 0 0-.01v.01ZM8.25 18.1c-.44 0-.8.36-.8.8 0 1.3-.56 2.4-1.67 3.27a.8.8 0 0 0 .5 1.43.8.8 0 0 0 .49-.17c1.5-1.18 2.28-2.78 2.28-4.53 0-.44-.36-.8-.8-.8Z"
      />
    </svg>
  `
}

function createTrayIcon(): NativeImage {
  const trayIcon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createRocketTraySvg(TRAY_ICON_SIZE))}`
  )

  if (trayIcon.isEmpty()) {
    const fallbackIcon = nativeImage.createFromNamedImage('NSActionTemplate')
    fallbackIcon.setTemplateImage(true)
    return fallbackIcon
  }

  trayIcon.setTemplateImage(true)
  return trayIcon
}

async function ensureDefaultLoginItemRegistration(): Promise<void> {
  const shouldApplyDefault = await ensureLoginItemPreferenceInitialized()

  if (!shouldApplyDefault) {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false
  })
}

function createTray(): void {
  if (process.platform !== 'darwin' || tray) {
    return
  }

  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Open LaunchControl',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray = new Tray(createTrayIcon())
  tray.setToolTip('LaunchControl')
  tray.on('click', () => showMainWindow())
  tray.on('right-click', () => tray?.popUpContextMenu(trayMenu))
}

app.setName('LaunchControl')

app.whenReady().then(async () => {
  createTray()

  try {
    await ensureDefaultLoginItemRegistration()
  } catch (error) {
    console.error('Failed to register LaunchControl as a login item.', error)
  }

  ipcMain.handle('launchd:list', async () => refreshServices())

  ipcMain.handle('launchd:rename', async (_event, label: string, alias: string) => {
    await setAlias(label, alias)
    return refreshServices()
  })

  ipcMain.handle('launchd:clear-alias', async (_event, label: string) => {
    await removeAlias(label)
    return refreshServices()
  })

  ipcMain.handle('launchd:move-to-folder', async (_event, labels: string[], folderPath: string) => {
    const normalizedFolderPath = normalizeAliasPath(folderPath)
    const uniqueLabels = [...new Set(labels.filter((label) => typeof label === 'string' && label.trim()))]

    if (!normalizedFolderPath) {
      throw new Error('Folder path is required.')
    }

    if (uniqueLabels.length === 0) {
      return refreshServices()
    }

    const services = cachedServices.length > 0 ? cachedServices : await refreshServices()
    const updates: Record<string, string> = {}

    for (const label of uniqueLabels) {
      const service = services.find((candidate) => candidate.label === label)

      if (!service) {
        throw new Error(`Service not found: ${label}`)
      }

      updates[label] = `${normalizedFolderPath}/${getAliasLeafName(service)}`
    }

    await setAliases(updates)
    return refreshServices()
  })

  ipcMain.handle(
    'launchd:save-automation',
    async (_event, label: string, settings: ServiceAutomationSettings) => {
      await setAutomationSettings(label, settings)
      const services = await refreshServices()
      await automationCoordinator?.runNow()
      return services
    }
  )

  ipcMain.handle(
    'launchd:action',
    async (_event, label: string, action: LaunchdAction) => {
      const services = cachedServices.length > 0 ? cachedServices : await refreshServices()
      await performAction(services, label, action)
      const nextServices = await refreshServices()
      await automationCoordinator?.runNow()
      return nextServices
    }
  )

  ipcMain.handle('launchd:logs', async (_event, label: string) =>
    withService(label, (service) => readLogs(service))
  )

  ipcMain.handle('launchd:plist', async (_event, label: string) =>
    withService(label, (service) => readPlistDocument(service))
  )

  ipcMain.handle('launchd:plist:save', async (_event, label: string, content: string) => {
    await withService(label, (service) => savePlistDocument(service, content))
    return refreshServices()
  })

  ipcMain.handle('launchd:source', async (_event, label: string) =>
    withService(label, (service) => readServiceSource(service))
  )

  ipcMain.handle(
    'launchd:terminal:open',
    async (event, label: string, mode: LaunchdTerminalMode) =>
      withService(label, async (service) => {
        const window = BrowserWindow.fromWebContents(event.sender)

        if (!window) {
          throw new Error('Terminal window is not available.')
        }

        return openTerminalSession(window, service, mode)
      })
  )

  ipcMain.on('launchd:terminal:input', (_event, id: string, data: string) => {
    writeTerminalInput(id, data)
  })

  ipcMain.on('launchd:terminal:resize', (_event, id: string, cols: number, rows: number) => {
    resizeTerminalSession(id, cols, rows)
  })

  ipcMain.handle('launchd:terminal:close', (_event, id: string) => {
    closeTerminalSession(id)
  })

  ipcMain.handle(
    'launchd:ghostty',
    async (_event, label: string, mode: LaunchdGhosttyMode) =>
      withService(label, (service) => openGhostty(service, mode))
  )

  ipcMain.handle('app:login-item-settings', () => getLoginItemSettings())

  ipcMain.handle('app:set-open-at-login', (_event, enabled: boolean) => {
    void ensureLoginItemPreferenceInitialized()
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false
    })

    return getLoginItemSettings()
  })

  createWindow()
  automationCoordinator = startAutomationCoordinator({
    refreshServices,
    startService: async (label: string) => {
      const services = cachedServices.length > 0 ? cachedServices : await refreshServices()
      await performAction(services, label, 'start')
      return refreshServices()
    },
    onError: (error) => {
      console.error('Automation coordinator failed.', error)
    }
  })
  void automationCoordinator.runNow()

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  automationCoordinator?.dispose()
  automationCoordinator = null
  disposeAllTerminals()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
