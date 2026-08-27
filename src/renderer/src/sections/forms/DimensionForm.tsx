import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BiomesField } from './BiomesField'
import { DIMENSION_DEFAULTS, type DimensionProps } from '@shared/generator/props'

export function DimensionForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<DimensionProps>(element, DIMENSION_DEFAULTS)
  const biomes = p.biomes ?? []

  const steps: WizardStep[] = [
    {
      id: 'biomes',
      title: 'Biomes',
      desc: 'What the world there is made of.',
      done: biomes.some((r) => r.trim()),
      content: (
        <>
          <Field
            label="Biomes"
            hint="One biome fills the whole world. Several share it in broad patches, every pair able to meet."
          >
            <BiomesField
              value={biomes}
              onChange={(v) => patch('biomes', v)}
              allLabel="None picked yet"
            />
          </Field>
          <p className="text-2xs leading-relaxed text-mist-600">
            Design biomes first, then pick them here. Their surface blocks, trees, colours and
            weather all come along, and your ores, plants and mobs generate there through their
            own Biomes filters.
          </p>
        </>
      )
    },
    {
      id: 'paint',
      title: 'Portal',
      desc: 'How players get there: build a frame, light it with flint and steel.',
      content: (
        <>
          <Field
            label="Frame Block"
            hint="What the portal frame is built from, the way the Nether's is obsidian. Your own blocks work."
          >
            <ItemRefField
              value={p.portalFrame}
              onChange={(v) => patch('portalFrame', v)}
              filter="block"
              placeholder="Pick a block"
            />
          </Field>
          <Field label="Portal Sheet" hint="The texture of the portal surface itself.">
            <TextureStrip element={element} />
          </Field>
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Biomes picked',
      ok: biomes.some((r) => r.trim()),
      detail: 'A dimension is made of biomes; without one there is nothing to generate.',
      stepId: 'biomes'
    },
    {
      label: 'Portal frame picked',
      ok: !!p.portalFrame.trim(),
      detail: 'Without a frame block there is no way in.',
      stepId: 'paint'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
