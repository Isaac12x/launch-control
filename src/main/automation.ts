import type { LaunchdService, StartConditionState } from '../shared/types'

const pollIntervalMs = 15_000

interface ServiceRuntimeSnapshot {
  loaded: boolean
  running: boolean
}

interface PendingDependencyStart {
  afterLabel: string
  waitFor: StartConditionState
  triggerAt: number
}

interface AutomationCoordinatorOptions {
  refreshServices: () => Promise<LaunchdService[]>
  startService: (label: string) => Promise<LaunchdService[]>
  onError?: (error: unknown) => void
}

export interface AutomationCoordinator {
  dispose: () => void
  runNow: () => Promise<void>
}

function getDependencyStateLabel(waitFor: StartConditionState): string {
  return waitFor === 'loaded' ? 'loaded' : 'running'
}

function toSnapshotMap(services: LaunchdService[]): Map<string, ServiceRuntimeSnapshot> {
  return new Map(
    services.map((service) => [
      service.label,
      {
        loaded: service.loaded,
        running: service.running
      }
    ])
  )
}

function doesSnapshotMeetCondition(
  snapshot: ServiceRuntimeSnapshot | undefined,
  waitFor: StartConditionState
): boolean {
  if (!snapshot) {
    return false
  }

  return waitFor === 'loaded' ? snapshot.loaded : snapshot.running
}

function doesServiceMeetCondition(service: LaunchdService, waitFor: StartConditionState): boolean {
  return waitFor === 'loaded' ? service.loaded : service.running
}

export function getServiceStartBlocker(
  service: LaunchdService,
  services: LaunchdService[]
): string | null {
  const startCondition = service.automation.startCondition

  if (!startCondition || startCondition.afterLabel === service.label) {
    return null
  }

  const upstream = services.find((candidate) => candidate.label === startCondition.afterLabel)
  const stateLabel = getDependencyStateLabel(startCondition.waitFor)
  const upstreamName = upstream?.name ?? startCondition.afterLabel

  if (!upstream) {
    return `Blocked by dependency: ${upstreamName} is not available.`
  }

  if (doesServiceMeetCondition(upstream, startCondition.waitFor)) {
    return null
  }

  if (!upstream.enabled) {
    return `Blocked by dependency: ${upstreamName} is disabled.`
  }

  if (upstream.lastExitStatus !== null && upstream.lastExitStatus !== 0 && !upstream.running) {
    return `Blocked by dependency: ${upstreamName} is not ${stateLabel}; last exit ${upstream.lastExitStatus}.`
  }

  return `Blocked by dependency: ${upstreamName} is not ${stateLabel}.`
}

function formatClockToken(value: number): string {
  return value.toString().padStart(2, '0')
}

function getTimeKey(date: Date): string {
  return `${formatClockToken(date.getHours())}:${formatClockToken(date.getMinutes())}`
}

function getMinuteStamp(date: Date): string {
  return [
    date.getFullYear(),
    formatClockToken(date.getMonth() + 1),
    formatClockToken(date.getDate())
  ].join('-') + `T${getTimeKey(date)}`
}

function isStartable(service: LaunchdService): boolean {
  return service.enabled && !service.running
}

