import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, TextInput, NumberInput, Switch } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { MOB_DEFAULTS, type MobProps } from '@shared/generator/props'
import { cn } from '@/lib/cn'

export function MobForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<MobProps>(element, MOB_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'skin',
      title: 'Skin',
      desc: '64×32 entity skins are painted in an external editor and dropped in after export.',
      content: <SkinFields element={element} p={p} patch={patch} />
    },
    {
      id: 'stats',
      title: 'Stats',
      desc: 'How tough it is and how it moves.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Health" hint="2 = one heart.">
              <NumberInput value={p.health} onChange={(v) => patch('health', v)} min={1} />
            </Field>
            <Field label="Move Speed">
              <NumberInput value={p.moveSpeed} onChange={(v) => patch('moveSpeed', v)} min={0} step={0.1} />
            </Field>
          </div>
          <Switch
            checked={p.hostile}
            onChange={(v) => patch('hostile', v)}
            label="Hostile"
            hint="It will chase and attack players."
          />
          {p.hostile && (
            <Field label="Attack Damage">
              <NumberInput value={p.attackDamage} onChange={(v) => patch('attackDamage', v)} min={0} />
            </Field>
          )}
        </>
      )
    },
    {
      id: 'drops',
      title: 'Drops',
      desc: 'Loot when defeated. Leave empty for no drops.',
      content: (
        <div className="grid grid-cols-[1fr,110px] gap-3">
          <Field label="Drop Item">
            <ItemRefField value={p.dropItem} onChange={(v) => patch('dropItem', v)} placeholder="Pick drop…" />
          </Field>
          <Field label="Max Count">
            <NumberInput value={p.dropCountMax} onChange={(v) => patch('dropCountMax', v)} min={1} max={16} />
          </Field>
        </div>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}

function SkinFields(props: {
  element: NonNullable<ElementFormProps['element']>
  p: MobProps
  patch: <K extends keyof MobProps>(key: K, value: MobProps[K]) => void
}): JSX.Element {
  const [showPath, setShowPath] = useState(false)
  return (
    <>
      <TextureStrip element={props.element} />
      {}
      <button
        onClick={() => setShowPath((v) => !v)}
        className="flex items-center gap-1 text-2xs text-mist-500 transition-colors hover:text-mist-300"
      >
        <ChevronRight size={11} className={cn('transition-transform', showPath && 'rotate-90')} />
        Custom skin path
      </button>
      {showPath && (
        <Field
          label="Texture Path"
          hint={`Blank uses "modid:entity/${props.element.name}". Drop the PNG in assets after export.`}
        >
          <TextInput mono value={props.p.texturePath} onChange={(v) => props.patch('texturePath', v)} />
        </Field>
      )}
    </>
  )
}
