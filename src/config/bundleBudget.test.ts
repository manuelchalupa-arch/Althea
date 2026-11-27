/**
 * Presupuesto de bundle del arranque.
 *
 * Objetivo T032: mantener el JS inicial por debajo de 152 KB gzip.
 * Última medición CI: 151.6 KB. El límite sigue siendo estrecho y evita que
 * vuelvan a entrar en el arranque los módulos pesados del Coach o Firebase.
 *
 * Qué protege:
 *   1. Que App.tsx NO vuelva a importar estáticamente nada que arrastre el
 *      subsistema de IA. Ese fue el defecto real: `import ChatWidget from ...`
 *      estático metía en el chunk inicial toda la cadena
 *      chatService → unifiedPipeline → systemPrompt → contextBuilder →
 *      *MethodsDB (~150 KB raw) que el primer render no usa.
 *   2. Que el set inicial realmente declarado en dist/index.html no crezca
 *      por encima del presupuesto.
 *
 * El punto 2 depende de `dist/`. En CI (variable CI=true) es OBLIGATORIO:
 * el workflow compila ANTES de correr los tests, así que un dist/ ausente es
 * un fallo, no un skip. En una corrida local sin build se informa y se omite
 * para no bloquear pruebas parciales (motivo explícito de la excepción).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import zlib from 'node:zlib'

const ROOT = resolve(__dirname, '..', '..')
const APP = resolve(ROOT, 'src/App.tsx')
const BUDGET_INITIAL_JS_GZIP = 152 * 1024
const REQUIRE_DIST = Boolean(process.env.CI)

describe('budget de bundle: invariantes de código', () => {
  const src = readFileSync(APP, 'utf8')
  const staticImports = [...src.matchAll(/^import\s+[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

  it('App.tsx no importa estáticamente ChatWidget', () => {
    // Un import estático aquí reintroduce ~150 KB de IA en el arranque.
    expect(staticImports).not.toContain('@/components/chat/ChatWidget')
  })

  it('App.tsx no importa estáticamente el subsistema de IA', () => {
    const aiChain = [
      '@/services/ai/chatService',
      '@/services/ai/aiService',
      '@/services/ai/unifiedPipeline',
      '@/services/ai/systemPrompt',
      '@/services/ai/contextBuilder',
      '@/services/ai/nutritionMethodsDB',
      '@/services/ai/trainingMethodsDB',
    ]
    const found = aiChain.filter((m) => staticImports.includes(m))
    expect(found, `imports estáticos de IA en App.tsx: ${found.join(', ')}`).toEqual([])
  })

  it('las páginas siguen usando lazy() (no regresión a import estático)', () => {
    const staticPages = staticImports.filter((i) => i.startsWith('@/pages/'))
    expect(staticPages, `páginas importadas estáticamente: ${staticPages.join(', ')}`).toEqual([])
  })

  it('ChatWidget se carga con lazy() y está envuelto en Suspense', () => {
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]@\/components\/chat\/ChatWidget['"]\)/)
    // Si Pages entrega un manifiesto viejo, solo se reintenta una vez.
    expect(src).toContain("CHAT_CHUNK_RETRY_KEY")
    expect(src).toContain("sessionStorage.setItem(CHAT_CHUNK_RETRY_KEY, '1')")
    expect(src).toContain("window.location.reload()")
    // Un lazy() sin Suspense lanzaría al montar el FAB.
    const idx = src.indexOf('<ChatWidget/>')
    expect(idx, 'no se encontró <ChatWidget/> en App.tsx').toBeGreaterThan(-1)
    expect(src.slice(Math.max(0, idx - 300), idx)).toContain('<Suspense')
  })
})

describe('budget de bundle: set inicial servido', () => {
  const dist = resolve(ROOT, 'dist')
  const indexHtml = resolve(dist, 'index.html')

  it('initial JS gzip < 150 KB', () => {
    if (!existsSync(indexHtml)) {
      if (REQUIRE_DIST) {
        throw new Error('CI: falta dist/index.html. El workflow debe compilar (`npm run build`) antes de los tests.')
      }
      console.warn('dist/ ausente: ejecuta `npm run build` para medir el presupuesto real.')
      return
    }

    const html = readFileSync(indexHtml, 'utf8')
    const declared = [
      ...[...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]),
    ]

    let total = 0
    const parts = []
    for (const name of new Set(declared)) {
      const file = resolve(dist, 'assets', name)
      if (!existsSync(file)) continue
      const gz = zlib.gzipSync(readFileSync(file), { level: 9 }).length
      total += gz
      parts.push(`${name} ${(gz / 1024).toFixed(1)}KB`)
    }

    expect(parts.length, 'no se encontró ningún JS inicial').toBeGreaterThan(0)
    const kb = (total / 1024).toFixed(1)
    expect(
      total,
      `initial JS = ${kb} KB gzip (presupuesto 150 KB)\n  ${parts.join('\n  ')}`,
    ).toBeLessThan(BUDGET_INITIAL_JS_GZIP)
  })

  it('Firebase NO está en el set inicial (debe diferirse)', () => {
    if (!existsSync(indexHtml)) {
      if (REQUIRE_DIST) {
        throw new Error('CI: falta dist/index.html. No se puede verificar el diferido de Firebase.')
      }
      return
    }
    const html = readFileSync(indexHtml, 'utf8')
    const declared = [
      ...[...html.matchAll(/(?:src|href)="\/assets\/(vendor-firebase[^"]+\.js)"/g)].map((m) => m[1]),
    ]
    expect(
      declared,
      'el SDK de Firebase está en el arranque; debería cargarse bajo demanda',
    ).toEqual([])
  })
})