export function startAutomationCoordinator(
  options: AutomationCoordinatorOptions
): AutomationCoordinator {
  const appStartedAt = Date.now()
  let disposed = false
  let running = false
  let rerunQueued = false
  let lastSnapshots = new Map<string, ServiceRuntimeSnapshot>()
  const pendingDependencyStarts = new Map<string, PendingDependencyStart>()
  const completedLaunchStarts = new Set<string>()
  const recentTimeTriggers = new Map<string, string>()

  async function startIfNeeded(
    services: LaunchdService[],
    label: string
  ): Promise<{ services: LaunchdService[]; started: boolean }> {
    const service = services.find((candidate) => candidate.label === label)

    if (!service || !isStartable(service)) {
      return { services, started: false }
    }

    if (getServiceStartBlocker(service, services)) {
      return { services, started: false }
    }

    return {
      services: await options.startService(label),
      started: true
    }
  }

  async function runLaunchStarts(
    services: LaunchdService[],
    now: Date
  ): Promise<LaunchdService[]> {
    for (const service of services) {
      if (!service.automation.startOnLaunch || completedLaunchStarts.has(service.label)) {
        continue
      }

      if (service.running) {
        completedLaunchStarts.add(service.label)
        continue
      }

      const triggerAt = appStartedAt + service.automation.launchDelaySeconds * 1000

      if (now.getTime() < triggerAt) {
        continue
      }

      const result = await startIfNeeded(services, service.label)
      services = result.services

      const refreshedService = services.find((candidate) => candidate.label === service.label)

      if (result.started || refreshedService?.running) {
        completedLaunchStarts.add(service.label)
      }
    }

    return services
  }

  async function runScheduledStarts(
    services: LaunchdService[],
    now: Date
  ): Promise<LaunchdService[]> {
    const currentTimeKey = getTimeKey(now)
    const currentMinuteStamp = getMinuteStamp(now)

    for (const service of services) {
      if (!isStartable(service)) {
        continue
      }

      const matchedTime = service.automation.automaticStartTimes.find(
        (time) => time === currentTimeKey
      )

      if (!matchedTime) {
        continue
      }

      const triggerKey = `${service.label}:${matchedTime}`

      if (recentTimeTriggers.get(triggerKey) === currentMinuteStamp) {
        continue
      }

      const result = await startIfNeeded(services, service.label)
      services = result.services

      if (result.started) {
        recentTimeTriggers.set(triggerKey, currentMinuteStamp)
      }
    }

    return services
  }

  async function runDependencyStarts(
    services: LaunchdService[],
    now: Date
  ): Promise<LaunchdService[]> {
    const serviceMap = new Map(services.map((service) => [service.label, service]))

    for (const service of services) {
      const startCondition = service.automation.startCondition

      if (
        !startCondition ||
        startCondition.afterLabel === service.label ||
        !isStartable(service)
      ) {
        pendingDependencyStarts.delete(service.label)
        continue
      }

      const upstream = serviceMap.get(startCondition.afterLabel)

      if (!upstream) {
        pendingDependencyStarts.delete(service.label)
        continue
      }

      const currentlyMet = doesServiceMeetCondition(upstream, startCondition.waitFor)
      const previouslyMet = doesSnapshotMeetCondition(
        lastSnapshots.get(upstream.label),
        startCondition.waitFor
      )
      let pending = pendingDependencyStarts.get(service.label)

      if (!currentlyMet) {
        pendingDependencyStarts.delete(service.label)
        continue
      }

      if (
        !pending ||
        pending.afterLabel !== startCondition.afterLabel ||
        pending.waitFor !== startCondition.waitFor
      ) {
        if (currentlyMet && !previouslyMet) {
          pending = {
            afterLabel: startCondition.afterLabel,
            waitFor: startCondition.waitFor,
            triggerAt: now.getTime() + startCondition.delaySeconds * 1000
          }
          pendingDependencyStarts.set(service.label, pending)
        }
      }

      if (!pending || pending.triggerAt > now.getTime()) {
        continue
      }

      pendingDependencyStarts.delete(service.label)
      services = (await startIfNeeded(services, service.label)).services
    }

    return services
  }

  async function runEnsureRunning(services: LaunchdService[]): Promise<LaunchdService[]> {
    for (const service of services) {
      if (!service.automation.ensureRunning || !isStartable(service)) {
        continue
      }

      services = (await startIfNeeded(services, service.label)).services
    }

    return services
  }

  async function runCycle(): Promise<void> {
    if (disposed) {
      return
    }

    let services = await options.refreshServices()
    const now = new Date()

    services = await runLaunchStarts(services, now)
    services = await runScheduledStarts(services, now)
    services = await runDependencyStarts(services, now)
    services = await runEnsureRunning(services)
    lastSnapshots = toSnapshotMap(services)
  }

  async function runNow(): Promise<void> {
    if (disposed) {
      return
    }

    if (running) {
      rerunQueued = true
      return
    }

    running = true

    try {
      do {
        rerunQueued = false
        await runCycle()
      } while (rerunQueued && !disposed)
    } catch (error) {
      options.onError?.(error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void runNow()
  }, pollIntervalMs)

  return {
    dispose: () => {
      disposed = true
      clearInterval(timer)
      completedLaunchStarts.clear()
      pendingDependencyStarts.clear()
      recentTimeTriggers.clear()
      lastSnapshots.clear()
    },
    runNow
  }
}
