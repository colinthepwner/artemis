export const TEXTURE_SIZE = 16

function centredSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h)
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side }
}

export async function fileToTexture(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await load(url, file.name)
    const canvas = document.createElement('canvas')
    canvas.width = TEXTURE_SIZE
    canvas.height = TEXTURE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This machine would not give the importer a canvas to draw on.')

    const { sx, sy, side } = centredSquare(image.width, image.height)

    const exactUpscale = side % TEXTURE_SIZE === 0
    ctx.imageSmoothingEnabled = !exactUpscale
    if (!exactUpscale) ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, sx, sy, side, side, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function load(url: string, name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error(`"${name}" could not be read as an image. Try a png, jpeg, gif or webp.`))
    image.src = url
  })
}
