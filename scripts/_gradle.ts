import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_GRADLE_VERSION } from '../src/main/gradle'

export const GRADLE =
  process.env.ARTEMIS_GRADLE ??
  join(
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : join(homedir(), '.config'),
    'Artemis',
    'gradle',
    `gradle-${DEFAULT_GRADLE_VERSION}`,
    'bin',
    process.platform === 'win32' ? 'gradle.bat' : 'gradle'
  )
