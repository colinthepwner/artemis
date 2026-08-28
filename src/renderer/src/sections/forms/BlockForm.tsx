import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { DropsFields } from './DropsFields'
import { Field, Select, Switch, SwitchList } from '@/components/ui/controls'
import {
  HARDNESS_MARKS,
  RESISTANCE_MARKS,
  HarvestLevelSlider,
  LightSlider,
  MineableToolSlider,
  ScaleSlider,
  isToolTag
} from '@/components/pixel/blockControls'
import { useSwatchedOptions } from '@/components/pixel/blockSwatches'
import { BLOCK_DEFAULTS, type BlockProps } from '@shared/generator/props'
import { getMapping } from '@shared/generator/mappings'
import { useProjectStore } from '@/store/projectStore'
import { titleCase } from '@shared/generator/templates/block'

export function useMappingOptions() {
  const targetBta = useProjectStore((s) => s.project?.meta.targetBta ?? '8.0.1')
  const mapping = getMapping(targetBta)
  const opts = (table: Record<string, string>, keep: (k: string) => boolean) =>
    Object.keys(table)
      .filter((k) => !k.startsWith('$') && keep(k))
      .map((k) => ({ value: k, label: titleCase(k.replace(/([A-Z])/g, '_$1').toLowerCase()) }))
  const all = (): boolean => true
  return {
    materials: opts(mapping.materials, all),
    sounds: opts(mapping.sounds, all),

    behaviorTags: opts(
      mapping.blockTags,
      (k) => !isToolTag(k) && k !== 'notInCreativeMenu'
    )
  }
}

interface BlockFieldProps {
  p: BlockProps
  patch: <K extends keyof BlockProps>(key: K, value: BlockProps[K]) => void
}

const LAYOUT_OPTIONS = [
  { value: 'all', label: 'Same on all sides' },
  { value: 'topBottomSides', label: 'Top / Bottom / Sides' }
]

export function TextureLayoutSelect({ p, patch }: BlockFieldProps): JSX.Element {

  const options = useSwatchedOptions(LAYOUT_OPTIONS)
  return (
    <Field label="Texture Layout">
      <Select
        value={p.textureMode}
        onChange={(v) => patch('textureMode', v as BlockProps['textureMode'])}
        options={options}
      />
    </Field>
  )
}

export function MaterialFeelFields({ p, patch }: BlockFieldProps): JSX.Element {
  const { materials, sounds } = useMappingOptions()

  const materialOptions = useSwatchedOptions(materials)
  const soundOptions = useSwatchedOptions(sounds)
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material">
          <Select value={p.material} onChange={(v) => patch('material', v)} options={materialOptions} />
        </Field>
        <Field label="Step Sound">
          <Select value={p.sound} onChange={(v) => patch('sound', v)} options={soundOptions} />
        </Field>
      </div>
      <Field label="Hardness" hint="Mining time. Click a block to match it.">
        <ScaleSlider
          value={p.hardness}
          onChange={(v) => patch('hardness', v)}
          max={50}
          step={0.1}
          marks={HARDNESS_MARKS}
        />
      </Field>
      <Field
        label="Blast Resistance"
        hint="How well it survives explosions. Ordinary blocks sit in single digits; type a bigger number for anything meant to shrug off TNT."
      >
        <ScaleSlider
          value={p.resistance}
          onChange={(v) => patch('resistance', v)}
          max={100}
          from={0.5}
          step={0.5}
          marks={RESISTANCE_MARKS}
        />
      </Field>
      <Field label="Light Emission" hint="0 is an ordinary block. A torch is 14.">
        <LightSlider value={p.luminance} onChange={(v) => patch('luminance', v)} />
      </Field>
    </>
  )
}

export function MiningFields({ p, patch }: BlockFieldProps): JSX.Element {
  const { behaviorTags } = useMappingOptions()
  const behaviorOptions = useSwatchedOptions(behaviorTags)
  return (
    <>
      <Field label="Mined With" hint="The tool this block answers to. Blocks have one, not several.">
        <MineableToolSlider tags={p.tags} onChange={(v) => patch('tags', v)} />
      </Field>
      <Field
        label="Harvest Level"
        hint="How good the tool has to be before the block drops anything. Anything below the level still breaks it, it just leaves nothing behind."
      >
        <HarvestLevelSlider
          value={p.harvestLevel ?? 0}
          onChange={(v) => patch('harvestLevel', v)}
        />
      </Field>
      <DropsFields p={p} patch={patch} selfValue="default" />
      {

}
      <Field label="Behavior" hint="Optional. Most blocks want none of these.">
        <SwitchList
          options={behaviorOptions}
          selected={p.tags.filter((t) => !isToolTag(t))}
          onChange={(v) => patch('tags', [...p.tags.filter(isToolTag), ...v])}
        />
      </Field>
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
      content: <MiningFields p={p} patch={patch} />
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Drop picked',
      ok: p.drops !== 'item' || !!p.dropItem.trim(),
      detail: 'Set to drop a chosen item, but no item is picked yet.',
      stepId: 'mining'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}
