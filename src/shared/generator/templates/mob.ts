import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { MOB_DEFAULTS, type MobProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase } from './block'
import { biomeExpr } from '../biomeFilter'

export function mobClasses(registryName: string): { entity: string; renderer: string } {
  const pascal = toPascalCase(registryName)
  return { entity: `Entity${pascal}`, renderer: `MobRenderer${pascal}` }
}

export function emitMob(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...MOB_DEFAULTS, ...(el.properties as Partial<MobProps>) }
  const names = mobClasses(el.name)
  const mm = ctx.mapping.mob
  const shape = mm.shapes[p.shape] ?? mm.shapes['humanoid']

  const entityWriter = new JavaWriter(`${ctx.pkg}.entity`, ctx.mapping.imports)
  entityWriter.use('World', p.hostile ? 'MobMonster' : 'MobAnimal')

  const ctorExtra: string[] = []
  if (p.hostile) {
    ctorExtra.push(render(mm.attackLine, { attackDamage: Math.max(1, Math.round(p.attackDamage)) }))
  }
  const dropRef = p.dropItem.trim()
  if (dropRef) {
    entityWriter.use('WeightedRandomLootObject')
    ctorExtra.push(
      render(mm.dropLine, {
        stack: ctx.stackExpr(dropRef, 1, entityWriter),
        dropCountMax: Math.max(1, p.dropCountMax)
      })
    )
  }

  entityWriter.block(
    render(mm.classTemplate, {
      className: names.entity,
      extends: p.hostile ? mm.hostileExtends : mm.passiveExtends,
      width: shape.width,
      height: shape.height,
      moveSpeed: p.moveSpeed,
      modId: ctx.meta.modId,
      registryName: el.name,
      health: Math.max(1, Math.round(p.health)),
      ctorExtra: ctorExtra.length ? ctorExtra.join('\n') + '\n' : ''
    })
  )

  const rendererWriter = new JavaWriter(`${ctx.pkg}.client`, ctx.mapping.imports)
  rendererWriter.useRaw(`import ${ctx.pkg}.entity.${names.entity};`)
  rendererWriter.block(
    render(mm[shape.renderer], {
      className: names.renderer,
      entityClass: names.entity,
      shadowSize: shape.shadowSize,
      geometry: shape.geometry
    })
  )

  const reg = render(ctx.mapping.entity.decl, {
    className: names.entity,
    registryName: el.name
  })

  const spawnCalls: string[] = []
  const weight = Math.max(0, Math.round(p.spawnWeight))
  if (weight > 0) {
    const refs = (p.spawnBiomes ?? []).map((r) => r.trim()).filter(Boolean)
    const vars = { entityClass: names.entity, weight, hostile: String(p.hostile) }
    if (refs.length === 0) {
      spawnCalls.push(render(ctx.mapping.entity.spawnAllCall, vars))
    } else {
      for (const ref of refs) {
        const biome = biomeExpr(ref, ctx)
        if (biome) spawnCalls.push(render(ctx.mapping.entity.spawnCall, { ...vars, biome }))
      }
    }
  }

  return {
    entityRegs: [reg],
    spawnCalls,
    entityModels: [
      render(ctx.mapping.models.entity, {
        entityClass: names.entity,
        rendererClass: names.renderer
      })
    ],

    langLines: [`entity.${ctx.meta.modId}.${el.name}.name=${p.displayName || titleCase(el.name)}`],
    files: [
      { relPath: `entity/${names.entity}.java`, writer: entityWriter },
      { relPath: `client/${names.renderer}.java`, writer: rendererWriter }
    ]
  }
}
