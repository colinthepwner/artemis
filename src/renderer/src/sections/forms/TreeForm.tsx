import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
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

  const steps: WizardStep[] = [
    {
      id: 'blocks',
      title: 'Blocks',
      desc: 'A tree plants blocks that already exist. Pick what it is built from.',
      done: Boolean(p.logBlock.trim() && p.leavesBlock.trim()),
      content: (
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
          <p className="text-2xs leading-relaxed text-mist-600">
            Want a custom trunk or canopy? Make them as blocks first, paint them there, then point
            this tree at them. That way the same wood can serve several trees.
          </p>
        </>
      )
    },
    {
      id: 'shape',
      title: 'Shape',
      desc: 'How tall it grows.',
      content: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min Height">
            <NumberInput value={p.minHeight} onChange={(v) => patch('minHeight', v)} min={2} max={30} />
          </Field>
          <Field label="Max Height">
            <NumberInput value={p.maxHeight} onChange={(v) => patch('maxHeight', v)} min={2} max={40} />
          </Field>
        </div>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Trunk and leaves picked',
      ok: Boolean(p.logBlock.trim() && p.leavesBlock.trim()),
      detail: 'The tree needs a block for its trunk and one for its leaves.',
      stepId: 'blocks'
    },
    {
      label: 'Heights make sense',
      ok: p.maxHeight >= p.minHeight,
      detail: 'Max height is below min height.',
      stepId: 'shape'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
