import {
  swapExe,
  cleanupLeftovers,
  noteSummary,
  pendingApplyTarget,
  stagingPath,
  APPLY_FLAG,
  DOWNLOAD_PREFIX,
  OLD_SUFFIX,
  RELEASES_URL
} from '../src/main/updater'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs'
import { basename, dirname, join, sep } from 'path'
import { tmpdir } from 'os'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

function installDir(): { dir: string; exe: string } {
  const dir = mkdtempSync(join(tmpdir(), 'artemis-updater-'))
  const exe = join(dir, 'Artemis.exe')
  writeFileSync(exe, 'RUNNING VERSION')
  return { dir, exe }
}

async function main(): Promise<void> {

  console.log('the ordinary update')

  {
    const { dir, exe } = installDir()
    const downloaded = join(dir, 'Artemis-new.exe')
    writeFileSync(downloaded, 'NEW VERSION')

    await swapExe(exe, downloaded)

    check('the exe the user launches is now the new one', read(exe) === 'NEW VERSION', read(exe))
    check('the old one is kept aside, not deleted', read(`${exe}${OLD_SUFFIX}`) === 'RUNNING VERSION')
    check('and the download is no longer sitting beside it', !existsSync(downloaded))
    check(
      'nothing else was left in the folder',
      readdirSync(dir).sort().join(' ') === ['Artemis.exe', `Artemis.exe${OLD_SUFFIX}`].sort().join(' '),
      readdirSync(dir).join(' ')
    )
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\na second update, with last time\'s leftover still there')

  {

    const { dir, exe } = installDir()
    writeFileSync(`${exe}${OLD_SUFFIX}`, 'VERSION FROM TWO UPDATES AGO')
    const downloaded = join(dir, 'Artemis-new.exe')
    writeFileSync(downloaded, 'NEW VERSION')

    let threw: unknown = null
    try {
      await swapExe(exe, downloaded)
    } catch (e) {
      threw = e
    }
    check('a stale backup does not block the update', threw === null, String(threw))
    check('the new version is in place', read(exe) === 'NEW VERSION')
    check(
      'and the backup is the version that was just running, not the older one',
      read(`${exe}${OLD_SUFFIX}`) === 'RUNNING VERSION',
      read(`${exe}${OLD_SUFFIX}`)
    )

    const second = installDir()
    mkdirSync(`${second.exe}${OLD_SUFFIX}`)
    writeFileSync(join(`${second.exe}${OLD_SUFFIX}`, 'junk.txt'), 'not an exe')
    const secondDownload = join(second.dir, 'Artemis-new.exe')
    writeFileSync(secondDownload, 'NEW VERSION')
    let blocked: unknown = null
    try {
      await swapExe(second.exe, secondDownload)
    } catch (e) {
      blocked = e
    }
    check('a folder squatting on the backup name does not stop an update', blocked === null, String(blocked))
    check('and the new version still lands', read(second.exe) === 'NEW VERSION')
    rmSync(second.dir, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nthe failure that would cost someone their install')

  {

    const { dir, exe } = installDir()
    const downloaded = join(dir, 'Artemis-new.exe')

    let threw: unknown = null
    try {
      await swapExe(exe, downloaded)
    } catch (e) {
      threw = e
    }
    check('the failure is reported rather than swallowed', threw !== null)
    check('the working exe is back under its own name', read(exe) === 'RUNNING VERSION', read(exe))
    check(
      'and nothing is left stranded under the backup name',
      !existsSync(`${exe}${OLD_SUFFIX}`),
      readdirSync(dir).join(' ')
    )
    check('so the folder is exactly as it started', readdirSync(dir).join(' ') === 'Artemis.exe')
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nthe sweep on the next launch')

  {
    const { dir, exe } = installDir()
    writeFileSync(`${exe}${OLD_SUFFIX}`, 'previous version')
    writeFileSync(join(dir, `Artemis-0.1.0.exe${OLD_SUFFIX}`), 'the one before that')

    mkdirSync(join(dir, `Artemis-0.0.9.exe${OLD_SUFFIX}`))
    writeFileSync(join(dir, `Artemis-0.0.9.exe${OLD_SUFFIX}`, 'inside.txt'), 'x')

    writeFileSync(join(dir, `${DOWNLOAD_PREFIX}0.1.8.exe`), 'an update that never landed')
    writeFileSync(join(dir, `${DOWNLOAD_PREFIX}0.1.10.exe`), 'nor did this one')

    writeFileSync(join(dir, 'projects.artemis'), 'a project someone saved next to the exe')
    writeFileSync(join(dir, 'Artemis.exe.config'), 'settings')
    mkdirSync(join(dir, 'workspaces'))

    await cleanupLeftovers(dir)

    check('every leftover exe is gone', readdirSync(dir).every((f) => !f.endsWith(OLD_SUFFIX)), readdirSync(dir).join(' '))
    check(
      'and so is every download that never landed',
      readdirSync(dir).every((f) => !f.startsWith(DOWNLOAD_PREFIX)),
      readdirSync(dir).join(' ')
    )
    check('the running exe is untouched', read(exe) === 'RUNNING VERSION')
    check('a saved project is untouched', existsSync(join(dir, 'projects.artemis')))
    check('and so is anything else in the folder', existsSync(join(dir, 'Artemis.exe.config')) && existsSync(join(dir, 'workspaces')))

    let threw: unknown = null
    try {
      await cleanupLeftovers(dir)
      await cleanupLeftovers(join(dir, 'no-such-folder'))
    } catch (e) {
      threw = e
    }
    check('running it again, or on a folder that is not there, is quiet', threw === null, String(threw))
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nthe one line the bar shows, and the link under the presence')

  {

    const heading = noteSummary('# Artemis 1.2.3\n\nIt stops eating your mod.')
    check('a heading above the first sentence is stepped over',
      heading === 'It stops eating your mod.', heading)

    const badge = noteSummary('![build](https://x/y.svg)\n\nReal words.')
    check('and so is a badge image', badge === 'Real words.', badge)

    const inline = noteSummary('**Fixed** the [launcher](https://x).')
    check('bold and links come through as their text',
      inline === 'Fixed the launcher.', inline)

    check('a release with no notes says nothing', noteSummary('') === '')
    check('and neither does one that is only structure',
      noteSummary('# Title\n\n---') === '')

    const long = noteSummary('word '.repeat(80))
    check('a long first line is cut short', long.length <= 201, String(long.length))
    check('and cut between words rather than through one',
      long.endsWith('word\u2026'), long.slice(-30))

    const unbroken = noteSummary('a'.repeat(40) + ' ' + 'b'.repeat(400))
    check('and cut hard when there is no boundary to cut on',
      unbroken.length <= 201 && unbroken.endsWith('\u2026'), String(unbroken.length))

    const presence = readFileSync('src/main/discordPresence.ts', 'utf-8')
    check('the presence offers a way to get Artemis',
      presence.includes("label: 'Get Artemis'"))
    check('and points it at the releases, not at a second spelling of the repo',
      presence.includes('RELEASES_URL'), 'the URL belongs in one place')
    check('the label fits what Discord allows', 'Get Artemis'.length <= 32)
    check('and the releases URL is a real https one',
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases$/.test(RELEASES_URL),
      RELEASES_URL)
  }

  console.log()
  console.log('the Windows install, which had never once worked')

  {
    const updaterSrc = readFileSync('src/main/updater.ts', 'utf-8')
    const from = updaterSrc.indexOf('async function swapAndRelaunch')
    const to = updaterSrc.indexOf('export const APPLY_FLAG')
    check('the code this reads is still shaped the way it thinks', from >= 0 && to > from)
    const swapping = updaterSrc.slice(from, to)

    const renames = (swapping.match(/await swapExe\(/g) ?? []).length
    check('only the platforms that can rename a running file still do', renames === 2, String(renames))
    check(
      'Windows hands the download the path to replace instead',
      swapping.includes('[APPLY_FLAG, current]')
    )

    const code = updaterSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    check(
      'and no shell is asked to do it',
      !/powershell|cmd\.exe|EncodedCommand/i.test(code),
      'the install must be code from this repository'
    )

    const somebodysExe = join('C:', 'Users', 'someone', 'Artemis.exe')
    check(
      'a launch carrying the flag knows what to replace',
      pendingApplyTarget(['artemis', APPLY_FLAG, somebodysExe]) === somebodysExe
    )
    check(
      'an ordinary launch is not mistaken for one',
      pendingApplyTarget(['artemis', join('C:', 'mods', 'thing.artemis')]) === null
    )
    check('nor is the flag with nothing after it', pendingApplyTarget(['artemis', APPLY_FLAG]) === null)

    const staged = stagingPath('windows-portable', somebodysExe, '1.2.3')
    check(
      'a Windows download does not wait beside the exe',
      dirname(staged) !== dirname(somebodysExe),
      staged
    )
    check('and is not hidden behind a dot', !basename(staged).startsWith('.'), basename(staged))

    const appTarget = '/Applications/Artemis.app'

    const inSameDir = (a: string, b: string): boolean =>
      dirname(a).split(sep).join('/') === dirname(b).split(sep).join('/')
    for (const kind of ['macos-app', 'appimage'] as const) {
      const beside = stagingPath(kind, appTarget, '1.2.3')
      check(
        `a ${kind} download still waits beside its target, because its install is a rename`,
        inSameDir(beside, appTarget),
        beside
      )
    }
  }

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('UPDATER FAIL')
    process.exit(1)
  }
  console.log('UPDATER PASS')
}

void main()
