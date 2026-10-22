/**
 * ALTHEA — Helpers de configuración de builds (staging / production).
 *
 * Librería PURA y sin efectos: parseo de `.env`, resolución de precedencia,
 * validación de la configuración de build y generación de contenido
 * (`.env.<modo>`, `.firebaserc`, `.gitignore`).
 *
 * La usan:
 *   - scripts/verify-build-env.mjs   (guard de la ruta de deploy)
 *   - scripts/setup-env.mjs          (asistente interactivo)
 *   - tests en src/ (importando este .mjs vía env-config.d.mts)
 *
 * Regla dura: NUNCA imprime ni devuelve como "resumen" el valor de un secreto.
 * Los secretos privados (GROQ_API_KEY, etc.) no viven en `.env.*`: viven
 * como secret del Worker. Este módulo sólo trata variables VITE_* públicas y
 * los ids de proyecto/site de Firebase.
 */

export const MODES = ['staging', 'production']

/** Los 6 valores de configuración web de Firebase (públicos de cliente). */
export const FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

/** Clave VAPID pública (opcional; sin ella sólo se pierde el push). */
export const VAPID_KEY = 'VITE_FIREBASE_VAPID_KEY'

/** URL pública del proxy (Worker). Obligatoria para un despliegue con Coach remoto. */
export const PROXY_KEY = 'VITE_GROQ_PROXY_URL'

/** Id del proyecto Firebase declarado para cada modo (fuente de verdad del modo). */
export function projectVarForMode(mode) {
  return mode === 'production' ? 'FIREBASE_PRODUCTION_PROJECT_ID' : 'FIREBASE_STAGING_PROJECT_ID'
}

/** Site id de Hosting declarado para cada modo (opcional; multi-site). */
export function siteVarForMode(mode) {
  return mode === 'production' ? 'FIREBASE_PRODUCTION_SITE_ID' : 'FIREBASE_STAGING_SITE_ID'
}

export function envFileForMode(mode) {
  return mode === 'production' ? '.env.production' : '.env.staging'
}

export function isMode(mode) {
  return MODES.includes(mode)
}

