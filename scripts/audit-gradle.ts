import {
  resolveGradleLauncher,
  runGradle,
  killGradle,
  extractZip,
  powershellPath,
  DEFAULT_GRADLE_VERSION
} from '../src/main/gradle'

import { download } from '../src/main/net'
import { killClientProcesses } from '../src/main/test/runner'
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from 'fs'
import { spawn, spawnSync } from 'child_process'
import { createServer, type Server } from 'https'
import { createHash } from 'crypto'
import { globalAgent } from 'https'
import { join } from 'path'
import { tmpdir } from 'os'
import { tempDir as makeTempDir, sweepTempDirs } from './_temp'

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) passes++
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

const isWin = process.platform === 'win32'
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function tempDir(label: string): string {
  return makeTempDir(`artemis-gradle-${label}-`)
}

function fakeTool(dir: string, base: string, body: string): string {
  const path = join(dir, isWin ? `${base}.bat` : base)
  if (isWin) writeFileSync(path, `@echo off\r\n${body}\r\n`)
  else writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return path
}

const ECHO_ARGV = isWin ? 'echo ARGV:%*\r\necho CWD:%CD%' : 'echo "ARGV:$*"\necho "CWD:$PWD"'

function collector(): { lines: string[]; onLine: (l: string) => void } {
  const lines: string[] = []
  return { lines, onLine: (l: string): number => lines.push(l) }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function opensslPath(): string | null {
  const candidates = [
    'openssl',
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files/Git/mingw64/bin/openssl.exe'
  ]
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['version'], { stdio: 'ignore' }).status === 0) return candidate
  }
  return null
}

async function theDownload(): Promise<void> {
  console.log('\ngradle download (a redirect, the progress, and the bytes)')
  const ssl = opensslPath()
  if (!ssl) {
    check(
      'openssl is available to mint a certificate for the local server',
      false,
      'no openssl on PATH or in the usual Git locations, so the download branch did not run'
    )
    return
  }

  const dir = tempDir('download')
  const keyFile = join(dir, 'key.pem')
  const certFile = join(dir, 'cert.pem')
  const made = spawnSync(
    ssl,
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyFile, '-out', certFile, '-days', '1',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost'
    ],
    { encoding: 'utf8' }
  )
  check('a throwaway certificate is minted for the run', existsSync(certFile), String(made.stderr).slice(0, 200))
  if (!existsSync(certFile)) return

  const payload = Buffer.alloc(300 * 1024)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251
  const payloadHash = createHash('sha256').update(payload).digest('hex')

  let hops = 0
  const server: Server = createServer(
    { key: readFileSync(keyFile), cert: readFileSync(certFile) },
    (req, res) => {
      const port = (server.address() as { port: number }).port
      const url = req.url ?? '/'
      if (url === '/start') {

        hops++
        res.writeHead(302, { location: `https://localhost:${port}/second` })
        res.end()
        return
      }
      if (url === '/second') {
        hops++
        res.writeHead(301, { location: `https://localhost:${port}/file` })
        res.end()
        return
      }
      if (url === '/missing') {
        res.writeHead(404)
        res.end('nope')
        return
      }
      if (url.startsWith('/loop')) {

        res.writeHead(302, { location: `https://localhost:${port}/loop${url.length}` })
        res.end()
        return
      }
      res.writeHead(200, { 'content-length': String(payload.length) })
      res.end(payload)
    }
  )

  const previousCa = globalAgent.options.ca
  globalAgent.options.ca = [readFileSync(certFile)]
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port

  try {
    const dest = join(dir, 'dist.zip')
    const pcts: number[] = []

    let fetchError: string | null = null
    await download(`https://localhost:${port}/start`, dest, (pct) => pcts.push(pct)).catch(
      (e: Error) => (fetchError = e.message)
    )
    check('the download of a redirected file succeeds', fetchError === null, String(fetchError))

    check('a redirect chain is followed to the end', hops === 2, `${hops} hops taken`)
    check('the file lands on disk', existsSync(dest))
    const got = existsSync(dest) ? readFileSync(dest) : Buffer.alloc(0)
    check(
      'and it is the bytes that were served, all of them',
      createHash('sha256').update(got).digest('hex') === payloadHash,
      `${got.length} bytes of ${payload.length}`
    )
    check('progress is reported', pcts.length > 0, JSON.stringify(pcts))
    check(
      'progress only ever moves forward',
      pcts.every((v, i) => i === 0 || v >= pcts[i - 1]),
      JSON.stringify(pcts)
    )
    check(
      'progress stays inside 0 to 100',
      pcts.every((v) => v >= 0 && v <= 100),
      JSON.stringify(pcts)
    )
    check(
      'progress is not reported for every chunk, only in steps',
      pcts.length <= 11,
      `${pcts.length} readings: ${JSON.stringify(pcts)}`
    )
    check('progress reaches the end', pcts[pcts.length - 1] >= 90, JSON.stringify(pcts))

    let httpError: string | null = null
    await download(`https://localhost:${port}/missing`, join(dir, 'missing.zip'), () => {}).catch(
      (e: Error) => (httpError = e.message)
    )
    check(
      'an HTTP error is reported as one, with its status',
      httpError !== null && /404/.test(String(httpError)),
      String(httpError)
    )

    let loopError: string | null = null
    await download(`https://localhost:${port}/loop`, join(dir, 'loop.zip'), () => {}).catch(
      (e: Error) => (loopError = e.message)
    )
    check(
      'a redirect that never lands is given up on rather than followed forever',
      loopError !== null && /redirect/i.test(String(loopError)),
      String(loopError)
    )

    const source = readFileSync(join(process.cwd(), 'src/main/gradle.ts'), 'utf-8')
    check(
      'the distribution URL is the documented one, built from the pinned version',
      source.includes('https://services.gradle.org/distributions/gradle-') &&
        source.includes('-bin.zip'),
      'ensureBundledGradle no longer builds the URL this harness knows how to read'
    )
    check(
      'and the pinned version is a real version number',
      /^\d+\.\d+(\.\d+)?$/.test(DEFAULT_GRADLE_VERSION),
      DEFAULT_GRADLE_VERSION
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    globalAgent.options.ca = previousCa
  }
}

