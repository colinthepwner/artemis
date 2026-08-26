import { useState } from 'react'
import { PackageOpen, FolderOpen, FileArchive, Loader2, Settings, ShieldCheck } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { Switch } from '@/components/ui/controls'
import { cn } from '@/lib/cn'

export function ExportSection(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const navigate = useAppStore((s) => s.navigate)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [outPath, setOutPath] = useState<string | null>(null)
  const [jarPath, setJarPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    if (!project || busy) return
    setBusy(true)
    setError(null)
    setLog([])
    setOutPath(null)
    setJarPath(null)
    try {
      const res = await window.artemis.export.workspace(JSON.stringify(project))
      setLog(res.log)
      if (res.ok && res.path) setOutPath(res.path)
      if (res.jarPath) setJarPath(res.jarPath)
      if (!res.ok && res.error) setError(res.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-xl">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">Export Mod</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mist-500">
            Generates a complete Gradle workspace for BTA 8.0.1 (Java sources, resources, and a
            build script that pulls the latest{' '}
            <span className="font-mono text-mist-400">halplibe</span>), then builds it. What you get
            is a jar ready to drop into a mods folder. The source stays on disk if you want to
            hand-edit and rebuild later.
          </p>
        </div>
        <button
          onClick={() => navigate('settings')}
          title="Mod name, version, authors and description"
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-ink-750 px-3 py-1.5 text-2xs text-mist-300 transition-colors hover:bg-ink-700 hover:text-mist-100"
        >
          <Settings size={13} /> Mod Settings
        </button>
      </div>

      {}
      <div className="card mt-5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-500/10">
            <ShieldCheck size={15} className="text-gold-400" />
          </div>
          <div className="flex-1">
            <Switch
              checked={project?.meta.obfuscate !== false}
              onChange={(v) => updateMeta({ obfuscate: v })}
              label="Obfuscate exported mod"
            />
            <p className="mt-1 text-2xs leading-relaxed text-mist-500">
              Adds a ProGuard step to the build that renames all internal classes and members, keeping
              a stability list for entrypoints, overrides, mixins and reflection. Registry IDs and
              string identifiers are unaffected. Turn off while debugging a build issue.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => void run()}
          disabled={!project || busy}
          className={cn(
            'flex items-center gap-2 rounded-md bg-gold-500 px-5 py-2.5 text-[13px] font-semibold text-ink-950 transition-all',
            busy ? 'opacity-60' : 'hover:bg-gold-400 active:scale-[0.98]'
          )}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <PackageOpen size={15} />}
          {busy ? 'Building…' : 'Export & Build Jar'}
        </button>
        {jarPath && (
          <button
            onClick={() => window.artemis.export.revealJar(jarPath)}
            className="flex items-center gap-2 rounded-md bg-ink-750 px-4 py-2.5 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
          >
            <FileArchive size={14} /> Reveal Jar
          </button>
        )}
        {outPath && (
          <button
            onClick={() => window.artemis.export.openPath(outPath)}
            className="flex items-center gap-2 rounded-md bg-ink-750 px-4 py-2.5 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
          >
            <FolderOpen size={14} /> Open Source Folder
          </button>
        )}
      </div>

      {jarPath && <p className="mt-3 truncate font-mono text-2xs text-mist-500">{jarPath}</p>}

      {error && (
        <div className="mt-4 rounded-md bg-ember-500/10 p-3 font-mono text-2xs text-ember-400">
          {error}
        </div>
      )}

      {log.length > 0 && (
        <pre className="selectable mt-4 overflow-x-auto rounded-lg bg-ink-950 p-4 font-mono text-2xs leading-relaxed text-mist-400 shadow-panel">
          {log.join('\n')}
        </pre>
      )}
      </div>
    </div>
  )
}