/** Quita comillas simples o dobles envolventes (una sola capa). */
export function stripQuotes(value) {
  const v = String(value).trim()
  const first = v[0]
  const last = v[v.length - 1]
  if (v.length >= 2 && (first === '"' || first === "'") && first === last) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Parsea un archivo `.env` (formato dotenv): ignora comentarios y líneas
 * vacías, admite `export KEY=value` y quita comillas envolventes.
 */
export function parseEnvFile(content) {
  const out = {}
  for (const rawLine of String(content ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let key = line.slice(0, eq).trim()
    if (key.startsWith('export ')) key = key.slice('export '.length).trim()
    if (!key) continue
    out[key] = stripQuotes(line.slice(eq + 1))
  }
  return out
}

/**
 * Resuelve el valor de una clave con la precedencia real de Vite:
 *   1. variables de entorno del proceso (ganan siempre),
 *   2. `.env.<modo>`   (específico del modo),
 *   3. `.env`          (común a todos los modos).
 * Los `layers` se aplican en ese orden y gana el primero con valor no vacío.
 */
export function resolveEnvValue(key, layers) {
  for (const layer of layers) {
    const value = layer?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * Construye el mapa resuelto de todas las claves presentes en cualquier capa.
 * `layers` va en orden de precedencia (proceso, .env.<modo>, .env).
 */
export function resolveEnvValues(keys, layers) {
  const out = {}
  for (const key of keys) out[key] = resolveEnvValue(key, layers)
  return out
}

/** Marcadores de plantilla que NUNCA deben llegar a un build real. */
const PLACEHOLDER_PATTERNS = [
  /REEMPLAZAR/i,
  /tu-proyecto/i,
  /tu-usuario/i,
  /\babcdef\b/i,
  /example\.(com|org|net)/i,
  /\bDUMMY\b/i,
  /\bTU_CLAVE/i,
  /123456789/,
  /\bchangeme\b/i,
  /STAGING_PROJECT_ID/,
  /PRODUCTION_PROJECT_ID/,
]

/** ¿El valor parece una plantilla sin reemplazar (no un valor real)? */
export function isPlaceholder(value) {
  const v = String(value ?? '').trim()
  if (!v) return true
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v))
}

/** Devuelve el host de una URL https válida, o null si no es aceptable. */
export function parseHttpsHost(value) {
  const v = String(value ?? '').trim()
  if (!v) return null
  let url
  try {
    url = new URL(v)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return url.host
}

/**
 * Valida la configuración de build de un modo.
 *
 * @param {object} args
 * @param {'staging'|'production'} args.mode
 * @param {Record<string,string>} args.values  mapa resuelto (proceso + archivos)
 * @param {string} [args.otherProjectId]       id del OTRO entorno (para cruce)
 * @param {string} [args.otherWorkerName]      nombre del Worker del OTRO entorno
 * @returns {{ ok: boolean, mode: string, errors: string[], summary: object }}
 */
export function validateBuildEnv({ mode, values = {}, otherProjectId = '', otherWorkerName = '' }) {
  const errors = []

  if (!isMode(mode)) {
    return { ok: false, mode: String(mode), errors: [`modo inválido: "${mode}" (usar staging|production)`], summary: {} }
  }

  // 1. Los 6 valores de Firebase: presentes, sin plantillas.
  for (const key of FIREBASE_KEYS) {
    const value = values[key]
    if (!value) errors.push(`falta ${key} en ${envFileForMode(mode)} (o en el entorno)`)
    else if (isPlaceholder(value)) errors.push(`${key} sigue siendo un valor de ejemplo/plantilla`)
  }

  // 2. Proxy del Worker: obligatorio y https válido.
  const proxy = values[PROXY_KEY]
  const proxyHost = parseHttpsHost(proxy)
  if (!proxy) {
    errors.push(`falta ${PROXY_KEY} (sin proxy no hay Coach remoto)`)
  } else if (isPlaceholder(proxy)) {
    errors.push(`${PROXY_KEY} sigue siendo un valor de ejemplo/plantilla`)
  } else if (!proxyHost) {
    errors.push(`${PROXY_KEY} debe ser una URL https válida`)
  }

  // 3. El proyecto Firebase debe coincidir con el declarado por el modo.
  const projectVar = projectVarForMode(mode)
  const declaredProject = values[projectVar]
  const firebaseProject = values.VITE_FIREBASE_PROJECT_ID || ''
  if (!declaredProject) {
    errors.push(`falta ${projectVar}: sin él no se puede verificar que el build sea de ${mode}`)
  } else if (isPlaceholder(declaredProject)) {
    errors.push(`${projectVar} sigue siendo un valor de ejemplo/plantilla`)
  } else if (firebaseProject && declaredProject !== firebaseProject) {
    errors.push(
      `VITE_FIREBASE_PROJECT_ID ("${firebaseProject}") no coincide con ${projectVar} ("${declaredProject}")`,
    )
  }

  // 4. Cruce entre entornos: nunca apuntar al otro.
  if (otherProjectId && firebaseProject && firebaseProject === otherProjectId) {
    errors.push(`el build de ${mode} apunta al proyecto del otro entorno ("${otherProjectId}")`)
  }
  if (otherWorkerName && proxy && proxyHost && proxyHost.includes(otherWorkerName)) {
    errors.push(`el build de ${mode} apunta al Worker del otro entorno ("${otherWorkerName}")`)
  }

  return {
    ok: errors.length === 0,
    mode,
    errors,
    summary: {
      mode,
      project: firebaseProject || '(sin definir)',
      host: proxyHost || '(sin definir)',
    },
  }
}

/**
 * Decide si la prueba E2E de aislamiento de Firestore puede ejecutarse.
 *
 * Garantiza que el destino sea la identidad DECLARADA de staging y nunca el
 * proyecto de producción. Puro y sin efectos.
 *
 * @param {{ projectId?: string, apiKey?: string, stagingId?: string, productionId?: string }} args
 * @returns {{ ok: boolean, level: 'ok'|'block'|'abort', code: string, message: string }}
 *   level 'block' = falta configuración (salida 2) · 'abort' = apunta a producción (salida 1)
 */
export function checkFirestoreE2eTarget({ projectId, apiKey, stagingId, productionId } = {}) {
  const p = String(projectId ?? '').trim()
  const k = String(apiKey ?? '').trim()
  const s = String(stagingId ?? '').trim()
  const prod = String(productionId ?? '').trim()

  if (!p) {
    return {
      ok: false,
      level: 'block',
      code: 'MISSING_PROJECT',
      message: 'Falta VITE_FIREBASE_PROJECT_ID (staging). No se puede probar el aislamiento.',
    }
  }
  if (!k) {
    return { ok: false, level: 'block', code: 'MISSING_API_KEY', message: 'Falta VITE_FIREBASE_API_KEY (staging).' }
  }
  if (!s) {
    return {
      ok: false,
      level: 'block',
      code: 'MISSING_STAGING_ID',
      message:
        'Falta FIREBASE_STAGING_PROJECT_ID: sin la identidad declarada de staging no se puede garantizar que el destino no sea producción.',
    }
  }
  if (p !== s) {
    return {
      ok: false,
      level: 'block',
      code: 'PROJECT_NOT_STAGING',
      message: `EL PROYECTO NO ES EL DECLARADO COMO STAGING: VITE_FIREBASE_PROJECT_ID="${p}" ≠ FIREBASE_STAGING_PROJECT_ID="${s}". Abortado para no tocar un proyecto no declarado como staging.`,
    }
  }
  if (prod && s === prod) {
    return {
      ok: false,
      level: 'abort',
      code: 'STAGING_IS_PRODUCTION',
      message:
        'FIREBASE_STAGING_PROJECT_ID y FIREBASE_PRODUCTION_PROJECT_ID son el MISMO proyecto. Revisá la configuración.',
    }
  }
  return { ok: true, level: 'ok', code: 'OK', message: '' }
}

/** Cabecera común de los `.env.<modo>` generados por el asistente. */
function envHeader(mode) {
  const label = mode === 'production' ? 'PRODUCCIÓN' : 'STAGING'
  return [
    `# ALTHEA — configuración de build (${label})`,
    '# Generado por `npm run setup`. Este archivo está en .gitignore.',
    '#',
    '# Las variables VITE_* son PÚBLICAS (terminan en el bundle del navegador).',
    '# NUNCA poner acá una clave privada (Groq, etc.): la única clave',
    '# privada vive como secret del Cloudflare Worker (`npm run worker:secret:*`).',
    '',
  ].join('\n')
}

/**
 * Genera el contenido de un `.env.<modo>`.
 * @param {{ mode: string, values: Record<string,string> }} args
 */
export function buildEnvFileContent({ mode, values = {} }) {
  const lines = [envHeader(mode)]
  lines.push('# Firebase — Configuración del proyecto → Tus apps → Web')
  for (const key of FIREBASE_KEYS) {
    lines.push(`${key}=${values[key] ?? ''}`)
  }
  lines.push('')
  if (values[VAPID_KEY]) {
    lines.push('# Web Push (público). Vacío = la app funciona igual, sin push.')
    lines.push(`${VAPID_KEY}=${values[VAPID_KEY]}`)
    lines.push('')
  }
  lines.push('# Hosting — id del proyecto del modo y (opcional) site id multi-site')
  lines.push(`${projectVarForMode(mode)}=${values[projectVarForMode(mode)] ?? ''}`)
  if (values[siteVarForMode(mode)]) {
    lines.push(`${siteVarForMode(mode)}=${values[siteVarForMode(mode)]}`)
  }
  lines.push('')
  lines.push('# Cloudflare Worker — URL pública del proxy de IA (no es un secreto)')
  lines.push(`${PROXY_KEY}=${values[PROXY_KEY] ?? ''}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Genera el contenido de `.firebaserc` con alias `default`, `staging` y
 * `production`, y los targets de Hosting por site.
 */
export function buildFirebasercContent({
  stagingProjectId,
  productionProjectId,
  stagingSiteId,
  productionSiteId,
}) {
  if (!stagingProjectId || !productionProjectId) {
    throw new Error('se necesitan staging y production project ids')
  }
  if (stagingProjectId === productionProjectId) {
    throw new Error('staging y production deben ser proyectos distintos')
  }
  const targets = {}
  const stSite = stagingSiteId || stagingProjectId
  const prSite = productionSiteId || productionProjectId
  if (stSite) {
    targets[stagingProjectId] = { hosting: { staging: stSite } }
  }
  if (prSite) {
    targets[productionProjectId] = { hosting: { production: prSite } }
  }
  return (
    JSON.stringify(
      {
        '': 'Generado por `npm run setup`. NO commitear (está en .gitignore).',
        projects: {
          default: stagingProjectId,
          staging: stagingProjectId,
          production: productionProjectId,
        },
        targets,
      },
      null,
      2,
    ) + '\n'
  )
}

/** Agrega una entrada a un `.gitignore` si no está ya (idempotente). */
export function ensureGitignoreEntry(content, entry) {
  const lines = String(content ?? '').split(/\r?\n/)
  const exists = lines.some((l) => l.trim() === entry)
  if (exists) return { content: String(content ?? ''), changed: false }
  const base = String(content ?? '')
  const needsNewline = base.length > 0 && !base.endsWith('\n')
  return { content: `${base}${needsNewline ? '\n' : ''}${entry}\n`, changed: true }
}
