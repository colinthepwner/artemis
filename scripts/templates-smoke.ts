import { TREE_TEMPLATES } from '../src/renderer/src/components/workshop/treeTemplates'
import { HALF, MAX_Y, parseKey } from '../src/renderer/src/components/workshop/voxel'

let failures = 0
const fail = (msg: string): void => {
  console.error(`FAIL: ${msg}`)
  failures++
}

for (const t of TREE_TEMPLATES) {
  for (const seed of [1, 7, 42, 999, 123456]) {
    const a = t.build(seed)
    const b = t.build(seed)
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${t.id} seed ${seed}: not deterministic`)

    const trunk = new Set(a.trunk)
    const leaves = new Set(a.leaves)
    if (trunk.size === 0) fail(`${t.id} seed ${seed}: no trunk at all`)
    for (const k of leaves) if (trunk.has(k)) fail(`${t.id} seed ${seed}: cell ${k} is both halves`)

    let anchored = false
    for (const k of [...trunk, ...leaves]) {
      const { x, y, z } = parseKey(k)
      if (x < -HALF || x > HALF || z < -HALF || z > HALF || y < 0 || y > MAX_Y)
        fail(`${t.id} seed ${seed}: ${k} out of bounds`)
      if (y === 0) anchored = true
    }
    if (!anchored) fail(`${t.id} seed ${seed}: nothing on the ground, floats when placed`)

    const total = trunk.size + leaves.size
    if (total > 1600) fail(`${t.id} seed ${seed}: ${total} cells, preview cap is 1600`)
    if (total < 3) fail(`${t.id} seed ${seed}: only ${total} cells, hardly a shape`)
  }
  const sample = t.build(7)
  console.log(
    `${t.id.padEnd(16)} trunk ${String(sample.trunk.length).padStart(4)}  leaves ${String(sample.leaves.length).padStart(4)}`
  )
}

if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('TEMPLATES PASS')
