import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { ToolStatFields, ArmorStatFields } from './ItemForm'
import { Field, Switch } from '@/components/ui/controls'
import { GEARSET_DEFAULTS, type GearSetProps, type AnySetProps } from '@shared/generator/props'
import { kitFamily } from '@shared/generator/family'
import { elementRegistryEntries } from '@shared/generator/registry'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { generateKitTextures, suggestKitAccent, DEFAULT_KIT_ACCENT } from '@/components/pixel/kitGenerator'
import { ContentThumb } from '@/components/ui/ContentThumb'
import { titleCase } from '@shared/generator/templates/block'

export function GearSetForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <GearSetFormInner element={element} onClose={onClose} />
}

function GearSetFormInner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<GearSetProps>(element, GEARSET_DEFAULTS)

  const patchStat = <K extends keyof AnySetProps>(key: K, value: AnySetProps[K]): void =>
    patch(key as keyof GearSetProps, value as GearSetProps[keyof GearSetProps])

  const [kitMsg, setKitMsg] = useState<string | null>(null)
  const [accent, setAccent] = useState(DEFAULT_KIT_ACCENT)
  const textures = useProjectStore((s) => s.project?.textures)
  const assignments = useProjectStore((s) => s.project?.textureAssignments)
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)

  useEffect(() => {
    void suggestKitAccent(element.id).then((c) => c && setAccent(c))
  }, [element.id, textures])

  const family = kitFamily(element)
  const pieces = family ? [...family.tools, ...family.armor] : []

  const painted = useMemo(
    () => pieces.filter((name) => assignments?.[`item/${name}`]).length,
    [pieces, assignments]
  )

  const allElements = useProjectStore((s) => s.project?.elements)
  const collisions = useMemo(() => {
    const taken = new Set<string>()
    for (const other of allElements ?? []) {
      if (other.id === element.id) continue
      taken.add(other.name)
      for (const entry of elementRegistryEntries(other)) taken.add(entry.registryName)
    }
    return pieces.filter((n) => taken.has(n))
  }, [allElements, element.id, pieces])

  const generate = (): void => {
    void generateKitTextures(element.id, { regenerate: true })
      .then((r) => {
        const touched = r.created + r.updated + r.reused
        if (touched === 0) {
          setKitMsg('Every piece already has your own texture, so nothing was replaced.')
        } else {
          const kept = r.kept > 0 ? `, ${r.kept} of your own left alone` : ''
          setKitMsg(`${touched} of ${r.pieces} pieces painted${kept}.`)
        }
      })
      .catch((e) => setKitMsg(`Could not generate: ${e instanceof Error ? e.message : String(e)}`))
  }

  const steps: WizardStep[] = [
    {
      id: 'pieces',
      title: 'Pieces',
      desc: 'Which halves of the set this mod ships.',
      content: (
        <>
          <div className="flex items-start gap-2 rounded-md bg-gold-500/10 p-3">
            <Sparkles size={13} className="mt-px shrink-0 text-gold-400" />
            <p className="text-2xs leading-relaxed text-gold-300">
              Every piece you switch on is created for you, named after this set: entries in the
              sidebar and in the item pickers. Never make them by hand.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Switch checked={p.tools} onChange={(v) => patch('tools', v)} label="Tool set" />
            <Switch checked={p.armor} onChange={(v) => patch('armor', v)} label="Armor set" />
          </div>
          {pieces.length === 0 && (
            <p className="text-2xs leading-relaxed text-mist-600">
              With both off this set makes nothing at all.
            </p>
          )}
        </>
      ),
      done: pieces.length > 0
    },
    ...(p.tools
      ? [
          {
            id: 'tools',
            title: 'Tool Stats',
            desc: 'The numbers every tool in the set is built with.',
            content: <ToolStatFields set={p} patchSet={patchStat} />
          }
        ]
      : []),
    ...(p.armor
      ? [
          {
            id: 'armor',
            title: 'Armor Stats',
            desc: 'The numbers every piece of armor in the set is built with.',
            content: <ArmorStatFields set={p} patchSet={patchStat} />
          }
        ]
      : []),
    {
      id: 'paint',
      title: 'Textures',
      desc: 'What each piece looks like in the inventory and in hand.',
      content: (
        <div className="space-y-3">
          <p className="text-2xs leading-relaxed text-mist-500">
            Every piece starts with no artwork, so a set you mean to draw yourself begins empty.
            Click one to paint it, or bake the whole set from your material's color and edit any
            of them afterwards.
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {

}
            <span
              className="h-7 w-9 shrink-0 rounded-md shadow-panel"
              style={{ background: accent }}
              title={`Read from the "${element.name}" texture (${accent})`}
            />
            <span className="shrink-0 text-2xs text-mist-500">Material color</span>
            <button
              onClick={generate}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
            >
              <Wand2 size={12} /> Generate gear textures
            </button>
          </div>
          {kitMsg && <p className="text-2xs leading-snug text-mist-500">{kitMsg}</p>}
          <div className="flex flex-wrap gap-2">
            {pieces.map((name) => {
              const id = assignments?.[`item/${name}`]
              const tex = id ? textures?.find((t) => t.id === id) : undefined
              return (
                <button
                  key={name}
                  onClick={() =>
                    openTextureEditor({
                      textureId: tex?.id ?? null,
                      assignSlotAfter: `item/${name}`,
                      kind: 'item',
                      suggestedName: name
                    })
                  }
                  title={titleCase(name)}
                  className="relative flex h-12 w-12 items-center justify-center rounded-md bg-ink-900/60 shadow-panel transition-colors hover:z-10 hover:bg-ink-750"
                >
                  {tex ? (
                    <img src={tex.data} alt={name} className="h-8 w-8 [image-rendering:pixelated]" />
                  ) : (
                    <ContentThumb element={element} size={18} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ),
      done: pieces.length === 0 || painted === pieces.length
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Makes something',
      ok: pieces.length > 0,
      detail: pieces.length > 0 ? undefined : 'Both halves are switched off, so this set is empty.',
      stepId: 'pieces'
    },
    {
      label: 'Generated names are free',
      ok: collisions.length === 0,
      detail:
        collisions.length === 0
          ? undefined
          : `${collisions.join(', ')} already exist elsewhere in the mod. Rename this set, or delete the hand-made duplicates.`,
      stepId: 'pieces'
    },
    {
      label: 'Every piece painted',
      ok: pieces.length === 0 || painted === pieces.length,
      detail:
        pieces.length === 0 || painted === pieces.length
          ? undefined
          : `${pieces.length - painted} of ${pieces.length} still have no texture.`,
      stepId: 'paint'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
