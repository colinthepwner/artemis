import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Select } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { RECIPE_DEFAULTS, type RecipeProps } from '@shared/generator/props'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export function RecipeForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<RecipeProps>(element, RECIPE_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: 'Method',
      desc: 'Where players make it.',
      content: (
        <Select
          value={p.recipeType}
          onChange={(v) => patch('recipeType', v as RecipeProps['recipeType'])}
          options={[
            { value: 'shaped', label: 'Crafting grid (exact shape)' },
            { value: 'shapeless', label: 'Crafting grid (any arrangement)' },
            { value: 'furnace', label: 'Furnace (smelting)' }
          ]}
        />
      )
    }
  ]

  let ingredientsOk: boolean
  if (p.recipeType === 'shaped') {
    ingredientsOk = p.grid.some(Boolean)
    steps.push({
      id: 'ingredients',
      title: 'Ingredients',
      desc: 'Click a square to put an item in it. Shape matters.',
      done: ingredientsOk,
      content: <CraftingGrid grid={p.grid} onChange={(g) => patch('grid', g)} />
    })
  } else if (p.recipeType === 'shapeless') {
    ingredientsOk = p.inputs.filter(Boolean).length > 0
    steps.push({
      id: 'ingredients',
      title: 'Ingredients',
      desc: "Order doesn't matter. Up to 9 ingredients.",
      done: ingredientsOk,
      content: <InputList inputs={p.inputs} onChange={(v) => patch('inputs', v)} max={9} />
    })
  } else {
    ingredientsOk = Boolean(p.inputs[0])
    steps.push({
      id: 'ingredients',
      title: 'Input',
      desc: 'What goes in the furnace.',
      done: ingredientsOk,
      content: (
        <ItemRefField value={p.inputs[0] ?? ''} onChange={(v) => patch('inputs', [v])} placeholder="Pick input…" />
      )
    })
  }

  const outputOk = Boolean(p.output.trim())
  steps.push({
    id: 'result',
    title: 'Result',
    desc: 'What the recipe produces.',
    done: outputOk,
    content: (
      <div className="grid grid-cols-[1fr,90px] gap-3">
        <Field label="Output">
          <ItemRefField value={p.output} onChange={(v) => patch('output', v)} placeholder="Pick output…" />
        </Field>
        <Field label="Count">
          <NumberInput value={p.outputCount} onChange={(v) => patch('outputCount', v)} min={1} max={64} />
        </Field>
      </div>
    )
  })

  const checks: ReviewCheck[] = [
    {
      label: 'Ingredients picked',
      ok: ingredientsOk,
      detail: 'The recipe has nothing to craft from yet.',
      stepId: 'ingredients'
    },
    { label: 'Result picked', ok: outputOk, detail: 'Choose what this recipe makes.', stepId: 'result' }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}

function CraftingGrid(props: { grid: string[]; onChange: (g: string[]) => void }): JSX.Element {
  const setCell = (idx: number, v: string): void => {
    const g = [...props.grid]
    g[idx] = v
    props.onChange(g)
  }
  return (
    <div className="mx-auto grid w-fit grid-cols-3 gap-1.5 rounded-lg bg-ink-900/70 p-2 shadow-panel">
      {props.grid.map((cell, i) => (
        <GridCell key={i} value={cell} onChange={(v) => setCell(i, v)} />
      ))}
    </div>
  )
}

function GridCell({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <ItemRefField
      value={value}
      onChange={onChange}
      placeholder=""
      className={cn(

        'relative h-16 w-16 justify-center whitespace-normal rounded-md px-1 text-center text-[9px] leading-tight shadow-panel transition-all duration-100 hover:z-10 focus:z-10',
        value ? 'bg-gold-500/10 text-mist-200' : 'bg-ink-800 hover:bg-ink-750'
      )}
    />
  )
}

function InputList(props: { inputs: string[]; onChange: (v: string[]) => void; max: number }): JSX.Element {
  return (
    <div className="space-y-2">
      {props.inputs.map((input, i) => (
        <div key={i} className="flex gap-2">
          <ItemRefField
            value={input}
            onChange={(v) => {
              const next = [...props.inputs]
              next[i] = v
              props.onChange(next)
            }}
            placeholder="Pick ingredient…"
            className="flex-1"
          />
          <button
            onClick={() => props.onChange(props.inputs.filter((_, j) => j !== i))}
            className="shrink-0 rounded-md px-2 text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {props.inputs.length < props.max && (
        <button
          onClick={() => props.onChange([...props.inputs, ''])}
          className="flex items-center gap-1.5 rounded-md bg-ink-800 px-3 py-1.5 text-2xs text-mist-400 shadow-panel transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <Plus size={12} /> Add ingredient
        </button>
      )}
    </div>
  )
}
