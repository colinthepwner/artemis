export interface TextureIds {

  atlas: Set<string>

  entity: Set<string>
}

export function collectTextureIds(modelSrc: string, allJava: string): TextureIds {
  const ids = new Set<string>()

  const collect = (text: string, re: RegExp): void => {
    for (const line of text.split('\n')) {
      if (!re.test(line)) continue
      for (const m of line.matchAll(/"([a-z0-9_.-]+):([a-z0-9_/.-]+)"/g)) {
        ids.add(`${m[1]}:${m[2]}`)
      }
    }
  }

  collect(modelSrc, /BlockModel|ItemModel/)

  collect(allJava, /\bnew\s+Item[A-Za-z]*(<>)?\(/)

  const entity = new Set<string>()
  for (const m of allJava.matchAll(/setTextureIdentifier\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)) {
    entity.add(`${m[1]}:entity/${m[2]}/0`)
  }

  return { atlas: ids, entity }
}
