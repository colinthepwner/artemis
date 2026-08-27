import { Boxes } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Segmented } from '@/components/ui/controls'
import { BiomesField } from './BiomesField'
import { useAppStore } from '@/store/appStore'
import { STRUCTURE_DEFAULTS, type StructureProps } from '@shared/generator/props'

export function StructureForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <Inner element={element} onClose={onClose} />
}

function Inner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<StructureProps>(element, STRUCTURE_DEFAULTS)
  const openWorkshopEditor = useAppStore((s) => s.openWorkshopEditor)

  const built = (p.variants ?? []).filter((v) => Object.keys(v.blocks ?? {}).length > 0)
  const buried = p.placement === 'buried'

  const steps: WizardStep[] = [
    {
      id: 'build',
      title: 'Build',
      desc: 'The structure itself, made block by block in the Workshop.',
      done: built.length > 0,
      content: (
        <>
          <div className="card flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-mist-100">
                {built.length === 0
                  ? 'Nothing built yet.'
                  : `${built.length} variant${built.length === 1 ? '' : 's'} built.`}
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-mist-500">
                Variants are alternate builds of the same structure; the world picks one at random
                each time it places it, so ten copies never read as ten rubber stamps.
              </p>
            </div>
            <button
              onClick={() => openWorkshopEditor(element.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
            >
              <Boxes size={13} /> Open 3D Editor
            </button>
          </div>
          <p className="text-2xs leading-relaxed text-mist-600">
            A structure places blocks that already exist, yours or vanilla. Want custom bricks?
            Design them as blocks first, then build with them.
          </p>
        </>
      )
    },
    {
      id: 'world',
      title: 'World Gen',
      desc: 'Where and how often the world stamps it in.',
      content: (
        <>
          <Field label="Placement">
            <Segmented
              value={p.placement}
              onChange={(v) => patch('placement', v)}
              options={[
                { value: 'surface', label: 'On the surface' },
                { value: 'buried', label: 'Underground' }
              ]}
            />
          </Field>
          <Field
            label="Rarity"
            hint="Tries to place in roughly one chunk out of this many. 1 is every chunk; landmarks want hundreds."
          >
            <NumberInput
              value={p.oneInChunks}
              onChange={(v) => patch('oneInChunks', v)}
              min={1}
              max={2000}
            />
          </Field>
          {buried && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Y" hint="Bottom of the burial band.">
                <NumberInput value={p.minY} onChange={(v) => patch('minY', v)} min={1} max={120} />
              </Field>
              <Field label="Max Y">
                <NumberInput value={p.maxY} onChange={(v) => patch('maxY', v)} min={1} max={120} />
              </Field>
            </div>
          )}
          <Field
            label="Biomes In"
            hint="Tick the biomes it belongs to, or leave it everywhere. The structure declares itself onto the biome, never the other way around."
          >
            <BiomesField value={p.biomes} onChange={(v) => patch('biomes', v)} />
          </Field>
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Something is built',
      ok: built.length > 0,
      detail: 'Open the 3D editor and place some blocks. An empty structure is skipped entirely.',
      stepId: 'build'
    },
    {
      label: 'Burial depth makes sense',
      ok: !buried || p.maxY >= p.minY,
      detail: 'Max Y is below Min Y.',
      stepId: 'world'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
