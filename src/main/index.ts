import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'node:path'
import type {
  CreateLaunchdServiceInput,
  LaunchdAction,
  LaunchdGhosttyMode,
  LaunchdService,
  LaunchdTerminalMode,
  LoginItemSettings,
  ServiceAutomationSettings
} from '../shared/types'
import { startAutomationCoordinator, type AutomationCoordinator } from './automation'
import {
  createService,
  listServices,
  openGhostty,
  performAction,
  readLogs,
  readPlistDocument,
  refreshServiceRuntimeSnapshots,
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
  getFolders,
  removeAlias,
  setAlias,
  setAliases,
  setFolders,
  setAutomationSettings
} from './store'

let mainWindow: BrowserWindow | null = null
let cachedServices: LaunchdService[] = []
let tray: Tray | null = null
let isQuitting = false
let automationCoordinator: AutomationCoordinator | null = null
const TRAY_ICON_SIZE = 18
const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${TRAY_ICON_SIZE}" height="${TRAY_ICON_SIZE}" fill="black">
  <path fill-rule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clip-rule="evenodd" />
  <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
</svg>
`
// PNG template masks are retained as a fallback for systems that fail to decode SVG tray images.
const TRAY_ICON_PNG_1X =
  'iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAABmJLR0QA/wD/AP+gvaeTAAABY0lEQVQ4jcXTv0uVcRTH8ZfXyApqSsRJkIr+gP4BN+/QH1FLbUVbQ0ubg5bQkEPoIBgoQUGQjv0BOYk/KocStcmhpeTCdXg+l+e5l+eKtXjg8HC+n3Pez3PO9zwD/s8auBFv4NO/AsbwEgdoV/zuWQGDeIY/KfyKWbxLPHEWyBA+pGADzYo2l/PxusILuB1xCG+TvIRLlbwB/MROHeQO9pS9H+f5Pu1VrRltuhdyDb/wGy/wKqC/GOnJvYJNxczGekGP84YHiZ8nvt+TN4jlaE/r2lqL+AO7aOFIMbOODeNj8lZq2gVT+B7fTUttPAnsnvL6F3GxDlJno9hK4ZFy+C1cPq1wGAtYx4xioKP5ipZiZrMB3uoHaShntJ/nTLStuJy1cbMfqLMTrxWLto8v0TbxDQ8Vq7Gn+wK6bCGgpnLt31RAnQU9VCxtX9vW/Tev4nq0qcSPcPU0CHwObB6Tae987ASpmWXyMKDsDwAAAABJRU5ErkJggg=='
const TRAY_ICON_PNG_2X =
  'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAABmJLR0QA/wD/AP+gvaeTAAADBklEQVRYhe3XTYiVVRjA8d84KppZMzkWlgsLEgMtSgqEiogIWohCKkoxjWgbl6LWInAltCiwTZAVfW0iqMEWQRsxJFIkLZi0D5gKhklI+pgxGMZxpsV5L533+N57z71zR1z0wOG+7znPx/+ej+c8L9eZdF3jeAuxFvdjNXrQi99wEH9dK4it+BDjmKnTXptrkCXYi5EGEHH7aC5hNuLXBsGv4Ef8E/W9Mxcgi/FBHYhf8CoexY2F/s/R+KFOw9yB0xUgZ7EN8xL9Jbgc6T3fSZjbMZyAXMIL6K5j83ii/0CnYPrwXeJ8CHc1sXs50h/H/FaC9gj/aAcG8BRWCXns8wTmGG5q4q9LedMP5oL04g1MqN6ol5L3k/7bsI1kY2K3JQdmOc7VAalqFwqbZtIlbPSa3e9YlAP0aQswM9ie41Q4TbHdvhyjDYnRl7hPODHzi+Dx+IlMmLuVl3kUN+QYDkZGY7gtGT8VjY8Lx76Z9OIb5T+yOQdmGaYio1eS8YcTpy9l+FyKrxK7N3NgoD8xPC5cfLUWX5ZjuLmJv5XC6Yt9fi3vNIK3EuNG7WgTX08LpyhNmn25MIS6JBfoCnZV+FiOzyr0z2NFo+BV6fpg8VvP8E6sF/LJPBwp+t8WMvQevOjqpRwUsvxYI6B2ZZcwO/FMHcXfqmdyUot3VSegmrV7ZhuwT5j694RlGcCCCqjpiuCnhRoo7ts0G5gd+LMi0LdYk+ieicZH8UjR36U8gzvbhXlSuZKrgloY6cdZPS4jupVnrz8neFpWLhbKjdoGnMEX+CHSuRfPZvhep/zdN9IO0Hah8KrJfjwmfNydi/o3NPG7Aq9H7xPC0rYM9Fz0/D0OF89TuBiNxUsWy62FzU/K0O9r46t0lfKa7y/6u4vneOxAZBfvoao2JNz0LUtcOE3jwSLw+STAH0JFkAP0iRbvrVjeTYCq8sukqyvD9O6bwsd4qF2QmqSfMmkbxhMVdj0F1BE8g1tmC1KTqm/xaaEeGpBZiHdSthVQQ8J1sVs5Bfwv14X8C2QQbxYQMTsgAAAAAElFTkSuQmCC'

function normalizeAliasPath(value: string): string {
  return value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

function splitLegacyAliasPath(value: string): { folderPath: string; title: string } | null {
  const aliasPath = normalizeAliasPath(value)

  if (!aliasPath) {
    return null
  }

  const segments = aliasPath.split('/')

  if (segments.length < 2) {
    return null
  }

  return {
    folderPath: segments.slice(0, -1).join('/'),
    title: segments[segments.length - 1]
  }
}

function splitLegacyAliasFolders(
  aliases: Record<string, string>,
  folders: Record<string, string>
): {
  aliases: Record<string, string>
  folders: Record<string, string>
  aliasUpdates: Record<string, string | null>
  folderUpdates: Record<string, string>
} {
  const nextAliases = { ...aliases }
  const nextFolders = { ...folders }
  const aliasUpdates: Record<string, string | null> = {}
  const folderUpdates: Record<string, string> = {}

  // Older builds encoded virtual folders into aliases as "folder/title".
  for (const [label, alias] of Object.entries(aliases)) {
    if (folders[label]) {
      continue
    }

    const legacyAlias = splitLegacyAliasPath(alias)

    if (!legacyAlias) {
      continue
    }

    folderUpdates[label] = legacyAlias.folderPath
    nextFolders[label] = legacyAlias.folderPath

    if (legacyAlias.title === label) {
      aliasUpdates[label] = null
      delete nextAliases[label]
    } else {
      aliasUpdates[label] = legacyAlias.title
      nextAliases[label] = legacyAlias.title
    }
  }

  return {
    aliases: nextAliases,
    folders: nextFolders,
    aliasUpdates,
    folderUpdates
  }
}

function getLoginItemSettings(): LoginItemSettings {
  return {
    openAtLogin: app.getLoginItemSettings().openAtLogin
  }
}

async function refreshServices(): Promise<LaunchdService[]> {
  const [aliases, folders, automations] = await Promise.all([
    getAliases(),
    getFolders(),
    getAutomationSettings()
  ])
  const normalized = splitLegacyAliasFolders(aliases, folders)

  await Promise.all([
    Object.keys(normalized.aliasUpdates).length > 0
      ? setAliases(normalized.aliasUpdates)
      : Promise.resolve(),
    Object.keys(normalized.folderUpdates).length > 0
      ? setFolders(normalized.folderUpdates)
      : Promise.resolve()
  ])

  cachedServices = await listServices(normalized.aliases, normalized.folders, automations)
  return cachedServices
}

async function refreshLiveServices(): Promise<LaunchdService[]> {
  if (cachedServices.length === 0) {
    return refreshServices()
  }

  cachedServices = await refreshServiceRuntimeSnapshots(cachedServices)
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

function createPngDataUrl(base64Png: string): string {
  return `data:image/png;base64,${base64Png}`
}

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createTrayIcon(): NativeImage {
  let trayIcon: NativeImage
  try {
    trayIcon = nativeImage.createFromDataURL(createSvgDataUrl(TRAY_ICON_SVG))
  } catch (e) {
    trayIcon = nativeImage.createFromDataURL(createPngDataUrl(TRAY_ICON_PNG_1X))
  }

  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromDataURL(createPngDataUrl(TRAY_ICON_PNG_1X))
  }

  if (trayIcon.isEmpty()) {
    throw new Error('Failed to create LaunchControl tray icon.')
  }

  trayIcon.addRepresentation({
    scaleFactor: 2,
    dataURL: createPngDataUrl(TRAY_ICON_PNG_2X),
    width: TRAY_ICON_SIZE * 2,
    height: TRAY_ICON_SIZE * 2
  })
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
  ipcMain.handle('launchd:list-live', async () => refreshLiveServices())
  ipcMain.handle('launchd:create', async (_event, input: CreateLaunchdServiceInput) => {
    await createService(input)
    return refreshServices()
  })

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

      updates[label] = normalizedFolderPath
    }

    await setFolders(updates)
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
