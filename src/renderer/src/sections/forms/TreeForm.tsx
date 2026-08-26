import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, NumberInput } from '@/components/ui/controls'
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
  const hex = p.leavesColor.replace(/[^0-9a-fA-F]/g, '').padEnd(6, '0').slice(0, 6)

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Textures',
      desc: `Creates the "${element.name}_log" and "${element.name}_leaves" blocks plus a world feature, all made for you.`,
      content: <TextureStrip element={element} />
    },
    {
      id: 'shape',
      title: 'Shape',
      desc: 'How tall it grows and the tint of its leaves.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Height">
              <NumberInput value={p.minHeight} onChange={(v) => patch('minHeight', v)} min={2} max={30} />
            </Field>
            <Field label="Max Height">
              <NumberInput value={p.maxHeight} onChange={(v) => patch('maxHeight', v)} min={2} max={40} />
            </Field>
          </div>
          <Field label="Leaves Tint">
            <div className="flex items-center gap-2">
              {}
              <label
                className="relative h-7 w-7 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
                style={{ background: `#${hex}` }}
              >
                <input
                  type="color"
                  className="absolute inset-0 h-full w-full opacity-0"
                  value={`#${hex}`}
                  onChange={(e) => patch('leavesColor', e.target.value.slice(1))}
                />
              </label>
              <input
                className="input-base font-mono"
                value={p.leavesColor}
                onChange={(e) => patch('leavesColor', e.target.value.replace(/^#/, ''))}
              />
            </div>
          </Field>
        </>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
