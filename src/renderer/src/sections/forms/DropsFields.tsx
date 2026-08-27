import { Field, NumberInput, Select } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'

interface DropShape {
  drops: string
  dropItem: string
  dropCountMin: number
  dropCountMax: number
}

export function DropsFields<P extends DropShape>(props: {
  p: P
  patch: <K extends keyof P>(key: K, value: P[K]) => void

  selfValue: 'default' | 'self'
}): JSX.Element {
  const { p, patch, selfValue } = props

  const mode = p.drops === 'nothing' || p.drops === 'item' ? p.drops : selfValue
  const options = [
    { value: selfValue, label: 'Itself' },
    { value: 'nothing', label: 'Nothing' },
    { value: 'item', label: 'A chosen item' }
  ]

  return (
    <>
      <Field label="Drops" hint="What breaking it leaves behind.">
        <Select
          value={mode}
          onChange={(v) => patch('drops' as keyof P, v as P[keyof P])}
          options={options}
        />
      </Field>
      {mode === 'item' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dropped Item" hint="Design the item first, then pick it here.">
            <ItemRefField
              value={p.dropItem}
              onChange={(v) => patch('dropItem' as keyof P, v as P[keyof P])}
              placeholder="Pick an item"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min">
              <NumberInput
                value={p.dropCountMin}
                onChange={(v) =>
                  patch('dropCountMin' as keyof P, Math.max(0, Math.round(v)) as P[keyof P])
                }
                min={0}
                max={64}
              />
            </Field>
            <Field label="Max">
              <NumberInput
                value={p.dropCountMax}
                onChange={(v) =>
                  patch('dropCountMax' as keyof P, Math.max(1, Math.round(v)) as P[keyof P])
                }
                min={1}
                max={64}
              />
            </Field>
          </div>
        </div>
      )}
    </>
  )
}
