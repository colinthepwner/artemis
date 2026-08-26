const os = require('os')
module.exports = {
  app: { getPath: () => os.tmpdir() },
  dialog: {},
  ipcMain: { handle() {}, on() {} },
  shell: { openPath() {} }
}
