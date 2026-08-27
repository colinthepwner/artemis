import { createWriteStream } from 'fs'
import { get } from 'https'

export function download(url: string, dest: string, onProgress: (pct: number) => void, hops = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects downloading Gradle'))
    const req = get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        download(res.headers.location, dest, onProgress, hops + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} downloading Gradle`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let got = 0
      let lastPct = -10
      const out = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        got += chunk.length
        if (total > 0) {
          const pct = Math.floor((got / total) * 100)
          if (pct >= lastPct + 10) {
            lastPct = pct
            onProgress(pct)
          }
        }
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      res.on('error', reject)
      out.on('error', reject)
    })
    req.on('error', reject)
  })
}
