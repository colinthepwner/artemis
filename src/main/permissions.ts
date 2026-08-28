import { app, shell } from 'electron'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { desktopPlatform } from '../shared/platform'
import type { PermissionIssue } from '../shared/ipc'

async function writeProbe(
  dir: string
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const probe = join(dir, '.artemis-write-probe')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(probe, 'artemis', 'utf-8')
    await rm(probe, { force: true })
    return { ok: true }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message }
  }
}

function projectsDir(): string {
  return join(app.getPath('documents'), 'ArtemisForBTA')
}

export async function checkPermissions(): Promise<PermissionIssue[]> {
  const issues: PermissionIssue[] = []
  const p = desktopPlatform(process.platform)

  const projects = projectsDir()
  const write = await writeProbe(projects)
  if (!write.ok) {
    if (p === 'darwin') {
      issues.push({
        id: 'documents',
        title: 'Artemis cannot save into your Documents folder',
        detail:
          'macOS asks before an app may use Documents. Artemis keeps your mod projects there, ' +
          'so until this is allowed nothing can be saved or opened.',

        steps: [
          'Open the Files and Folders privacy settings with the button below',
          'Find Artemis in the list',
          'Turn on Documents Folder',
          'Come back here and choose Check again'
        ],
        path: projects,
        reason: `${write.code}: ${write.message}`,
        canOpenSettings: true
      })
    } else if (p === 'linux') {
      issues.push({
        id: 'documents',
        title: 'Artemis cannot write to its projects folder',
        detail:
          'This is where Artemis keeps your mod projects. It is usually one of three things: ' +
          'the folder is owned by another user, the home directory is mounted read only, or ' +
          'Artemis is running in a sandbox that was not given access to it.',
        steps: [
          `Check who owns the folder:  ls -ld "${projects}"`,
          `If it is not you:  sudo chown -R "$USER" "${projects}"`,
          'If Artemis is a flatpak, grant it home access with Flatseal',
          'Come back here and choose Check again'
        ],
        path: projects,
        reason: `${write.code}: ${write.message}`,

        canOpenSettings: false
      })
    } else {
      issues.push({
        id: 'documents',
        title: 'Artemis cannot write to its projects folder',
        detail:
          'This is where Artemis keeps your mod projects. On a work machine this is often a ' +
          'redirected Documents folder on a network share that is not reachable right now.',
        steps: [
          'Check that you can create a file in the folder yourself',
          'If Documents is redirected to a network drive, reconnect it',
          'Come back here and choose Check again'
        ],
        path: projects,
        reason: `${write.code}: ${write.message}`,
        canOpenSettings: false
      })
    }
  }

  const data = app.getPath('userData')
  const dataWrite = await writeProbe(data)
  if (!dataWrite.ok) {
    issues.push({
      id: 'appdata',
      title: 'Artemis cannot write to its own data folder',
      detail:
        'Gradle, the Java runtime and the test worlds all live here. Without it Artemis can ' +
        'edit a mod but cannot build or test one.',
      steps: [
        'Check that the folder exists and belongs to you',
        'If a disk cleaner or security tool is locking it, allow Artemis',
        'Come back here and choose Check again'
      ],
      path: data,
      reason: `${dataWrite.code}: ${dataWrite.message}`,
      canOpenSettings: false
    })
  }

  return issues
}

export async function openPermissionSettings(issue: PermissionIssue): Promise<void> {
  if (desktopPlatform(process.platform) === 'darwin' && issue.canOpenSettings) {
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Files'
    )
    return
  }

  const result = await shell.openPath(issue.path)
  if (result) await shell.openPath(join(issue.path, '..'))
}
