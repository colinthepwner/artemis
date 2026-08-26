import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, Select, Slider } from '@/components/ui/controls'
import { PLANT_DEFAULTS, type PlantProps } from '@shared/generator/props'

export function PlantForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<PlantProps>(element, PLANT_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Textures',
      desc: 'Drawn as a criss-cross, like flowers and saplings.',
      content: <TextureStrip element={element} />
    },
    {
      id: 'behavior',
      title: 'Behavior',
      content: (
        <>
          <Field label="Type">
            <Select
              value={p.plantType}
              onChange={(v) => patch('plantType', v as PlantProps['plantType'])}
              options={[
                { value: 'flower', label: 'Flower' },
                { value: 'shrub', label: 'Shrub' }
              ]}
            />
          </Field>
          <Field label="Light Emission" hint="Leave at 0 unless it should glow.">
            <Slider value={p.luminance} onChange={(v) => patch('luminance', v)} min={0} max={15} />
          </Field>
        </>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
