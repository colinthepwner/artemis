import { AlertTriangle, Music, Plus, Trash2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem } from '@/components/ui/context'
import { useProjectStore } from '@/store/projectStore'
import { toRegistryName, type ProjectSound } from '@shared/project'

const NONE: never[] = []

export function SoundShelf(props: { onAdd: () => void; error?: string | null }): JSX.Element {
  const sounds = useProjectStore((s) => s.project?.sounds) ?? NONE
  const removeSound = useProjectStore((s) => s.removeSound)

  if (sounds.length === 0) return <EmptyShelf onAdd={props.onAdd} error={props.error} />

  return (
    <>
      {props.error && <ImportError message={props.error} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {sounds.map((sound) => (
          <SoundCard key={sound.id} sound={sound} onDelete={() => removeSound(sound.id)} />
        ))}
      </div>
    </>
  )
}

function ImportError({ message }: { message: string }): JSX.Element {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md bg-ember-500/10 p-3">
      <AlertTriangle size={13} className="mt-px shrink-0 text-ember-400" />
      <p className="text-2xs leading-relaxed text-mist-300">{message}</p>
    </div>
  )
}

function SoundCard(props: { sound: ProjectSound; onDelete: () => void }): JSX.Element {
  const { sound } = props
  const updateSound = useProjectStore((s) => s.updateSound)

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="card flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-900/60">
              <Music size={14} className="text-gold-400/80" strokeWidth={1.75} />
            </span>
            <input
              className="input-base min-w-0 flex-1 font-mono text-2xs"
              value={sound.name}
              onChange={(e) => updateSound(sound.id, { name: toRegistryName(e.target.value) })}
              title={`The file it lands on: assets/<modid>/sounds/${sound.name}.${sound.format ?? 'ogg'}`}
            />
          </div>
          <input
            className="input-base font-mono text-2xs"
            value={sound.event}
            onChange={(e) => updateSound(sound.id, { event: e.target.value.trim() })}
            placeholder="my.event"
            title="The key the game plays it by, written with dots"
          />
          <div className="flex items-center justify-between text-2xs text-mist-600">
            {

}
            <span
              className="font-mono uppercase"
              title={
                (sound.format ?? 'ogg') === 'wav'
                  ? 'Shipped as wav, which BTA plays through CodecWav. Uncompressed, so it is bigger than a compressed source would be.'
                  : 'Shipped as ogg, which BTA plays through CodecJOrbis.'
              }
            >
              {sound.format ?? 'ogg'}
            </span>
            <span className="font-mono" title={`${sound.bytes} bytes before compression`}>
              {Math.max(1, Math.round(sound.bytes / 1024))} KB
            </span>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem label="Delete" icon={Trash2} danger onSelect={props.onDelete} />
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}

function EmptyShelf(props: { onAdd: () => void; error?: string | null }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
        <Music size={20} className="text-mist-600" strokeWidth={1.5} />
      </div>
      <p className="max-w-sm text-[13px] leading-relaxed text-mist-500">
        The audio the mod ships, played by the key you give it. A right-click rule, a block or
        anything else that makes a noise can name one.
      </p>
      <p className="max-w-sm text-2xs leading-relaxed text-mist-600">
        Any audio file. Ogg and wav are what the game plays, so those ship as they are; anything
        else is converted to wav on the way in.
      </p>
      {props.error && (
        <div className="max-w-sm">
          <ImportError message={props.error} />
        </div>
      )}
      <button
        onClick={props.onAdd}
        className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
      >
        <Plus size={14} /> Add your first sound
      </button>
    </div>
  )
}
