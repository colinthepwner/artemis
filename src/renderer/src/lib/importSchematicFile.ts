import { parseSchematic } from '@shared/schematic'
import { describeImport, importSchematic, type SchematicImport } from '@shared/schematicImport'
import { isGzip } from '@shared/nbt'
import { HALF, MAX_Y } from '@/components/workshop/voxel'

export interface LoadedSchematic {

  name: string
  result: SchematicImport

  summary: string
}

export async function loadSchematicFile(file: File, btaVersion: string): Promise<LoadedSchematic> {
  const raw = new Uint8Array(await file.arrayBuffer())
  if (raw.length === 0) throw new Error(`"${file.name}" is empty.`)

  const bytes = isGzip(raw) ? await gunzip(raw) : raw

  const schematic = parseSchematic(bytes)
  const result = importSchematic(schematic, btaVersion, { half: HALF, maxY: MAX_Y })
  if (result.placed === 0) {
    throw new Error(
      result.unknown.length > 0
        ? `Nothing in "${file.name}" is a block this game has. ${describeImport(result)}`
        : `"${file.name}" parsed, but there is nothing solid in it.`
    )
  }
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    result,
    summary: describeImport(result)
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    throw new Error('That file says it is compressed but could not be unpacked.')
  }
}
