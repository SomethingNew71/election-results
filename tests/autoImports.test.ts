import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanExports } from 'unimport'
import { describe, expect, it } from 'vitest'

const DIRS = ['shared/utils', 'app/composables']

describe('auto-imports', () => {
  const files = DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)))

  // Nuxt's scan can lose an export after a one-line object literal; see CLAUDE.md.
  it.each(files)('scans every export of %s', async (path) => {
    const declared = [...readFileSync(path, 'utf8').matchAll(/^export (?:async )?(?:const|function|class) (\w+)/gm)].map((m) => m[1])
    const scanned = (await scanExports(path, false)).map((i) => i.name)
    expect(scanned.sort()).toEqual(declared.sort())
  })
})
