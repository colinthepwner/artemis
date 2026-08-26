import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Wand2 } from 'lucide-react'
import type { ArtemisElement } from '@shared/project'
import { useAppStore } from '@/store/appStore'
import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, TextInput, NumberInput, Select, Switch } from '@/components/ui/controls'
import { ORE_DEFAULTS, type OreProps, type AnySetProps } from '@shared/generator/props'
import { MaterialFeelFields, MiningFields, TextureLayoutSelect } from './BlockForm'
import type { BlockProps } from '@shared/generator/props'
import { useProjectStore } from '@/store/projectStore'
import { oreFamily } from '@shared/generator/family'
import { elementRegistryEntries } from '@shared/generator/registry'
import {
  DEFAULT_KIT_ACCENT,
  generateKitTextures,
  suggestKitAccent
} from '@/components/pixel/kitGenerator'

export function OreForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <OreFormInner element={element} onClose={onClose} />
}

function OreFormInner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<OreProps>(element, ORE_DEFAULTS)
  const set: AnySetProps = { ...ORE_DEFAULTS.set, ...p.set }
  const patchSet = <K extends keyof AnySetProps>(key: K, value: AnySetProps[K]): void =>
    patch('set', { ...set, [key]: value })

  const baseName = (p.dropItemName || element.name.replace(/_ore$/, '')).trim()
  const blockPatch = patch as <K extends keyof BlockProps>(key: K, value: BlockProps[K]) => void

  const [kitMsg, setKitMsg] = useState<string | null>(null)
  const [kitAccent, setKitAccent] = useState(DEFAULT_KIT_ACCENT)

  useEffect(() => {
    void suggestKitAccent(element.id).then((c) => c && setKitAccent(c))
  }, [element.id])

  const runKitGen = (regenerate: boolean): void => {
    void generateKitTextures(element.id, { accent: kitAccent, regenerate })
      .then((r) => {
        const touched = r.created + r.updated + r.reused
        if (r.pieces === 0) {
          setKitMsg('Turn on a tool or armor set first.')
        } else if (touched === 0) {
          setKitMsg('Every piece already has your own texture, so nothing was replaced.')
        } else {
          const kept = r.kept > 0 ? `, ${r.kept} of your own left alone` : ''
          setKitMsg(`${touched} of ${r.pieces} pieces painted${kept}.`)
        }
      })
      .catch((e) => setKitMsg(`Could not generate: ${e instanceof Error ? e.message : String(e)}`))
  }

  const assignments = useProjectStore((s) => s.project?.textureAssignments)
  const kitPainted = useMemo(() => {
    const family = oreFamily(element)
    const pieces = family ? [...family.tools, ...family.armor] : []
    const missing = pieces.filter((n) => !assignments?.[`item/${n}`]).length
    return { total: pieces.length, missing }
  }, [assignments, element])

  const allElements = useProjectStore((s) => s.project?.elements)
  const kitCollisions = useMemo(() => {
    const family = oreFamily(element)
    if (!family) return []
    const mine = [...(family.dropsItem ? [family.base] : []), ...family.tools, ...family.armor]
    const taken = new Set<string>()
    for (const other of allElements ?? []) {
      if (other.id === element.id) continue
      taken.add(other.name)
      for (const entry of elementRegistryEntries(other)) taken.add(entry.registryName)
    }
    return mine.filter((n) => taken.has(n))
  }, [allElements, element])

  const steps: WizardStep[] = [
    {
      id: 'drops',
      title: 'Drops',
      desc: 'What mining this ore gives the player.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Drop">
              <Select
                value={p.dropMode}
                onChange={(v) => patch('dropMode', v as OreProps['dropMode'])}
                options={[
                  { value: 'item', label: 'A raw material item' },
                  { value: 'block', label: 'The ore block itself' }
                ]}
              />
            </Field>
            {p.dropMode === 'item' && (
              <Field label="Material Item" hint={`Creates the item "${baseName}" for you.`}>
                <TextInput
                  mono
                  value={p.dropItemName}
                  onChange={(v) => patch('dropItemName', v)}
                  placeholder={element.name.replace(/_ore$/, '')}
                />
              </Field>
            )}
          </div>
          {p.dropMode === 'item' && (
            <p className="text-2xs leading-relaxed text-mist-600">
              The material item is made automatically. Don't create it as a separate element. It
              already shows up in recipe and drop pickers under "This Mod".
            </p>
          )}
        </>
      )
    },
    {
      id: 'kit',
      title: 'Tools & Armor',
      desc: 'Optionally auto-generate a full gear set from this material.',
      content: (
        <>
          <Switch
            checked={p.generateSet}
            onChange={(v) => {
              patch('generateSet', v)

              if (v) runKitGen(false)
            }}
            label="Auto-generate tools & armor"
            hint={`Creates ${baseName}_sword, _pickaxe, _axe, _shovel, _hoe and _helmet, _chestplate, _leggings, _boots.`}
          />

          <AnimatePresence initial={false}>
            {p.generateSet && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-1">
                  <div className="flex items-start gap-2 rounded-md bg-gold-500/10 p-3">
                    <Sparkles size={13} className="mt-px shrink-0 text-gold-400" />
                    <p className="text-2xs leading-relaxed text-gold-300">
                      All nine pieces are created for you: entries in the sidebar and item
                      pickers, plus textures baked from your material's color, each editable on
                      its own. Never make them by hand.
                    </p>
                  </div>

                  <KitTextures
                    element={element}
                    accent={kitAccent}
                    onAccent={setKitAccent}
                    onGenerate={() => runKitGen(true)}
                    message={kitMsg}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Switch checked={set.tools} onChange={(v) => patchSet('tools', v)} label="Tool set" />
                    <Switch checked={set.armor} onChange={(v) => patchSet('armor', v)} label="Armor set" />
                  </div>

                  {set.tools && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Durability">
                        <NumberInput value={set.durability} onChange={(v) => patchSet('durability', v)} min={1} />
                      </Field>
                      <Field label="Mining Speed">
                        <NumberInput value={set.efficiency} onChange={(v) => patchSet('efficiency', v)} min={1} step={0.5} />
                      </Field>
                      <Field label="Mining Level" hint="0 wood · 1 stone · 2 iron · 3 diamond">
                        <NumberInput value={set.miningLevel} onChange={(v) => patchSet('miningLevel', v)} min={0} max={4} />
                      </Field>
                      <Field label="Attack Damage">
                        <NumberInput value={set.damage} onChange={(v) => patchSet('damage', v)} min={0} />
                      </Field>
                    </div>
                  )}

                  {set.armor && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Armor Durability">
                        <NumberInput value={set.armorDurability} onChange={(v) => patchSet('armorDurability', v)} min={1} />
                      </Field>
                      <Field label="Melee Protection" hint="0 to 1">
                        <NumberInput
                          value={set.totalProtection}
                          onChange={(v) => patchSet('totalProtection', v)}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                      </Field>
                      <Field label="Blast Protection" hint="0 to 1">
                        <NumberInput value={set.blastProtection} onChange={(v) => patchSet('blastProtection', v)} min={0} max={1} step={0.05} />
                      </Field>
                      <Field label="Fire Protection" hint="0 to 1">
                        <NumberInput value={set.fireProtection} onChange={(v) => patchSet('fireProtection', v)} min={0} max={1} step={0.05} />
                      </Field>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )
    },
    {
      id: 'paint',
      title: 'Textures',
      desc: 'The ore block, its drop, and any generated gear each get a texture.',
      content: (
        <>
          <TextureLayoutSelect p={p as BlockProps} patch={blockPatch} />
          <TextureStrip element={element} />
        </>
      )
    },
    {
      id: 'world',
      title: 'World Gen',
      desc: 'How the world grows veins of this ore.',
      content: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vein Size">
            <NumberInput value={p.veinSize} onChange={(v) => patch('veinSize', v)} min={1} max={64} />
          </Field>
          <Field label="Veins per Chunk">
            <NumberInput value={p.veinsPerChunk} onChange={(v) => patch('veinsPerChunk', v)} min={0} max={64} />
          </Field>
          <Field label="Min Y">
            <NumberInput value={p.minY} onChange={(v) => patch('minY', v)} />
          </Field>
          <Field label="Max Y">
            <NumberInput value={p.maxY} onChange={(v) => patch('maxY', v)} />
          </Field>
        </div>
      )
    },
    {
      id: 'material',
      title: 'Material',
      desc: 'How tough the ore block is to break.',
      content: <MaterialFeelFields p={p as BlockProps} patch={blockPatch} />
    },
    {
      id: 'mining',
      title: 'Mining',
      desc: 'Which tools work on it.',
      content: <MiningFields p={p as BlockProps} patch={blockPatch} showDrops={false} />
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Gear textures painted',
      ok: kitPainted.missing === 0,
      detail: `${kitPainted.missing} of ${kitPainted.total} pieces still need a texture. Generate them in the Tools & Armor step.`,
      stepId: 'kit'
    },
    {
      label: 'Generated names are free',
      ok: kitCollisions.length === 0,
      detail: `${kitCollisions.join(', ')} already exist elsewhere in the mod. Change the material item name, or delete the hand-made duplicates.`,
      stepId: 'drops'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}

