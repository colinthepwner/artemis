export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

export function desktopPlatform(platform: NodeJS.Platform): DesktopPlatform {
  if (platform === 'win32') return 'win32'
  if (platform === 'darwin') return 'darwin'
  return 'linux'
}

export const TITLEBAR_HEIGHT = 40

export function controlsSide(platform: NodeJS.Platform): 'left' | 'right' {
  return desktopPlatform(platform) === 'darwin' ? 'left' : 'right'
}

export const MAC_CONTROLS_RESERVE = 78

export const MAC_TRAFFIC_LIGHT_POSITION = {
  x: 20,
  y: Math.round((TITLEBAR_HEIGHT - 16) / 2)
}

export function usesControlsOverlay(platform: NodeJS.Platform): boolean {
  return desktopPlatform(platform) !== 'darwin'
}

export function exeName(base: string, platform: NodeJS.Platform): string {
  return desktopPlatform(platform) === 'win32' ? `${base}.exe` : base
}

export function gradleBinName(platform: NodeJS.Platform): string {
  return desktopPlatform(platform) === 'win32' ? 'gradle.bat' : 'gradle'
}

export function gradleWrapperName(platform: NodeJS.Platform): string {
  return desktopPlatform(platform) === 'win32' ? 'gradlew.bat' : 'gradlew'
}

export function javaBinSegments(platform: NodeJS.Platform): string[] {
  const p = desktopPlatform(platform)
  if (p === 'darwin') return ['Contents', 'Home', 'bin', 'java']
  return ['bin', exeName('java', platform)]
}

export function adoptiumTarget(
  platform: NodeJS.Platform,
  arch: string
): { os: string; arch: string; archiveExt: string } {
  const p = desktopPlatform(platform)
  const os = p === 'win32' ? 'windows' : p === 'darwin' ? 'mac' : 'linux'
  const a = arch === 'arm64' ? 'aarch64' : arch === 'ia32' ? 'x86' : arch

  return { os, arch: a, archiveExt: p === 'win32' ? 'zip' : 'tar.gz' }
}

export type InstallKind =

  | 'windows-portable'

  | 'appimage'

  | 'macos-app'

  | 'managed'

export function canSelfUpdate(kind: InstallKind): boolean {
  return kind !== 'managed'
}
