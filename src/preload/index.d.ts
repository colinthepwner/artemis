import type { ArtemisApi } from '../shared/ipc'

declare global {
  interface Window {
    artemis: ArtemisApi
  }
}

export {}
