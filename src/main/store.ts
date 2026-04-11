import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  ServiceAutomationSettings,
  ServiceStartCondition,
  StartConditionState
} from '../shared/types'

type AliasMap = Record<string, string>
type AutomationMap = Record<string, ServiceAutomationSettings>
interface PreferenceState {
  loginItemPreferenceInitialized?: boolean
}
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

function aliasesPath(): string {
  return join(app.getPath('userData'), 'aliases.json')
}

function automationPath(): string {
  return join(app.getPath('userData'), 'automation.json')
}

function preferencesPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function compareTimes(left: string, right: string): number {
  return left.localeCompare(right)
}

function normalizeAutomaticStartTimes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const uniqueTimes = new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => timePattern.test(entry))
  )

  return [...uniqueTimes].sort(compareTimes)
}

function normalizeWaitFor(value: unknown): StartConditionState {
  return value === 'loaded' ? 'loaded' : 'running'
}

function normalizeDelaySeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(24 * 60 * 60, Math.round(value)))
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function normalizeStartCondition(value: unknown): ServiceStartCondition | null {
  if (!isRecord(value)) {
    return null
  }

  const afterLabel = typeof value.afterLabel === 'string' ? value.afterLabel.trim() : ''

  if (!afterLabel) {
    return null
  }

  return {
    afterLabel,
    waitFor: normalizeWaitFor(value.waitFor),
    delaySeconds: normalizeDelaySeconds(value.delaySeconds)
  }
}

function normalizeAutomationSettings(value: unknown): ServiceAutomationSettings {
  if (!isRecord(value)) {
    return {
      startCondition: null,
      automaticStartTimes: [],
      startOnLaunch: false,
      launchDelaySeconds: 0,
      ensureRunning: false
    }
  }

  const startOnLaunch = normalizeBoolean(value.startOnLaunch)

  return {
    startCondition: normalizeStartCondition(value.startCondition),
    automaticStartTimes: normalizeAutomaticStartTimes(value.automaticStartTimes),
    startOnLaunch,
    launchDelaySeconds: startOnLaunch ? normalizeDelaySeconds(value.launchDelaySeconds) : 0,
    ensureRunning: normalizeBoolean(value.ensureRunning)
  }
}

async function readAliasFile(): Promise<AliasMap> {
  const filePath = aliasesPath()

  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as AliasMap
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function writeAliasFile(aliases: AliasMap): Promise<void> {
  const filePath = aliasesPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(aliases, null, 2), 'utf8')
}

async function readPreferencesFile(): Promise<PreferenceState> {
  const filePath = preferencesPath()

  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? (parsed as PreferenceState) : {}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function writePreferencesFile(preferences: PreferenceState): Promise<void> {
  const filePath = preferencesPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(preferences, null, 2), 'utf8')
}

async function readAutomationFile(): Promise<AutomationMap> {
  const filePath = automationPath()

  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([label, value]) => [label, normalizeAutomationSettings(value)])
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function writeAutomationFile(automations: AutomationMap): Promise<void> {
  const filePath = automationPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(automations, null, 2), 'utf8')
}

export async function getAliases(): Promise<AliasMap> {
  return readAliasFile()
}

export async function getAutomationSettings(): Promise<AutomationMap> {
  return readAutomationFile()
}

export async function ensureLoginItemPreferenceInitialized(): Promise<boolean> {
  const preferences = await readPreferencesFile()

  if (preferences.loginItemPreferenceInitialized) {
    return false
  }

  await writePreferencesFile({
    ...preferences,
    loginItemPreferenceInitialized: true
  })

  return true
}

export async function setAlias(label: string, alias: string): Promise<void> {
  await setAliases({ [label]: alias })
}

export async function removeAlias(label: string): Promise<void> {
  await setAliases({ [label]: null })
}

export async function setAliases(updates: Record<string, string | null>): Promise<void> {
  const aliases = await readAliasFile()

  for (const [label, alias] of Object.entries(updates)) {
    const nextAlias = typeof alias === 'string' ? alias.trim() : ''

    if (nextAlias) {
      aliases[label] = nextAlias
    } else {
      delete aliases[label]
    }
  }

  await writeAliasFile(aliases)
}

export async function setAutomationSettings(
  label: string,
  settings: ServiceAutomationSettings
): Promise<void> {
  const automations = await readAutomationFile()
  const normalized = normalizeAutomationSettings(settings)

  if (
    !normalized.startCondition &&
    normalized.automaticStartTimes.length === 0 &&
    !normalized.startOnLaunch &&
    !normalized.ensureRunning
  ) {
    delete automations[label]
  } else {
    automations[label] = normalized
  }

  await writeAutomationFile(automations)
}
