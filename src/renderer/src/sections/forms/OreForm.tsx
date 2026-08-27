import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BiomesField } from './BiomesField'
import { ORE_DEFAULTS, type OreProps } from '@shared/generator/props'

export function OreForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <OreFormInner element={element} onClose={onClose} />
}

function OreFormInner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<OreProps>(element, ORE_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'block',
      title: 'Block',
      desc: 'Which block the veins are made of.',
      done: !!p.blockRef.trim(),
      content: (
        <>
          <Field
            label="Ore Block"
            hint="A block from this mod or a vanilla one. Its drops, hardness and harvest rules live on the block itself."
          >
            <ItemRefField
              value={p.blockRef}
              onChange={(v) => patch('blockRef', v)}
              filter="block"
              placeholder="Pick a block"
            />
          </Field>
          <p className="text-2xs leading-relaxed text-mist-600">
            The usual order: create the material item first, then a block that drops it, then
            point these veins at that block.
          </p>
        </>
      )
    },
    {
      id: 'world',
      title: 'World Gen',
      desc: 'How the world grows veins of it.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vein Size">
              <NumberInput value={p.veinSize} onChange={(v) => patch('veinSize', v)} min={1} max={64} />
            </Field>
            <Field label="Veins per Chunk">
              <NumberInput value={p.veinsPerChunk} onChange={(v) => patch('veinsPerChunk', v)} min={0} max={64} />
            </Field>
            <Field label="Min Y">
              <NumberInput value={p.minY} onChange={(v) => patch('minY', v)} />
            </Field>
            <Field label="Max Y">
              <NumberInput value={p.maxY} onChange={(v) => patch('maxY', v)} />
            </Field>
          </div>
          <Field label="Biomes In" hint="Leave on all biomes unless this ore belongs to a particular place.">
            <BiomesField value={p.biomes} onChange={(v) => patch('biomes', v)} />
          </Field>
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Ore block picked',
      ok: !!p.blockRef.trim(),
      detail: 'Without a block there is nothing to place. Pick one in the Block step.',
      stepId: 'block'
    },
    {
      label: 'Actually generates',
      ok: p.veinsPerChunk > 0,
      detail: 'Veins per chunk is 0, so no veins are placed anywhere.',
      stepId: 'world'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
