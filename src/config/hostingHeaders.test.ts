/**
 * Guard de coherencia entre la CSP de Firebase Hosting y los origins que la
 * app realmente contacta en runtime.
 *
 * Por qué existe: una CSP es una lista de origins permitidos. Si la app
 * consulta un origin que no está en `connect-src`, el navegador lo bloquea en
 * silencio — sin error de compilación, sin aviso de Vite, sin fallo de tests.
 * La rotura sólo aparece en el entorno desplegado, y en el caso de WGER o de
 * la nutrición se manifiesta como "no me sincroniza" / "no me busca
 * alimentos", que es difícil de atribuir a la CSP.
 *
 * Este test convierte esa rotura silenciosa en un fallo de CI. Es un guard de
 * coherencia, NO una prueba de que la CSP funcione en un navegador real: eso
 * requiere staging (STAGING-VALIDATED).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')
const FIREBASE_JSON = resolve(ROOT, 'firebase.json')
const INDEX_HTML = resolve(ROOT, 'index.html')

interface FirebaseConfig {
  hosting: {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  }
}

function readCsp(): string {
  const config = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8')) as FirebaseConfig
  // La CSP debe estar en el bloque `**`, NO sólo en `/index.html`.
  //
  // Motivo: una petición a `/` se sirve desde index.html, pero las cabeceras
  // de Firebase Hosting se asocian a la RUTA pedida. Si la CSP viviera sólo
  // en `/index.html`, la carga inicial de la app (que se pide como `/`) podría
  // servirse sin CSP. Ponerla en `**` la garantiza en cualquier caso; el
  // navegador ignora la CSP en respuestas que no son documentos, así que no
  // afecta a los assets.
  const global = config.hosting.headers?.find((h) => h.source === '**')
  const csp = global?.headers.find((h) => h.key === 'Content-Security-Policy')?.value
  expect(csp, 'debe existir una CSP en el bloque ** de firebase.json').toBeTruthy()
  return csp as string
}

function directive(csp: string, name: string): string[] {
  const match = csp.match(new RegExp(`${name}\\s+([^;]+)`))
  if (!match) return []
  return match[1].trim().split(/\s+/).filter(Boolean)
}

/** ¿Este source token cubre a este host? Soporta comodines de subdominio. */
function covers(sources: string[], host: string): boolean {
  return sources.some((src) => {
    if (src === "'self'") return false
    // Se escapan las partes literales y se recompone el patrón con el
    // comodín como un segmento de subdominio válido.
    const pattern = src
      .replace(/^https:\/\//, '')
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[a-z0-9-]+(?:\\.[a-z0-9-]+)*')
    return new RegExp(`^${pattern}$`, 'i').test(host)
  })
}

/**
 * ¿El host aparece literalmente en un cliente de src/?
 * Se recorre `src/services` entero en vez de una lista fija de archivos, para
 * que mover un cliente a otro archivo no rompa este guard.
 */
function hostAppearsInSrc(host: string): boolean {
  const needle = `https://${host}`
  const stack = [resolve(ROOT, 'src', 'services')]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (/\.(ts|tsx|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        if (readFileSync(full, 'utf8').includes(needle)) return true
      }
    }
  }
  return false
}

/**
 * Origins que la app contacta en runtime desde el navegador.
 *
 * `enCodigo: true`  → el host aparece literalmente en un cliente de src/.
 * `enCodigo: false` → lo usa el SDK de Firebase de forma implícita (no está
 *                     escrito en el código, pero el SDK lo contacta). Estos
 *                     no entran en la comprobación de sentido inverso.
 */
const RUNTIME_ORIGINS: Array<{ host: string; porque: string; enCodigo: boolean }> = [
  { host: 'identitytoolkit.googleapis.com', porque: 'Firebase Auth (SDK)', enCodigo: false },
  { host: 'securetoken.googleapis.com', porque: 'refresh de sesión (SDK)', enCodigo: false },
  // Firestore contacta el host con scope de proyecto, no el ápex: por eso la
  // CSP usa `*.firebaseio.com` y aquí se comprueba la forma real.
  { host: 'althea-staging-default-rtdb.firebaseio.com', porque: 'Firestore (SDK)', enCodigo: false },
  { host: 'cdn.jsdelivr.net', porque: 'GIFs de ejercicios', enCodigo: true },
  { host: 'wger.de', porque: 'lectura pública WGER directa desde el navegador', enCodigo: true },
  { host: 'nutricion-api-arg.fly.dev', porque: 'API de nutrición Codulia', enCodigo: true },
]

