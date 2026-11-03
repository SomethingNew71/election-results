import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(e.name) ? [path] : []
  })
}

describe('auto-imports', () => {
  // Nuxt's export scan misses STATUS_LABEL, so it is undefined unless imported by name.
  it('imports STATUS_LABEL by name wherever it is used', () => {
    const missing = sourceFiles('app').filter((path) => {
      const src = readFileSync(path, 'utf8')
      return /\bSTATUS_LABEL\b/.test(src) && !/import \{[^}]*\bSTATUS_LABEL\b[^}]*\} from/.test(src)
    })
    expect(missing).toEqual([])
  })
})
