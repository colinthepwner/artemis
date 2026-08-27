import type { EmitContext } from './CodeGenerator'
import type { JavaWriter } from './template'

export const VANILLA_BIOME_PREFIX = 'biome:'

export function biomeExpr(ref: string, ctx: EmitContext): string | null {
  const t = ref.trim()
  if (!t) return null
  if (t.startsWith(VANILLA_BIOME_PREFIX)) return `Biomes.${t.slice(VANILLA_BIOME_PREFIX.length)}`
  const el = ctx.project.elements.find((e) => e.name === t && e.kind === 'biome')

  return el ? `ModBiomes.${ctx.fieldOf(el.name)}` : null
}

export function biomeGuard(refs: string[] | undefined, ctx: EmitContext): string {
  const exprs = (refs ?? []).map((r) => biomeExpr(r, ctx)).filter((e): e is string => Boolean(e))
  if (exprs.length === 0) return ''
  const test = exprs.map((e) => `biome != ${e}`).join(' && ')
  return (
    '\t\t\tBiome biome = this.world.getBlockBiome(new TilePos(x, y, z));\n' +
    `\t\t\tif (${test}) continue;\n`
  )
}

export function treeGroundRefs(refs: string[] | undefined, ctx: EmitContext): string[] {
  const listed = (refs ?? []).map((r) => r.trim()).filter(Boolean)
  const claimed = listed.filter((r) => !r.startsWith(VANILLA_BIOME_PREFIX))
  const biomes = ctx.project.elements.filter((el) => el.kind === 'biome')
  const wanted = listed.length === 0 ? biomes : biomes.filter((el) => claimed.includes(el.name))
  return [
    ...new Set(
      wanted
        .map((el) => String((el.properties as { topBlock?: string }).topBlock ?? '').trim())
        .filter(Boolean)
    )
  ]
}

export function extraGroundTest(refs: string[], w: JavaWriter, ctx: EmitContext): string {
  return refs.map((ref) => ` && groundId != ${ctx.blockExpr(ref, w)}.id()`).join('')
}
