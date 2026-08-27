import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, Select } from '@/components/ui/controls'
import { LightSlider } from '@/components/pixel/blockControls'
import { useSwatchedOptions } from '@/components/pixel/blockSwatches'
import { LIQUID_DEFAULTS, type LiquidProps } from '@shared/generator/props'

const KIND_OPTIONS = [
  { value: 'water', label: 'Water' },
  { value: 'lava', label: 'Lava' }
]

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
  const [p, patch, patchMany] = usePropEditor<LiquidProps>(element, LIQUID_DEFAULTS)
  const kindOptions = useSwatchedOptions(KIND_OPTIONS)

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
              onChange={(v) => {
                const kind = v as LiquidProps['materialKind']
                const updates: Partial<LiquidProps> = { materialKind: kind }

                if (kind === 'lava' && p.luminance === 0) updates.luminance = 15
                if (kind === 'water' && p.luminance === 15) updates.luminance = 0
                patchMany(updates)
              }}
              options={kindOptions}
            />
          </Field>
          <Field label="Light Emission">
            <LightSlider value={p.luminance} onChange={(v) => patch('luminance', v)} />
          </Field>
        </>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
