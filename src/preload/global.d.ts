import type { LaunchdApi } from '../shared/types'

declare global {
  interface Window {
    launchdControl: LaunchdApi
  }
}

export {}
