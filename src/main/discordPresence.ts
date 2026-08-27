import { app, ipcMain } from 'electron'
import { createConnection, type Socket } from 'net'
import { get } from 'https'
import { join } from 'path'
import { IPC, type PresenceState } from '../shared/ipc'

const DISCORD_APP_ID = '1542265473008402542'

const LARGE_IMAGE = 'logo'

const APP_LOOKUP = `https://discord.com/api/v10/oauth2/applications/${DISCORD_APP_ID}/rpc`

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
const OP_PING = 3
const OP_PONG = 4

const RETRY_MS = 30_000

function pipePath(index: number): string {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`
  const base =
    process.env['XDG_RUNTIME_DIR'] ??
    process.env['TMPDIR'] ??
    process.env['TMP'] ??
    process.env['TEMP'] ??
    '/tmp'
  return join(base, `discord-ipc-${index}`)
}

function appIconUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = get(APP_LOOKUP, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return resolve(null)
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          const icon = (JSON.parse(body) as { icon?: string | null }).icon
          resolve(icon ? `https://cdn.discordapp.com/app-icons/${DISCORD_APP_ID}/${icon}.png` : null)
        } catch {
          resolve(null)
        }
      })
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))

    req.setTimeout(8000, () => {
      req.destroy()
      resolve(null)
    })
  })
}

function encode(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

function detailsFor(state: PresenceState): string {
  const head = `Modding BTA ${state.btaVersion} with Artemis.`

  return state.projectName ? `${head} | ${state.projectName}` : head
}

class Presence {
  private socket: Socket | null = null
  private inbox = Buffer.alloc(0)
  private ready = false
  private connecting = false
  private retry: NodeJS.Timeout | null = null
  private nonce = 0

  private state: PresenceState = { enabled: false, projectName: null, btaVersion: '' }

  private since = Date.now()

  private imageUrl: string | null = null
  private imageResolved = false

  update(next: PresenceState): void {
    const was = this.state
    this.state = next

    if (!next.enabled) {
      this.disconnect()
      return
    }

    if (!was.enabled) this.since = Date.now()
    if (this.ready) this.publish()
    else this.connect()
  }

  private clearRetry(): void {
    if (this.retry) {
      clearTimeout(this.retry)
      this.retry = null
    }
  }

  private scheduleRetry(): void {
    if (this.retry || !this.state.enabled) return
    this.retry = setTimeout(() => {
      this.retry = null
      this.connect()
    }, RETRY_MS)
  }

  disconnect(): void {
    this.clearRetry()
    this.ready = false
    this.connecting = false
    this.inbox = Buffer.alloc(0)
    const socket = this.socket
    this.socket = null
    if (!socket) return

    try {
      socket.write(encode(OP_CLOSE, {}))
    } catch {

    }
    socket.destroy()
  }

  private connect(index = 0): void {
    if (this.connecting || this.ready || !this.state.enabled) return
    if (index > 9) {

      this.connecting = false
      this.scheduleRetry()
      return
    }
    this.connecting = true

    let established = false
    const socket = createConnection(pipePath(index))
    socket.on('error', () => {
      socket.destroy()
      if (this.socket === socket) this.socket = null
      this.connecting = false
      this.ready = false
      if (established) this.scheduleRetry()
      else this.connect(index + 1)
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.ready = false
      this.connecting = false
      this.inbox = Buffer.alloc(0)
      this.scheduleRetry()
    })
    socket.on('connect', () => {
      established = true
      this.socket = socket
      this.connecting = false
      socket.write(encode(OP_HANDSHAKE, { v: 1, client_id: DISCORD_APP_ID }))
    })
    socket.on('data', (chunk) => this.receive(socket, chunk))
  }

  private receive(socket: Socket, chunk: Buffer): void {
    this.inbox = Buffer.concat([this.inbox, chunk])

    while (this.inbox.length >= 8) {
      const op = this.inbox.readInt32LE(0)
      const len = this.inbox.readInt32LE(4)
      if (this.inbox.length < 8 + len) break
      const body = this.inbox.subarray(8, 8 + len).toString('utf8')
      this.inbox = this.inbox.subarray(8 + len)

      if (op === OP_PING) {
        try {
          socket.write(encode(OP_PONG, JSON.parse(body)))
        } catch {

        }
        continue
      }
      if (op === OP_CLOSE) {
        this.disconnect()
        this.scheduleRetry()
        continue
      }
      if (op !== OP_FRAME) continue

      try {
        const msg = JSON.parse(body) as {
          evt?: string
          cmd?: string
          data?: { assets?: { large_image?: string } } | null
        }
        if (msg.evt === 'READY') {
          this.ready = true
          this.publish()
        } else if (msg.cmd === 'SET_ACTIVITY' && msg.data) {

          if (!msg.data.assets?.large_image) this.findAnotherImage()
        }
      } catch {

      }
    }
  }

  private findAnotherImage(): void {
    if (this.imageResolved) return
    this.imageResolved = true
    void appIconUrl().then((url) => {
      if (!url || !this.state.enabled) return
      this.imageUrl = url
      this.publish()
    })
  }

  private publish(): void {
    const socket = this.socket
    if (!socket || !this.ready || !this.state.enabled) return
    const payload = {
      cmd: 'SET_ACTIVITY',

      args: {
        pid: process.pid,
        activity: {
          details: detailsFor(this.state),
          assets: { large_image: this.imageUrl ?? LARGE_IMAGE, large_text: 'Artemis' },
          timestamps: { start: this.since }
        }
      },
      nonce: String(++this.nonce)
    }
    try {
      socket.write(encode(OP_FRAME, payload))
    } catch {

      this.disconnect()
      this.scheduleRetry()
    }
  }
}

const presence = new Presence()

export function registerPresenceIpc(): void {
  ipcMain.on(IPC.PresenceUpdate, (_e, state: PresenceState) => {
    presence.update({
      enabled: Boolean(state?.enabled),
      projectName: typeof state?.projectName === 'string' ? state.projectName : null,
      btaVersion: typeof state?.btaVersion === 'string' ? state.btaVersion : ''
    })
  })

  app.on('before-quit', () => presence.disconnect())
}
