import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, NumberInput, Select, Switch, Slider, Toggles } from '@/components/ui/controls'
import { BLOCK_DEFAULTS, type BlockProps } from '@shared/generator/props'
import { getMapping } from '@shared/generator/mappings'
import { useProjectStore } from '@/store/projectStore'
import { titleCase } from '@shared/generator/templates/block'

export function useMappingOptions() {
  const targetBta = useProjectStore((s) => s.project?.meta.targetBta ?? '8.0.1')
  const mapping = getMapping(targetBta)
  const opts = (table: Record<string, string>) =>
    Object.keys(table)
      .filter((k) => !k.startsWith('$'))
      .map((k) => ({ value: k, label: titleCase(k.replace(/([A-Z])/g, '_$1').toLowerCase()) }))
  return {
    materials: opts(mapping.materials),
    sounds: opts(mapping.sounds),
    tags: opts(mapping.blockTags)
  }
}

interface BlockFieldProps {
  p: BlockProps
  patch: <K extends keyof BlockProps>(key: K, value: BlockProps[K]) => void
}

export function TextureLayoutSelect({ p, patch }: BlockFieldProps): JSX.Element {
  return (
    <Field label="Texture Layout">
      <Select
        value={p.textureMode}
        onChange={(v) => patch('textureMode', v as BlockProps['textureMode'])}
        options={[
          { value: 'all', label: 'Same on all sides' },
          { value: 'topBottomSides', label: 'Top / Bottom / Sides' }
        ]}
      />
    </Field>
  )
}

export function MaterialFeelFields({ p, patch }: BlockFieldProps): JSX.Element {
  const { materials, sounds } = useMappingOptions()
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material">
          <Select value={p.material} onChange={(v) => patch('material', v)} options={materials} />
        </Field>
        <Field label="Step Sound">
          <Select value={p.sound} onChange={(v) => patch('sound', v)} options={sounds} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hardness" hint="Mining time. Stone is 1.5, obsidian 50.">
          <NumberInput value={p.hardness} onChange={(v) => patch('hardness', v)} min={0} step={0.1} />
        </Field>
        <Field label="Blast Resistance">
          <NumberInput value={p.resistance} onChange={(v) => patch('resistance', v)} min={0} step={0.5} />
        </Field>
      </div>
      <Field label="Light Emission">
        <Slider value={p.luminance} onChange={(v) => patch('luminance', v)} min={0} max={15} />
      </Field>
    </>
  )
}

export function MiningFields({
  p,
  patch,
  showDrops
}: BlockFieldProps & { showDrops: boolean }): JSX.Element {
  const { tags } = useMappingOptions()
  return (
    <>
      <Field label="Mined With" hint="Which tools are effective against it.">
        <Toggles options={tags} selected={p.tags} onChange={(v) => patch('tags', v)} />
      </Field>
      {showDrops && (
        <Switch
          checked={p.drops === 'nothing'}
          onChange={(v) => patch('drops', v ? 'nothing' : 'default')}
          label="Drops nothing when mined"
          hint="Off = the block drops itself, like most blocks."
        />
      )}
      <Switch
        checked={p.notInCreativeMenu}
        onChange={(v) => patch('notInCreativeMenu', v)}
        label="Hide from creative menu"
      />
    </>
  )
}

export function BlockForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <BlockFormInner element={element} onClose={onClose} />
}

function BlockFormInner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<BlockProps>(element, BLOCK_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Textures',
      desc: 'Its look in the world. Pick or draw each face.',
      content: (
        <>
          <TextureLayoutSelect p={p} patch={patch} />
          <TextureStrip element={element} />
        </>
      )
    },
    {
      id: 'material',
      title: 'Material',
      desc: "What it's made of, how tough it is, how it sounds.",
      content: <MaterialFeelFields p={p} patch={patch} />
    },
    {
      id: 'mining',
      title: 'Mining',
      desc: 'How players break it and what they get.',
      content: <MiningFields p={p} patch={patch} showDrops />
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
