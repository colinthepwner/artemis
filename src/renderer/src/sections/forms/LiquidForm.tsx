import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, Select, Slider } from '@/components/ui/controls'
import { LIQUID_DEFAULTS, type LiquidProps } from '@shared/generator/props'

export function LiquidForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<LiquidProps>(element, LIQUID_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Textures',
      desc: "The liquid's surface texture.",
      content: <TextureStrip element={element} />
    },
    {
      id: 'behavior',
      title: 'Behavior',
      desc: 'Water-type flows and extinguishes; lava-type burns and glows.',
      content: (
        <>
          <Field label="Behaves Like">
            <Select
              value={p.materialKind}
              onChange={(v) => patch('materialKind', v as LiquidProps['materialKind'])}
              options={[
                { value: 'water', label: 'Water' },
                { value: 'lava', label: 'Lava' }
              ]}
            />
          </Field>
          <Field label="Light Emission">
            <Slider value={p.luminance} onChange={(v) => patch('luminance', v)} min={0} max={15} />
          </Field>
        </>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