async function main(): Promise<void> {
  const originalPath = process.env.PATH
  const originalUserData = process.env.ARTEMIS_TEST_USERDATA

  const winRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const barePath = isWin ? `${winRoot}\\System32;${winRoot}` : '/usr/bin:/bin'
  const sep = isWin ? ';' : ':'

  const nodeDir = join(process.execPath, '..')

  console.log('which launcher wins')

  {

    const proj = tempDir('wrapper')
    const onPath = tempDir('onpath')
    fakeTool(proj, 'gradlew', ECHO_ARGV)
    fakeTool(onPath, 'gradle', ECHO_ARGV)
    process.env.PATH = `${onPath}${sep}${barePath}`

    const { lines, onLine } = collector()
    const l = await resolveGradleLauncher(proj, DEFAULT_GRADLE_VERSION, onLine)
    check('a project wrapper wins over gradle on PATH', l.label === 'gradle wrapper', l.label)

    check(
      'and the wrapper is named by full path, not by bare name',
      l.cmd === join(proj, isWin ? 'gradlew.bat' : 'gradlew'),
      l.cmd
    )
    check('choosing a launcher says nothing to the log', lines.length === 0, lines.join(' | '))
  }

  {

    const proj = tempDir('nowrapper')
    const onPath = tempDir('onpath2')
    fakeTool(onPath, 'gradle', ECHO_ARGV)
    process.env.PATH = `${onPath}${sep}${barePath}`

    const l = await resolveGradleLauncher(proj, DEFAULT_GRADLE_VERSION, () => {})
    check('with no wrapper, gradle on PATH is used', l.label === 'system gradle', l.label)
    check('and it is left for the shell to resolve', l.cmd === 'gradle', l.cmd)
  }

  {

    const proj = tempDir('bundled')
    const userData = tempDir('userdata')
    const binDir = join(userData, 'gradle', `gradle-${DEFAULT_GRADLE_VERSION}`, 'bin')
    mkdirSync(binDir, { recursive: true })
    fakeTool(binDir, 'gradle', ECHO_ARGV)
    process.env.ARTEMIS_TEST_USERDATA = userData
    process.env.PATH = barePath

    const { lines, onLine } = collector()
    const l = await resolveGradleLauncher(proj, DEFAULT_GRADLE_VERSION, onLine)
    check(
      'with nothing installed, the bundled distribution is used',
      l.label === `bundled gradle ${DEFAULT_GRADLE_VERSION}`,
      l.label
    )
    check('and it is named by absolute path, not by hoping PATH has it', l.cmd.startsWith(userData), l.cmd)
    check('an already-unpacked distribution downloads nothing', !lines.some((x) => /download/i.test(x)), lines.join(' | '))
    check(
      'and nothing was written next to it',
      !existsSync(join(userData, 'gradle', `gradle-${DEFAULT_GRADLE_VERSION}.zip`))
    )
  }

  {

    const proj = tempDir('version')
    const userData = tempDir('userdata2')
    const other = '8.7'
    const binDir = join(userData, 'gradle', `gradle-${other}`, 'bin')
    mkdirSync(binDir, { recursive: true })
    fakeTool(binDir, 'gradle', ECHO_ARGV)
    process.env.ARTEMIS_TEST_USERDATA = userData
    process.env.PATH = barePath

    const l = await resolveGradleLauncher(proj, other, () => {})
    check('the requested version is the one resolved', l.label === `bundled gradle ${other}`, l.label)
    check(
      'and the path names that version, not the default',
      l.cmd.includes(`gradle-${other}`) && !l.cmd.includes(DEFAULT_GRADLE_VERSION),
      l.cmd
    )
  }

  console.log('the launcher is actually reached, with what it was given')

  {
    const proj = tempDir('run-wrapper')
    fakeTool(proj, 'gradlew', ECHO_ARGV)
    process.env.PATH = barePath

    const noCwdLookup = process.env.NoDefaultCurrentDirectoryInExePath
    process.env.NoDefaultCurrentDirectoryInExePath = '1'

    const { lines, onLine } = collector()
    const run = await runGradle(proj, 'build', onLine, DEFAULT_GRADLE_VERSION)
    const r = await run.done
    const argv = lines.find((l) => l.startsWith('ARGV:')) ?? ''
    const cwd = lines.find((l) => l.startsWith('CWD:')) ?? ''

    check('the wrapper ran', argv !== '', lines.join(' | '))
    check('the task reached it', argv.includes('build'), argv)
    check('and so did --console=plain, which keeps ANSI bars out of the log', argv.includes('--console=plain'), argv)
    check('the arguments are in the order the tool expects', /build\s+--console=plain/.test(argv), argv)
    check('it ran in the project directory', cwd.toLowerCase().includes(proj.toLowerCase()), `${cwd} vs ${proj}`)
    check('a clean exit is reported as 0', r.code === 0, JSON.stringify(r))
    check(
      'and none of that depended on the shell searching the current directory',
      !lines.some((l) => /is not recognized|not found/i.test(l)),
      lines.join(' | ')
    )

    if (noCwdLookup === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath
    else process.env.NoDefaultCurrentDirectoryInExePath = noCwdLookup
  }

  {

    const proj = tempDir('run-bundled')
    const userData = join(tempDir('userdata3'), 'a folder with spaces')
    const binDir = join(userData, 'gradle', `gradle-${DEFAULT_GRADLE_VERSION}`, 'bin')
    mkdirSync(binDir, { recursive: true })
    fakeTool(binDir, 'gradle', ECHO_ARGV)
    process.env.ARTEMIS_TEST_USERDATA = userData
    process.env.PATH = barePath

    const { lines, onLine } = collector()
    const run = await runGradle(proj, 'runClient --stacktrace', onLine, DEFAULT_GRADLE_VERSION)
    const r = await run.done
    const argv = lines.find((l) => l.startsWith('ARGV:')) ?? ''

    check('a bundled launcher under a path with spaces still runs', argv !== '', lines.join(' | '))
    check('with every argument intact', /runClient\s+--stacktrace\s+--console=plain/.test(argv), argv)
    check('and exits cleanly', r.code === 0, JSON.stringify(r))
    check(
      'the launcher it reports is the one it ran',
      run.launcher.label === `bundled gradle ${DEFAULT_GRADLE_VERSION}`,
      run.launcher.label
    )
  }

  {

    const proj = tempDir('run-fail')
    fakeTool(proj, 'gradlew', isWin ? 'echo BUILD FAILED\r\nexit /b 7' : 'echo BUILD FAILED\nexit 7')
    process.env.PATH = barePath

    const { lines, onLine } = collector()
    const run = await runGradle(proj, 'build', onLine, DEFAULT_GRADLE_VERSION)
    const r = await run.done
    check('a failing build reports its exit code', r.code === 7, JSON.stringify(r))
    check(
      'and its output was still streamed',
      lines.some((l) => l.includes('BUILD FAILED')),
      lines.join(' | ')
    )
  }

  console.log('the log the modder reads')

  {

    const proj = tempDir('log-crlf')
    fakeTool(proj, 'gradlew', isWin ? 'echo one\r\necho.\r\necho two' : 'printf "one\\r\\n\\r\\ntwo\\r\\n"')
    process.env.PATH = barePath

    const { lines, onLine } = collector()
    await (await runGradle(proj, 'build', onLine, DEFAULT_GRADLE_VERSION)).done
    check('no carriage returns survive into the log', !lines.some((l) => l.includes('\r')), JSON.stringify(lines))
    check('blank lines are dropped rather than padding the log', !lines.some((l) => l.length === 0), JSON.stringify(lines))
    check('the real lines are all there and in order', lines.join('|') === 'one|two', JSON.stringify(lines))
  }

  {

    const proj = tempDir('log-split')
    const helper = join(proj, 'halves.js')
    writeFileSync(
      helper,
      [

        "process.stdout.write('Started up ')",
        "setTimeout(() => { process.stdout.write('in 4.512s\\n') }, 150)"
      ].join('\n')
    )
    fakeTool(proj, 'gradlew', `node "${helper}"`)
    process.env.PATH = `${nodeDir}${sep}${barePath}`

    const { lines, onLine } = collector()
    await (await runGradle(proj, 'build', onLine, DEFAULT_GRADLE_VERSION)).done
    check('a line split across two reads arrives as one line', lines.includes('Started up in 4.512s'), JSON.stringify(lines))
    check('and not as two half lines', !lines.includes('Started up '), JSON.stringify(lines))
  }

  {

    const proj = tempDir('log-tail')
    const helper = join(proj, 'tail.js')
    writeFileSync(helper, "process.stdout.write('FAILURE: Build failed with an exception.')")
    fakeTool(proj, 'gradlew', `node "${helper}"`)
    process.env.PATH = `${nodeDir}${sep}${barePath}`

    const { lines, onLine } = collector()
    await (await runGradle(proj, 'build', onLine, DEFAULT_GRADLE_VERSION)).done
    check(
      'a final line with no newline is not swallowed',
      lines.includes('FAILURE: Build failed with an exception.'),
      JSON.stringify(lines)
    )
  }

  console.log('stopping a run')

  {

    const proj = tempDir('kill')
    const pidFile = join(proj, 'grandchild.pid')
    const helper = join(proj, 'longrunning.js')
    writeFileSync(
      helper,
      [
        `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
        'setInterval(() => {}, 1000)'
      ].join('\n')
    )
    fakeTool(proj, 'gradlew', `node "${helper}"`)
    process.env.PATH = `${nodeDir}${sep}${barePath}`

    const run = await runGradle(proj, 'runClient', () => {}, DEFAULT_GRADLE_VERSION)
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await sleep(50)
    const grandchild = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf-8')) : 0
    check('the run started a grandchild of its own', grandchild > 0 && alive(grandchild), String(grandchild))

    killGradle(run.child)
    const r = await run.done
    for (let i = 0; i < 100 && alive(grandchild); i++) await sleep(50)

    check('and the grandchild the kill was written for is gone too', !alive(grandchild), `pid ${grandchild} survived`)
    check('done settles after a kill instead of hanging', r !== undefined)
  }

  {

    const proj = tempDir('kill-twice')
    fakeTool(proj, 'gradlew', isWin ? 'exit /b 0' : 'exit 0')
    process.env.PATH = barePath
    const run = await runGradle(proj, 'build', () => {}, DEFAULT_GRADLE_VERSION)
    await run.done
    let threw = false
    try {
      killGradle(run.child)
      killGradle(run.child)
    } catch {
      threw = true
    }
    check('killing an already-finished run is harmless', !threw)
  }

  console.log('unpacking the gradle nobody installed')

  if (isWin) {

    const src = tempDir('zip-src')
    writeFileSync(join(src, 'marker.txt'), 'unpacked')
    const zipHome = tempDir('zip-home')
    const zip = join(zipHome, 'gradle-9.3.1.zip')

    const made = spawnSync(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -Path $env:A -DestinationPath $env:B -Force'],
      { env: { ...process.env, A: join(src, '*'), B: zip } }
    )
    check('the harness could build a zip to unpack', made.status === 0 && existsSync(zip), String(made.status))

    {
      const dest = tempDir('zip-plain')
      let failed: string | null = null
      await extractZip(zip, dest).catch((e: Error) => (failed = e.message))
      check('an ordinary path unpacks', failed === null && existsSync(join(dest, 'marker.txt')), String(failed))
    }

    {

      const dest = join(tempDir('zip-quoted'), "O'Brien", 'gradle')
      mkdirSync(dest, { recursive: true })
      let failed: string | null = null
      await extractZip(zip, dest).catch((e: Error) => (failed = e.message))
      check(
        'and so does one holding an apostrophe, which used to end the script early',
        failed === null && existsSync(join(dest, 'marker.txt')),
        String(failed)
      )
    }

    {

      const home = join(tempDir('zip-quoted-src'), "O'Brien")
      mkdirSync(home, { recursive: true })
      const quotedZip = join(home, 'gradle-9.3.1.zip')
      copyFileSync(zip, quotedZip)
      const dest = tempDir('zip-quoted-dest')
      let failed: string | null = null
      await extractZip(quotedZip, dest).catch((e: Error) => (failed = e.message))
      check('and the zip itself may sit under one too', failed === null && existsSync(join(dest, 'marker.txt')), String(failed))
    }

    {

      const bad = join(tempDir('zip-bad'), 'gradle-9.3.1.zip')
      writeFileSync(bad, 'this is not a zip file')
      const dest = tempDir('zip-bad-dest')
      let failed: string | null = null
      await extractZip(bad, dest).catch((e: Error) => (failed = e.message))
      check('a corrupt download is reported, not shrugged off', failed !== null, 'extraction of a non-zip resolved')
    }
  } else {
    console.log('  skipped: the PowerShell extractor is the Windows branch, and this is not Windows')
  }

  console.log('killing the client the gradle daemon forked')

  if (isWin) {

    const bin = tempDir('fakejava')
    const javaExe = join(bin, 'java.exe')
    copyFileSync(process.execPath, javaExe)

    const mine = tempDir('ws-mine')
    const theirs = tempDir('ws-theirs')

    const startVictim = (exe: string, where: string, tag: string): { pid: number; child: ReturnType<typeof spawn> } => {
      const script = join(where, `${tag}.js`)
      const pidFile = join(where, `${tag}.pid`)
      writeFileSync(
        script,
        [`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`, 'setInterval(() => {}, 1000)'].join('\n')
      )
      const child = spawn(exe, [script], { stdio: 'ignore' })
      return { pid: child.pid ?? 0, child }
    }

    const target = startVictim(javaExe, mine, 'client')
    const bystander = startVictim(javaExe, theirs, 'someone-elses-game')

    const notJava = startVictim(process.execPath, mine, 'not-a-client')

    for (let i = 0; i < 100; i++) {
      if (existsSync(join(mine, 'client.pid')) && existsSync(join(theirs, 'someone-elses-game.pid')) && existsSync(join(mine, 'not-a-client.pid'))) break
      await sleep(50)
    }
    check('the stand-in client is running', alive(target.pid), String(target.pid))
    check('so is one belonging to another workspace', alive(bystander.pid), String(bystander.pid))

    const sweep = killClientProcesses(mine)
    await new Promise<void>((resolve) => sweep.on('exit', () => resolve()))
    for (let i = 0; i < 100 && alive(target.pid); i++) await sleep(50)

    check('the client launched from this workspace is killed', !alive(target.pid), `pid ${target.pid} survived`)
    check(
      'a client from another workspace is left alone',
      alive(bystander.pid),
      `pid ${bystander.pid} was killed and should not have been`
    )
    check(
      'and something that is not the game is left alone even in the same workspace',
      alive(notJava.pid),
      `pid ${notJava.pid} was killed and should not have been`
    )

    check(
      'and none of that needed PATH, which on this run cannot resolve powershell',
      !alive(target.pid) && !existsSync(join(winRoot, 'System32', 'powershell.exe')),
      'either the sweep missed, or System32 holds a powershell.exe and this case proves less than it claims'
    )

    for (const p of [bystander, notJava, target]) {
      try {
        p.child.kill()
      } catch {

      }
    }

    {
      const realSystemRoot = process.env.SystemRoot
      delete process.env.SystemRoot
      const lines: string[] = []
      let crashed: unknown = null
      const onUncaught = (e: unknown): void => {
        crashed = e
      }
      process.once('uncaughtException', onUncaught)

      const sweep2 = killClientProcesses(mine, (l) => lines.push(l))

      await new Promise<void>((resolve) => {
        sweep2.on('exit', () => resolve())
        setTimeout(resolve, 2500)
      })
      await sleep(150)
      process.removeListener('uncaughtException', onUncaught)
      if (realSystemRoot !== undefined) process.env.SystemRoot = realSystemRoot

      check('a sweep that cannot start does not take the process with it', crashed === null, String(crashed))
      check(
        'it says so in the log the modder is already looking at',
        lines.some((l) => /close the game window by hand/i.test(l)),
        JSON.stringify(lines)
      )
    }
  } else {
    console.log('  skipped: the client sweep is the Windows branch, and this is not Windows')
  }

  process.env.PATH = originalPath
  if (originalUserData === undefined) delete process.env.ARTEMIS_TEST_USERDATA
  else process.env.ARTEMIS_TEST_USERDATA = originalUserData

  await theDownload()

  sweepTempDirs()

  console.log(`\n${passes} checks passed, ${failures} failed`)
  if (failures) {
    console.log('GRADLE FAIL')
    process.exit(1)
  }
  console.log('GRADLE PASS')
}

void main()
