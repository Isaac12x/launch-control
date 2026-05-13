import type { LaunchdService } from '@shared/types'

export type TreeServiceFeedback = {
  tone: 'neutral' | 'progress' | 'success' | 'error'
  message: string
} | null

export type TreeServiceStatusClass = LaunchdService['status'] | 'progress'

export interface TreeServiceDisplayState {
  statusClass: TreeServiceStatusClass
  label: string
}

export interface LiveRuntimeMergeResult {
  services: LaunchdService[]
  changed: boolean
}

const liveRuntimeKeys = [
  'enabled',
  'loaded',
  'running',
  'completed',
  'pid',
  'lastExitStatus',
  'status'
] as const

type LiveRuntimeKey = (typeof liveRuntimeKeys)[number]

function hasRuntimeChange(current: LaunchdService, refreshed: LaunchdService): boolean {
  return liveRuntimeKeys.some((key) => current[key] !== refreshed[key])
}

function mergeLiveRuntimeService(
  current: LaunchdService,
  refreshed: LaunchdService
): LaunchdService {
  const runtimePatch = Object.fromEntries(
    liveRuntimeKeys.map((key) => [key, refreshed[key]])
  ) as Pick<LaunchdService, LiveRuntimeKey>

  return {
    ...current,
    ...runtimePatch
  }
}

export function mergeLiveRuntimeServices(
  currentServices: LaunchdService[],
  refreshedServices: LaunchdService[]
): LiveRuntimeMergeResult {
  const refreshedByLabel = new Map(
    refreshedServices.map((service) => [service.label, service])
  )
  let changed = false
  const services = currentServices.map((currentService) => {
    const refreshedService = refreshedByLabel.get(currentService.label)

    if (!refreshedService || !hasRuntimeChange(currentService, refreshedService)) {
      return currentService
    }

    changed = true
    return mergeLiveRuntimeService(currentService, refreshedService)
  })

  return {
    services: changed ? services : currentServices,
    changed
  }
}

export function getTreeServiceDisplayState(
  service: LaunchdService,
  feedback: TreeServiceFeedback
): TreeServiceDisplayState {
  if (feedback?.tone === 'progress') {
    return {
      statusClass: 'progress',
      label: feedback.message
    }
  }

  return {
    statusClass: service.status,
    label: service.status
  }
}
