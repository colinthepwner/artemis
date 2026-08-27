import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import { SCENARIOS } from './audit-fixtures'

const [, , want, pathFilter] = process.argv
if (!want) {
  console.log('scenarios:')
  for (const s of SCENARIOS) console.log('  ' + s.name)
  process.exit(0)
}

const scenario = SCENARIOS.find((s) => s.name.includes(want))
if (!scenario) {
  console.error(`no scenario matching "${want}"`)
  process.exit(2)
}

const files = new CodeGenerator(scenario.build()).generate()
for (const f of files) {
  if (pathFilter && !f.path.includes(pathFilter)) continue
  console.log(`\n======================================================================`)
  console.log(f.path)
  console.log(`======================================================================`)
  console.log(f.content)
}
if (!pathFilter) {
  console.log('\nfiles:')
  for (const f of files) console.log('  ' + f.path)
}
