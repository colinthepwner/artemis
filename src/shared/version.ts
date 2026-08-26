export function versionCore(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionCore(candidate)
  const b = versionCore(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}
