import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { deflateRawSync } from 'zlib'

import {
  MAC_CONTROLS_RESERVE,
  TITLEBAR_HEIGHT,
  canSelfUpdate,
  controlsSide,
  desktopPlatform,
  gradleBinName,
  gradleWrapperName,
  javaBinCandidates,
  usesControlsOverlay,
  type InstallKind
} from '../src/shared/platform'
import { TITLEBAR_UNSCALE, UI_SCALE } from '../src/shared/ui'
import { extractAll, readCentralDirectory } from '../src/main/zip'

import './_studio-env'
import { fakeArtemisApi } from './_studio-env'
import { bridgeCalls, setupInbox } from './_studio-env'
import { h, nodeText, renderProbe, type ProbeNode, type ProbeRoot } from './_react-probe'
import { TitleBar } from '../src/renderer/src/components/titlebar/TitleBar'
import { SetupScreen } from '../src/renderer/src/components/layout/SetupScreen'
import { useAppStore } from '../src/renderer/src/store/appStore'
import type { JdkCandidate, PermissionIssue } from '../src/shared/ipc'
import { getMapping, SUPPORTED_BTA } from '../src/shared/generator/mappings'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

const ALL: NodeJS.Platform[] = ['win32', 'darwin', 'linux']

function theRules(): void {
  console.log('\n[rules] the platform decisions, asked of all three')

  check('win32 is itself', desktopPlatform('win32') === 'win32')
  check('darwin is itself', desktopPlatform('darwin') === 'darwin')
  check('linux is itself', desktopPlatform('linux') === 'linux')
  for (const stray of ['freebsd', 'openbsd', 'sunos', 'aix'] as NodeJS.Platform[]) {
    check(`${stray} is treated as linux`, desktopPlatform(stray) === 'linux')
  }

  check('macOS puts its window controls on the left', controlsSide('darwin') === 'left')
  check('Windows puts them on the right', controlsSide('win32') === 'right')
  check('Linux puts them on the right', controlsSide('linux') === 'right')

  check('macOS does not use the controls overlay', !usesControlsOverlay('darwin'))
  check('Windows uses the controls overlay', usesControlsOverlay('win32'))
  check('Linux uses the controls overlay', usesControlsOverlay('linux'))
  for (const p of ALL) {
    check(
      `${p}: exactly one mechanism draws the controls`,
      usesControlsOverlay(p) === (controlsSide(p) === 'right'),
      `overlay=${usesControlsOverlay(p)} side=${controlsSide(p)}`
    )
  }

  check('gradle is a .bat on Windows', gradleBinName('win32') === 'gradle.bat')
  check('and a plain script elsewhere', gradleBinName('darwin') === 'gradle')
  check('and on Linux too', gradleBinName('linux') === 'gradle')
  check('the wrapper follows the same rule', gradleWrapperName('win32') === 'gradlew.bat')
  check('on macOS', gradleWrapperName('darwin') === 'gradlew')
  check('and on Linux', gradleWrapperName('linux') === 'gradlew')

  const darwinPaths = javaBinCandidates('darwin').map((c) => c.join('/'))
  check(
    'java is looked for under Contents/Home on macOS',
    darwinPaths[0] === 'Contents/Home/bin/java',
    darwinPaths.join(' , ')
  )
  check(
    'and ALSO under a bare bin on macOS, which is where Homebrew and SDKMAN put it',
    darwinPaths.includes('bin/java'),
    darwinPaths.join(' , ')
  )
  check(
    'and under bin, with .exe, on Windows',
    javaBinCandidates('win32').map((c) => c.join('/')).join(',') === 'bin/java.exe',
    javaBinCandidates('win32').map((c) => c.join('/')).join(',')
  )
  check(
    'and under bin, bare, on Linux',
    javaBinCandidates('linux').map((c) => c.join('/')).join(',') === 'bin/java',
    javaBinCandidates('linux').map((c) => c.join('/')).join(',')
  )

  check(
    'and neither Windows nor Linux is given a path it does not have',
    javaBinCandidates('win32').length === 1 && javaBinCandidates('linux').length === 1,
    `${javaBinCandidates('win32').length} and ${javaBinCandidates('linux').length}`
  )

  const kinds: InstallKind[] = ['windows-portable', 'appimage', 'macos-app', 'managed']
  for (const k of kinds) {
    check(
      `${k} ${k === 'managed' ? 'must not' : 'may'} replace itself`,
      canSelfUpdate(k) === (k !== 'managed')
    )
  }

  check('the strip is 40 device independent pixels', TITLEBAR_HEIGHT === 40)
  check(
    'and the unscale really does cancel the window zoom',
    Math.abs(TITLEBAR_HEIGHT * TITLEBAR_UNSCALE * UI_SCALE - TITLEBAR_HEIGHT) < 1e-9,
    `${TITLEBAR_HEIGHT} * ${TITLEBAR_UNSCALE} * ${UI_SCALE}`
  )

  check('the mac reserve clears the traffic lights', MAC_CONTROLS_RESERVE >= 72,
    String(MAC_CONTROLS_RESERVE))
}