describe('CSP de Firebase Hosting', () => {
  const csp = readCsp()

  it('la CSP está en el bloque ** para que aplique también a la carga inicial en /', () => {
    const config = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8')) as FirebaseConfig
    const cspBlocks = (config.hosting.headers ?? [])
      .filter((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'))
      .map((h) => h.source)
    // Si además aparece en /index.html sería redundante, pero lo toleramos.
    // Lo que no se permite es que SÓLO esté en /index.html.
    expect(cspBlocks).toContain('**')
  })

  it('nunca usa un wildcard en connect-src', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect.length).toBeGreaterThan(0)
    expect(connect).not.toContain('*')
  })

  it('cubre todos los origins que la app usa en runtime', () => {
    const connect = directive(csp, 'connect-src')
    const faltantes = RUNTIME_ORIGINS.filter((o) => !covers(connect, o.host)).map((o) => o.host)
    expect(
      faltantes,
      `origins en runtime ausentes de connect-src (${faltantes.join(', ')}). ` +
        'Si la app consulta un origin que no está aquí, el navegador lo bloquea en silencio.',
    ).toEqual([])
  })

  it('los origins declarados siguen existiendo en el código (lista sin podre)', () => {
    // Sentido inverso: si un cliente externo se elimina, la CSP queda con un
    // origin de más. Este test obliga a limpiarlo en lugar de acumularlos.
    const obsoletos = RUNTIME_ORIGINS.filter((o) => o.enCodigo && !hostAppearsInSrc(o.host)).map(
      (o) => o.host,
    )
    expect(
      obsoletos,
      `estos origins ya no se usan en src/ (${obsoletos.join(', ')}); retirarlos de connect-src`,
    ).toEqual([])
  })

  it('el proxy del Worker está permitido', () => {
    const connect = directive(csp, 'connect-src')
    expect(covers(connect, 'althea-proxy-staging.workers.dev')).toBe(true)
  })

  it('aplica los controles de seguridad base', () => {
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
    expect(directive(csp, 'frame-ancestors')).toEqual(["'self'"])
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('script-src no usa unsafe-inline, y index.html no tiene scripts inline', () => {
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-inline'")
    const html = readFileSync(INDEX_HTML, 'utf8')
    const inline = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)
    expect(
      inline,
      'index.html tiene un <script> inline; script-src no lo permitiría. Moverlo a un módulo.',
    ).toBe(false)
  })
})

describe('headers de Hosting', () => {
  const config = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8')) as FirebaseConfig
  const all = (config.hosting.headers ?? []).flatMap((h) => h.headers)
  const valueOf = (key: string) => all.find((h) => h.key === key)?.value

  it('nosniff activo', () => expect(valueOf('X-Content-Type-Options')).toBe('nosniff'))
  it('referrer-policy restrictivo', () =>
    expect(valueOf('Referrer-Policy')).toBe('strict-origin-when-cross-origin'))
  it('HSTS activo', () => expect(valueOf('Strict-Transport-Security')).toContain('max-age='))
  it('no permite framing externo', () => expect(valueOf('X-Frame-Options')).toBe('SAMEORIGIN'))

  it('no cachea index.html, sw.js ni workbox (necesario para el update de la PWA)', () => {
    for (const source of ['/index.html', '/sw.js']) {
      const block = config.hosting.headers?.find((h) => h.source === source)
      expect(block?.headers.find((h) => h.key === 'Cache-Control')?.value, source).toContain('no-store')
    }
  })

  it('cachea los assets con hash de forma inmutable', () => {
    const block = config.hosting.headers?.find((h) => h.source === '/assets/**')
    const cc = block?.headers.find((h) => h.key === 'Cache-Control')?.value ?? ''
    expect(cc).toContain('immutable')
    expect(cc).toContain('max-age=')
  })
})