function KitTextures(props: {
  element: ArtemisElement
  accent: string
  onAccent: (v: string) => void
  onGenerate: () => void
  message: string | null
}): JSX.Element {
  const textures = useProjectStore((s) => s.project?.textures)
  const assignments = useProjectStore((s) => s.project?.textureAssignments)
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)

  const family = oreFamily(props.element)
  const pieces = family ? [...family.tools, ...family.armor] : []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className="relative h-7 w-9 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
          style={{ background: props.accent }}
          title="Material color the gear is baked from"
        >
          <input
            type="color"
            className="absolute inset-0 h-full w-full opacity-0"
            value={props.accent}
            onChange={(e) => props.onAccent(e.target.value)}
          />
        </label>
        <span className="shrink-0 text-2xs text-mist-500">Material color</span>
        <button
          onClick={props.onGenerate}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
        >
          <Wand2 size={12} /> Generate gear textures
        </button>
      </div>

      {props.message && (
        <p className="text-2xs leading-snug text-mist-500">{props.message}</p>
      )}

      {pieces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pieces.map((name) => {
            const id = assignments?.[`item/${name}`]
            const tex = id ? textures?.find((t) => t.id === id) : undefined
            return (
              <button
                key={name}
                title={tex ? `${name} (click to edit)` : `${name} has no texture yet`}
                onClick={() =>
                  openTextureEditor(
                    tex
                      ? { textureId: tex.id }
                      : { textureId: null, kind: 'item', assignSlotAfter: `item/${name}`, suggestedName: name }
                  )
                }
                className="relative h-10 w-10 overflow-hidden rounded-md bg-ink-900/60 shadow-panel transition-all hover:z-10 hover:shadow-glow-gold"
              >
                {tex ? (
                  <img
                    src={tex.data}
                    alt={name}
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                ) : (
                  <span className="absolute inset-0 m-auto flex items-center justify-center text-[9px] text-mist-600">
                    ?
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