function buildZip(
  entries: Array<{ name: string; data?: Buffer; mode?: number; dosMade?: boolean }>
): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const isDir = e.name.endsWith('/')
    const raw = e.data ?? Buffer.alloc(0)
    const deflated = deflateRawSync(raw)

    const useStore = deflated.length >= raw.length
    const body = isDir ? Buffer.alloc(0) : useStore ? raw : deflated
    const method = isDir ? 0 : useStore ? 0 : 8
    const nameBuf = Buffer.from(e.name, 'utf8')

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)

    central.writeUInt16LE(e.dosMade ? 20 : (3 << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    const mode = e.mode ?? (isDir ? 0o755 : 0o644)
    central.writeUInt32LE(e.dosMade ? 0 : (mode << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)

    locals.push(local, body)
    centrals.push(central)
    offset += local.length + body.length
  }

  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

function theExtractor(): void {
  console.log('\n[zip] unpacking without asking the machine for a tool')

  const dir = mkdtempSync(join(tmpdir(), 'artemis-zip-'))
  try {

    const zip = buildZip([
      { name: 'gradle-9.3.1/' },
      { name: 'gradle-9.3.1/bin/' },
      {
        name: 'gradle-9.3.1/bin/gradle',
        data: Buffer.from('#!/bin/sh\nexec java -jar gradle-launcher.jar "$@"\n'),
        mode: 0o755
      },
      { name: 'gradle-9.3.1/bin/gradle.bat', data: Buffer.from('@echo off\r\n'), mode: 0o644 },

      { name: 'gradle-9.3.1/lib/notes.txt', data: Buffer.from('x'.repeat(4096)), mode: 0o644 }
    ])

    extractAll(zip, dir)

    const gradleSh = join(dir, 'gradle-9.3.1', 'bin', 'gradle')
    const gradleBat = join(dir, 'gradle-9.3.1', 'bin', 'gradle.bat')
    const notes = join(dir, 'gradle-9.3.1', 'lib', 'notes.txt')

    check('every file arrives', [gradleSh, gradleBat, notes].every((f) => statSync(f).isFile()))
    check(
      'a STORED entry round trips',
      readFileSync(gradleSh, 'utf8').startsWith('#!/bin/sh'),
      readFileSync(gradleSh, 'utf8').slice(0, 20)
    )
    check(
      'a DEFLATED entry round trips',
      readFileSync(notes, 'utf8') === 'x'.repeat(4096),
      `${readFileSync(notes, 'utf8').length} bytes`
    )
    check(
      'directories are made even where no file needs them yet',
      statSync(join(dir, 'gradle-9.3.1')).isDirectory()
    )

    const carried = readCentralDirectory(zip)
    const launcher = carried.find((e) => e.name.endsWith('bin/gradle'))
    check('the launcher carries a mode at all', !!launcher && launcher.mode !== 0,
      JSON.stringify(launcher))
    check(
      'and it is executable',
      !!launcher && (launcher.mode & 0o111) !== 0,
      launcher ? '0' + launcher.mode.toString(8) : 'missing'
    )
    const bat = carried.find((e) => e.name.endsWith('gradle.bat'))
    check(
      'a plain file is not made executable by accident',
      !!bat && (bat.mode & 0o111) === 0,
      bat ? '0' + bat.mode.toString(8) : 'missing'
    )
    check(
      'a directory entry is recognized as one',
      carried.filter((e) => e.isDirectory).length === 2,
      JSON.stringify(carried.filter((e) => e.isDirectory).map((e) => e.name))
    )

    const dosZip = buildZip([{ name: 'a.txt', data: Buffer.from('hi'), dosMade: true }])
    const dosEntry = readCentralDirectory(dosZip)[0]
    check('a Windows made entry reports no mode', dosEntry.mode === 0,
      '0' + dosEntry.mode.toString(8))

    const evil = buildZip([{ name: '../escaped.txt', data: Buffer.from('nope') }])
    let refused = false
    try {
      extractAll(evil, join(dir, 'sandbox'))
    } catch {
      refused = true
    }
    check('an entry that escapes the destination is refused', refused)

    const evilBackslash = buildZip([{ name: '..\\escaped.txt', data: Buffer.from('nope') }])
    let refusedBack = false
    try {
      extractAll(evilBackslash, join(dir, 'sandbox2'))
    } catch {
      refusedBack = true
    }
    check('and so is the backslash spelling of it', refusedBack)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const RELEASE_ASSETS = [
  'Artemis.exe',
  'Artemis-0.2.0-universal.dmg',
  'Artemis-0.2.0-universal-mac.zip',
  'Artemis-0.2.0-x86_64.AppImage',
  'Artemis-0.2.0-arm64.AppImage',
  'Artemis-0.2.0-x86_64.deb',
  'Artemis-0.2.0-arm64.deb'
]

function pick(kind: InstallKind, arch: string): string | null {
  const find = (re: RegExp): string | undefined => RELEASE_ASSETS.find((a) => re.test(a))
  if (kind === 'windows-portable') return find(/portable.*\.exe$/i) ?? find(/\.exe$/i) ?? null
  if (kind === 'appimage') {
    const wanted = arch === 'arm64' ? /(arm64|aarch64)/i : /(x86_64|x64|amd64)/i
    return (
      RELEASE_ASSETS.find((a) => /\.AppImage$/i.test(a) && wanted.test(a)) ??
      (arch === 'x64' ? find(/\.AppImage$/i) : undefined) ??
      null
    )
  }
  if (kind === 'macos-app') {
    return find(/universal.*mac.*\.zip$/i) ?? find(/mac.*\.zip$/i) ?? find(/\.zip$/i) ?? null
  }
  return null
}

function theUpdater(): void {
  console.log('\n[updater] which asset each build format takes')

  check('the Windows portable takes an exe', pick('windows-portable', 'x64') === 'Artemis.exe')

  check(
    'an x64 AppImage build takes the x86_64 asset',
    pick('appimage', 'x64') === 'Artemis-0.2.0-x86_64.AppImage',
    String(pick('appimage', 'x64'))
  )
  check(
    'an arm64 AppImage build takes the arm64 asset',
    pick('appimage', 'arm64') === 'Artemis-0.2.0-arm64.AppImage',
    String(pick('appimage', 'arm64'))
  )
  check(
    'and never takes the other architecture',
    pick('appimage', 'arm64') !== pick('appimage', 'x64')
  )

  check(
    'a mac bundle takes the zip rather than the dmg',
    pick('macos-app', 'x64') === 'Artemis-0.2.0-universal-mac.zip',
    String(pick('macos-app', 'x64'))
  )
  check('and never the dmg', !String(pick('macos-app', 'x64')).endsWith('.dmg'))

  check('a managed build takes no asset at all', pick('managed', 'x64') === null)

  const only = ['Artemis.exe']
  const findIn = (list: string[], re: RegExp): string | null => list.find((a) => re.test(a)) ?? null
  check(
    'an AppImage build offered a Windows-only release takes nothing',
    findIn(only, /\.AppImage$/i) === null
  )
  check(
    'and a mac build takes nothing from it either',
    findIn(only, /\.zip$/i) === null
  )
}

function theTitleBar(): void {
  console.log('\n[titlebar] the strip, on each platform, with the OS drawing the buttons')

  const gapsOf = (root: ReturnType<typeof renderProbe>): ProbeNode[] =>
    root.findAll((n) => n.props['data-window-controls-gap'] !== undefined)

  for (const platform of ALL) {
    ;(fakeArtemisApi.app as { platform: NodeJS.Platform }).platform = platform
    const bar = renderProbe(h(TitleBar))

    const gaps = gapsOf(bar)
    check(`${platform}: exactly one gap is kept for the controls`, gaps.length === 1,
      `${gaps.length} gaps`)
    check(
      `${platform}: and it is on the side this platform puts them`,
      gaps[0]?.props['data-window-controls-gap'] === controlsSide(platform),
      String(gaps[0]?.props['data-window-controls-gap'])
    )

    const text = bar.text()
    const inWindow = platform !== 'darwin'
    check(
      `${platform}: the File menu is ${inWindow ? 'on the bar' : 'not on the bar'}`,
      text.includes('File') === inWindow,
      text.slice(0, 80)
    )
    check(
      `${platform}: and the settings menu is ${inWindow ? 'too' : 'not either'}`,
      text.includes('Artemis Settings') === inWindow
    )

    const arrows = bar
      .all()
      .filter((n) => ['Back', 'Forward'].includes(String(n.props['aria-label'])))
    check(`${platform}: the history arrows stay wherever the menus went`, arrows.length === 2,
      String(arrows.length))

    const drawn = bar
      .all()
      .filter((n) => ['Minimize', 'Maximize', 'Close'].includes(String(n.props['aria-label'])))
    check(`${platform}: Artemis draws no window buttons of its own`, drawn.length === 0,
      drawn.map((n) => String(n.props['aria-label'])).join(', '))

    check(`${platform}: the gap is hidden from anything reading the screen`,
      gaps[0]?.props['aria-hidden'] === true)
    check(`${platform}: and is not something you can click`, gaps[0]?.props.onClick === undefined)

    const width = String(gaps[0]?.props.style?.width ?? '')
    if (platform === 'darwin') {

      const px = Number(width.replace('px', ''))
      check('macOS reserves a fixed width for the traffic lights', Number.isFinite(px), width)
      check(
        'and it lands on the reserve once the strip is scaled',
        Math.abs(px * TITLEBAR_UNSCALE - MAC_CONTROLS_RESERVE) < 1e-6,
        `${width} scales to ${px * TITLEBAR_UNSCALE}`
      )
    } else {

      check(`${platform} asks the overlay how wide its buttons are`,
        width.includes('titlebar-area-width'), width)
      check(`${platform}: and cancels the strip's scale in the calc`,
        width.includes(String(TITLEBAR_UNSCALE)), width)
    }

    const header = bar.all().find((n) => n.type === 'header')
    check(`${platform}: the strip is still draggable`,
      String(header?.props.className ?? '').includes('drag-region'),
      String(header?.props.className))

    const barPx = Number(header?.props.style?.height ?? 0)
    check(
      `${platform}: the strip covers the whole ${TITLEBAR_HEIGHT} pixel overlay`,
      barPx * UI_SCALE >= TITLEBAR_HEIGHT,
      `${barPx} scales to ${barPx * UI_SCALE}`
    )
    check(
      `${platform}: and stands exactly one hairline past it`,
      barPx === Math.ceil(TITLEBAR_HEIGHT * TITLEBAR_UNSCALE) + 1,
      `${barPx}, wanted ${Math.ceil(TITLEBAR_HEIGHT * TITLEBAR_UNSCALE) + 1}`
    )

    bar.unmount()
  }

  ;(fakeArtemisApi.app as { platform: NodeJS.Platform }).platform = 'win32'

  const bar = renderProbe(h(TitleBar))
  check('the bar still has a place for the open project', bar.all().length > 0)
  check('and nothing in it announces a platform to the modder',
    !/win32|darwin|linux/i.test(nodeText(bar.tree)), nodeText(bar.tree).slice(0, 120))
  bar.unmount()
}

async function settle(root: ProbeRoot): Promise<void> {

  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 8; i++) await Promise.resolve()
    root.flush()
  }
}

function theJavaFloor(): void {
  console.log('\n[java] the floor, which is the JVM gradle runs in')
  for (const v of SUPPORTED_BTA) {
    const g = getMapping(v).gradle
    check(
      `BTA ${v} says which JVM gradle needs, apart from the mod's own`,
      typeof g.minHostJava === 'number' && g.minHostJava >= g.javaVersion,
      `host ${g.minHostJava}, toolchain ${g.javaVersion}`
    )
  }

  const src = readFileSync(join(process.cwd(), 'src/main/jdk.ts'), 'utf-8')
  const floorLine = src.match(/export const MIN_JAVA =([\s\S]*?)\n\n/)?.[1] ?? ''
  check(
    'the floor is derived from the mappings rather than written out',
    floorLine.includes('minHostJava') && !/=\s*\d+/.test(floorLine),
    floorLine.trim().slice(0, 80)
  )
  const url = src.match(/api\.adoptium\.net\/v3\/binary\/latest\/([^/]+)\//)?.[1]
  check(
    'and the JDK it offers to install is that same release',
    url === '${MIN_JAVA}',
    `the url asks for ${url ?? 'nothing this could find'}`
  )

  const advice = readFileSync(join(process.cwd(), 'src/main/gradle.ts'), 'utf-8')
  const line = advice.match(/A JDK \(([^)]*)\) is not/)?.[1] ?? ''
  check(
    'and what it tells somebody to install is that release too',
    line.includes('${MIN_JAVA}') && !/\d/.test(line),
    line === '' ? 'could not find the advice line' : line
  )
}

async function theSetupScreens(): Promise<void> {
  console.log('\n[setup] the first run gates, driven through the bridge')

  const ready = (): void => {
    useAppStore.setState({ bootPhase: 'ready' })
  }

  const issue = (canOpenSettings: boolean): PermissionIssue => ({
    id: 'documents',
    title: 'Artemis cannot save into your Documents folder',
    detail: 'a sentence about it',
    steps: ['first', 'second', 'third'],
    path: '/Users/somebody/Documents/ArtemisForBTA',
    reason: 'EPERM: operation not permitted',
    canOpenSettings
  })

  const jdk = (version: string, major: number, source: string): JdkCandidate => ({
    home: '/opt/jdk-' + version,
    version,
    major,
    source
  })

  {
    ready()
    setupInbox.status = { permissions: [], jdk: jdk('21.0.5', 21, 'PATH'), minJava: 17 }
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    check('a machine with nothing wrong never sees the setup screen', r.all().length === 0,
      r.all().length + ' nodes')
    r.unmount()
  }

  {
    ready()
    setupInbox.status = { permissions: [issue(true)], jdk: null, minJava: 17 }
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    const text = r.text()
    check('a permission problem opens the first gate', text.includes('Documents folder'),
      text.slice(0, 90))
    check('and every step it lists is shown',
      ['first', 'second', 'third'].every((x) => text.includes(x)))
    check('and the errno is there to paste into a help request', text.includes('EPERM'),
      text.slice(0, 120))
    check('and Java is not asked about at the same time', !text.includes('needs Java'),
      text.slice(0, 120))
    check('it offers to open the privacy settings', text.includes('Open privacy settings'))

    const open = r.clickable().find((n) => nodeText(n).includes('Open privacy settings'))
    check('and that offer is a real button', !!open)
    if (open) {
      const before = bridgeCalls.length
      r.click(open)
      const last = bridgeCalls[bridgeCalls.length - 1]
      check('which asks main to open them',
        bridgeCalls.length > before && last.name === 'setup.openSettings', JSON.stringify(last))
    }
    r.unmount()
  }

  {
    ready()
    setupInbox.status = { permissions: [issue(false)], jdk: null, minJava: 17 }
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    check('with no settings pane it offers the folder instead',
      r.text().includes('Show me the folder') && !r.text().includes('Open privacy settings'),
      r.text().slice(0, 120))
    r.unmount()
  }

  {
    ready()
    setupInbox.status = { permissions: [], jdk: null, minJava: 17 }
    setupInbox.scanResult = []
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    const text = r.text()
    check('no Java at all opens the second gate', text.includes('needs Java'), text.slice(0, 90))
    check('and offers to install one', text.includes('Install Java for me'))
    check('and to pick one', text.includes('Choose a folder'))
    check('and to look again', text.includes('Look again'))
    check('and it says which Java is needed', text.includes('17'), text.slice(0, 200))
    r.unmount()
  }

  {
    ready()
    setupInbox.status = { permissions: [], jdk: null, minJava: 17 }
    setupInbox.scanResult = [jdk('21.0.5', 21, 'Homebrew'), jdk('17.0.9', 17, 'SDKMAN')]
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    const text = r.text()
    check('a JDK the scan found is offered', text.includes('Use Java 21.0.5'), text.slice(0, 160))
    check('and so is the second one', text.includes('Use Java 17.0.9'))
    check('and where each came from is shown',
      text.includes('Homebrew') && text.includes('SDKMAN'))
    check('installing becomes the alternative rather than the answer',
      text.includes('Install a fresh one instead') && !text.includes('Install Java for me'),
      text.slice(0, 200))

    const use = r.clickable().find((n) => nodeText(n).includes('Use Java 21.0.5'))
    check('choosing one is a real button', !!use)
    if (use) {
      const before = bridgeCalls.length
      r.click(use)
      await settle(r)
      const call = bridgeCalls.slice(before).find((c) => c.name === 'setup.chooseJdk')
      check('and it tells main which one', !!call, JSON.stringify(bridgeCalls.slice(before)))
      check('by its path rather than by its label',
        String(call && call.args && call.args[0]).includes('jdk-21.0.5'),
        String(call && call.args && call.args[0]))
    }
    r.unmount()
  }

  for (const isDev of [true, false]) {
    ready()
    ;(fakeArtemisApi.app as { isDev: boolean }).isDev = isDev
    setupInbox.status = { permissions: [], jdk: null, minJava: 17 }
    setupInbox.scanResult = []
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    const skip = r.all().find((n) => String(n.props['aria-label'] || '').startsWith('Skip setup'))
    check('the dev skip button is ' + (isDev ? 'there in a dev run' : 'NOT in a shipped build'),
      !!skip === isDev)
    if (isDev && skip) {
      r.click(skip)
      await settle(r)
      check('and it really does dismiss the gate', r.all().length === 0, r.all().length + ' nodes')
    }
    r.unmount()
  }
  ;(fakeArtemisApi.app as { isDev: boolean }).isDev = false

  {
    ready()
    ;(fakeArtemisApi.app as { skipOnboarding: boolean }).skipOnboarding = true
    setupInbox.status = { permissions: [issue(true)], jdk: null, minJava: 17 }
    const r = renderProbe(h(SetupScreen))
    await settle(r)
    check('run-dev-clean skips the gates entirely, even a failing one',
      r.all().length === 0, r.all().length + ' nodes')
    r.unmount()
    ;(fakeArtemisApi.app as { skipOnboarding: boolean }).skipOnboarding = false
  }

  setupInbox.status = { permissions: [], jdk: null, minJava: 17 }
  setupInbox.scanResult = []
}

async function main(): Promise<void> {
  theRules()
  theExtractor()
  theUpdater()
  theTitleBar()
  theJavaFloor()
  await theSetupScreens()

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)

  console.log('\nNot covered here, and only a real machine can:')
  console.log('  - that the mac traffic lights actually land centered in a 40px bar')
  console.log('  - that ditto unpacks a signed .app that then launches')
  console.log('  - that an AppImage swapped under a running process relaunches')
  console.log('  - that Chromium draws the overlay where env(titlebar-area-width) says')
  console.log(audit.failures === 0 ? 'PLATFORM PASS' : 'PLATFORM FAIL')
  process.exit(audit.failures === 0 ? 0 : 1)
}

void main()
