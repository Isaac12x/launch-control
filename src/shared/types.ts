export type LaunchdAction =
  | 'start'
  | 'stop'
  | 'restart'
  | 'enable'
  | 'disable'
  | 'delete'

export type LaunchdTerminalMode = 'service' | 'logs'
export type LaunchdGhosttyMode = LaunchdTerminalMode
export type StartConditionState = 'loaded' | 'running'

export interface TerminalSessionInfo {
  id: string
  label: string
  mode: LaunchdTerminalMode
  title: string
  subtitle: string
  cwd: string
  shell: string
}

export interface TerminalDataEvent {
  id: string
  data: string
}

export interface TerminalExitEvent {
  id: string
  exitCode: number
  signal?: number
}

export interface LoginItemSettings {
  openAtLogin: boolean
}

export interface ServiceLogTarget {
  kind: 'stdout' | 'stderr'
  path: string
}

export interface ServiceLogFile extends ServiceLogTarget {
  exists: boolean
  content: string
}

export interface ServiceLogs {
  label: string
  name: string
  files: ServiceLogFile[]
  generatedAt: string
}

export interface ServiceSource {
  label: string
  kind: 'runner' | 'plist'
  path: string
  content: string
  generatedAt: string
}

export interface LaunchdPlistField {
  key: string
  value: string
  help: string
}

export interface LaunchdPlistDocument {
  label: string
  plistPath: string
  plistContent: string
  runnerPath: string | null
  fields: LaunchdPlistField[]
  generatedAt: string
}

export interface CreateLaunchdServiceInput {
  label: string
  plistContent: string
}

export interface ServiceStartCondition {
  afterLabel: string
  waitFor: StartConditionState
  delaySeconds: number
}

export interface ServiceAutomationSettings {
  startCondition: ServiceStartCondition | null
  automaticStartTimes: string[]
  startOnLaunch: boolean
  launchDelaySeconds: number
  ensureRunning: boolean
}

export interface ServiceLoadSnapshot {
  cpuPercent: number | null
  gpuPercent: number | null
  residentMemoryBytes: number | null
  virtualMemoryBytes: number | null
  memoryPercent: number | null
  vramBytes: number | null
  energyImpact: number | null
  threads: number | null
  cpuTime: string | null
  state: string | null
  sampledAt: string
}

export interface LaunchdService {
  label: string
  name: string
  alias: string | null
  folder: string | null
  plistPath: string | null
  plistName: string | null
  serviceInfo: string | null
  enabled: boolean
  loaded: boolean
  running: boolean
  pid: number | null
  lastExitStatus: number | null
  status: 'running' | 'loaded' | 'stopped'
  logTargets: ServiceLogTarget[]
  automation: ServiceAutomationSettings
  load: ServiceLoadSnapshot
}

export interface LaunchdApi {
  listServices: () => Promise<LaunchdService[]>
  refreshLiveServices: () => Promise<LaunchdService[]>
  createService: (input: CreateLaunchdServiceInput) => Promise<LaunchdService[]>
  renameService: (label: string, alias: string) => Promise<LaunchdService[]>
  clearAlias: (label: string) => Promise<LaunchdService[]>
  moveServicesToFolder: (labels: string[], folderPath: string) => Promise<LaunchdService[]>
  saveAutomation: (
    label: string,
    settings: ServiceAutomationSettings
  ) => Promise<LaunchdService[]>
  runAction: (label: string, action: LaunchdAction) => Promise<LaunchdService[]>
  readLogs: (label: string) => Promise<ServiceLogs>
  readPlist: (label: string) => Promise<LaunchdPlistDocument>
  savePlist: (label: string, content: string) => Promise<LaunchdService[]>
  readSource: (label: string) => Promise<ServiceSource>
  openTerminal: (label: string, mode: LaunchdTerminalMode) => Promise<TerminalSessionInfo>
  writeTerminal: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  closeTerminal: (id: string) => Promise<void>
  onTerminalData: (listener: (event: TerminalDataEvent) => void) => () => void
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void
  openGhostty: (label: string, mode: LaunchdGhosttyMode) => Promise<void>
  getLoginItemSettings: () => Promise<LoginItemSettings>
  setOpenAtLogin: (enabled: boolean) => Promise<LoginItemSettings>
}
