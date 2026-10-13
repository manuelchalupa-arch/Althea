import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const srcDir = join(process.cwd(), 'src')

function collect(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      out.push(...collect(full))
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('no material symbols in runtime code', () => {
  it('does not reference material-symbols-outlined in production sources', () => {
    const matches: string[] = []
    for (const file of collect(srcDir)) {
      if (readFileSync(file, 'utf8').includes('material-symbols-outlined')) {
        matches.push(relative(srcDir, file))
      }
    }
    expect(matches).toEqual([])
  })
})
