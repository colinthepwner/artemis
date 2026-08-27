const os = require('os')
const { decodePng, encodePng } = require('./_canvas')

function image(rgba, width, height) {
  return {
    isEmpty: () => width === 0 || height === 0,
    getSize: () => ({ width, height }),
    toPNG: () => encodePng(width, height, rgba),
    toBitmap: () => {
      const bgra = Buffer.alloc(rgba.length)
      for (let i = 0; i < rgba.length; i += 4) {
        bgra[i] = rgba[i + 2]
        bgra[i + 1] = rgba[i + 1]
        bgra[i + 2] = rgba[i]
        bgra[i + 3] = rgba[i + 3]
      }
      return bgra
    }
  }
}

const EMPTY = image(new Uint8Array(0), 0, 0)

module.exports = {
  app: {

    getPath: (name) =>
      name === 'home' ? os.homedir() : process.env.ARTEMIS_TEST_USERDATA || os.tmpdir()
  },
  dialog: {},
  ipcMain: { handle() {}, on() {} },
  shell: { openPath() {} },
  nativeImage: {
    createFromDataURL(dataUrl) {
      try {
        const base64 = String(dataUrl).slice(String(dataUrl).indexOf(',') + 1)
        const { width, height, rgba } = decodePng(Buffer.from(base64, 'base64'))
        return image(rgba, width, height)
      } catch {

        return EMPTY
      }
    },
    createFromBitmap(bgra, { width, height }) {
      const rgba = new Uint8Array(bgra.length)
      for (let i = 0; i < bgra.length; i += 4) {
        rgba[i] = bgra[i + 2]
        rgba[i + 1] = bgra[i + 1]
        rgba[i + 2] = bgra[i]
        rgba[i + 3] = bgra[i + 3]
      }
      return image(rgba, width, height)
    }
  }
}
