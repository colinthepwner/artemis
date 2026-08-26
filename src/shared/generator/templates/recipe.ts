import type { ArtemisElement } from '../../project'
import { RECIPE_DEFAULTS, type RecipeProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export function emitRecipe(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...RECIPE_DEFAULTS, ...(el.properties as Partial<RecipeProps>) }
  const r = ctx.mapping.recipes

  const scratch = new JavaWriter('scratch', ctx.mapping.imports)
  const output = ctx.stackExpr(p.output, p.outputCount, scratch)
  const lines: string[] = []

  if (p.recipeType === 'shaped') {
    const symbols = new Map<string, string>()
    const rows: string[] = []
    for (let row = 0; row < 3; row++) {
      let s = ''
      for (let col = 0; col < 3; col++) {
        const ref = (p.grid[row * 3 + col] ?? '').trim()
        if (!ref) {
          s += ' '
          continue
        }
        if (!symbols.has(ref)) symbols.set(ref, String.fromCharCode(65 + symbols.size))
        s += symbols.get(ref)
      }
      rows.push(s)
    }

    while (rows.length > 1 && rows[rows.length - 1].trim() === '') rows.pop()

    lines.push(render(r['shapedOpen'], {}))
    lines.push(render(r['shapedRow'], { rows: rows.map((row) => `"${row}"`).join(', ') }))
    for (const [ref, char] of symbols) {
      lines.push(render(r['shapedSymbol'], { char, stack: ctx.stackExpr(ref, 1, scratch) }))
    }
    lines.push(render(r['shapedBuild'], { recipeName: el.name, output }))
  } else if (p.recipeType === 'shapeless') {
    lines.push(render(r['shapelessOpen'], {}))
    for (const ref of p.inputs.filter((i) => i.trim())) {
      lines.push(render(r['shapelessInput'], { stack: ctx.stackExpr(ref, 1, scratch) }))
    }
    lines.push(render(r['shapelessBuild'], { recipeName: el.name, output }))
  } else {
    const input = ctx.stackExpr(p.inputs[0] ?? '', 1, scratch)
    lines.push(render(r['furnace'], { recipeName: el.name, input, output }))
  }

  return { recipeCalls: [lines.join('\n')] }
}
