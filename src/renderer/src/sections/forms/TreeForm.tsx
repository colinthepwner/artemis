import { Boxes } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Segmented } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BiomesField } from './BiomesField'
import { useAppStore } from '@/store/appStore'
import { TREE_DEFAULTS, type TreeProps } from '@shared/generator/props'

export function TreeForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<TreeProps>(element, TREE_DEFAULTS)
  const openWorkshopEditor = useAppStore((s) => s.openWorkshopEditor)

  const built = (p.variants ?? []).filter((v) => Object.keys(v.blocks ?? {}).length > 0)
  const isBuilt = p.design === 'built'
  const shapeDone = isBuilt ? built.length > 0 : Boolean(p.logBlock.trim() && p.leavesBlock.trim())

  const steps: WizardStep[] = [
    {
      id: 'shape',
      title: 'Shape',
      desc: 'How the tree takes its form: grown from a recipe, or built by hand.',
      done: shapeDone,
      content: (
        <>
          <Field label="Design">
            <Segmented
              value={p.design}
              onChange={(v) => patch('design', v)}
              options={[
                { value: 'grown', label: 'Grown (procedural)' },
                { value: 'built', label: 'Built (3D editor)' }
              ]}
            />
          </Field>

          {isBuilt ? (
            <>
              <div className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-mist-100">
                    {built.length === 0
                      ? 'Nothing built yet.'
                      : `${built.length} variant${built.length === 1 ? '' : 's'} built.`}
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-mist-500">
                    Variants are alternate shapes of this tree; the world grows one at random per
                    planting, which is what keeps a forest from looking cloned.
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
                In the world, everything off the trunk column only fills air, so a built tree drapes
                over terrain instead of carving into it.
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Trunk" hint="Any block, yours or vanilla.">
                  <ItemRefField
                    filter="block"
                    value={p.logBlock}
                    onChange={(v) => patch('logBlock', v)}
                    placeholder="Pick a block"
                  />
                </Field>
                <Field label="Leaves">
                  <ItemRefField
                    filter="block"
                    value={p.leavesBlock}
                    onChange={(v) => patch('leavesBlock', v)}
                    placeholder="Pick a block"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Height">
                  <NumberInput value={p.minHeight} onChange={(v) => patch('minHeight', v)} min={2} max={30} />
                </Field>
                <Field label="Max Height">
                  <NumberInput value={p.maxHeight} onChange={(v) => patch('maxHeight', v)} min={2} max={40} />
                </Field>
              </div>
              <p className="text-2xs leading-relaxed text-mist-600">
                Want a custom trunk or canopy? Make them as blocks first, paint them there, then
                point this tree at them. That way the same wood can serve several trees.
              </p>
            </>
          )}
        </>
      )
    },
    {
      id: 'world',
      title: 'World Gen',
      desc: 'Where it grows. The tree claims biomes; biomes never pick trees.',
      content: (
        <>
          <Field label="Biomes In" hint="Tick the biomes this tree belongs to, or leave it everywhere.">
            <BiomesField value={p.biomes} onChange={(v) => patch('biomes', v)} />
          </Field>
          <Field
            label="Trees per Chunk"
            hint="Planting attempts per chunk in vanilla biomes, so a fraction of these actually take. 0 keeps it out of vanilla biomes entirely."
          >
            <NumberInput
              value={p.treesPerChunk}
              onChange={(v) => patch('treesPerChunk', v)}
              min={0}
              max={20}
            />
          </Field>
          <p className="text-2xs leading-relaxed text-mist-600">
            In one of your own biomes this tree REPLACES the vanilla oaks, at the biome&apos;s natural
            tree density (several claimants share the biome at random). In vanilla biomes it is
            planted on top, at the rate above. Nothing is ever planted twice.
          </p>
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    isBuilt
      ? {
          label: 'Something is built',
          ok: built.length > 0,
          detail: 'Open the 3D editor and build at least one variant, or switch back to Grown.',
          stepId: 'shape'
        }
      : {
          label: 'Trunk and leaves picked',
          ok: Boolean(p.logBlock.trim() && p.leavesBlock.trim()),
          detail: 'The tree needs a block for its trunk and one for its leaves.',
          stepId: 'shape'
        },
    ...(!isBuilt
      ? [
          {
            label: 'Heights make sense',
            ok: p.maxHeight >= p.minHeight,
            detail: 'Max height is below min height.',
            stepId: 'shape'
          }
        ]
      : [])
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
