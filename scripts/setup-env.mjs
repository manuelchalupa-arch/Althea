#!/usr/bin/env node
/**
 * ALTHEA — Asistente de configuración de builds (staging / production).
 *
 * Crea/actualiza, de forma guiada y segura:
 *   - .env.staging  / .env.production  (ignorados por git)
 *   - .firebaserc                      (alias default/staging/production)
 *   - una entrada `.firebaserc` en .gitignore
 *
 * NUNCA pide ni escribe claves privadas (Groq): esas viven como secret
 * del Cloudflare Worker (`npm run worker:secret:*`). Sólo trata variables
 * VITE_* públicas y los ids de proyecto/site de Firebase.
 *
 * Es re-ejecutable: si un archivo existe, lo respalda y ofrece conservar los
 * valores actuales como default (útil cuando aparece la URL del Worker de
 * producción). No genera datos ficticios: sólo escribe un modo si el usuario
 * aporta su project id.
 *
 * Uso: npm run setup
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import {
  FIREBASE_KEYS,
  PROXY_KEY,
  VAPID_KEY,
  buildEnvFileContent,
  buildFirebasercContent,
  ensureGitignoreEntry,
  envFileForMode,
  isPlaceholder,
  parseEnvFile,
  parseHttpsHost,
  projectVarForMode,
  siteVarForMode,
} from './lib/env-config.mjs'

const ROOT = process.cwd()
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function timestampSafe() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Respalda un archivo existente y devuelve la ruta del backup (o null). */
function backup(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return null
  const dest = `${full}.bak-${timestampSafe()}`
  fs.copyFileSync(full, dest)
  return dest
}

function readEnvFile(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return {}
  try {
    return parseEnvFile(fs.readFileSync(full, 'utf8'))
  } catch {
    return {}
  }
}

async function ask(label, { defaultValue = '', required = true, validate } = {}) {
  for (;;) {
    const suffix = defaultValue ? ` [${defaultValue}]` : ''
    const answer = (await rl.question(`  ${label}${suffix}: `)).trim()
    const value = answer || defaultValue
    if (!value) {
      if (!required) return ''
      console.log('    ✗ Este valor es obligatorio.')
      continue
    }
    if (isPlaceholder(value)) {
      console.log(
        '    ✗ Ese valor parece una plantilla de ejemplo (ej. "REEMPLAZAR", "tu-proyecto"). Ingresá el valor real.',
      )
      continue
    }
    if (validate) {
      const error = validate(value)
      if (error) {
        console.log(`    ✗ ${error}`)
        continue
      }
    }
    return value
  }
}

function validateHttps(value) {
  return parseHttpsHost(value) ? null : 'Debe ser una URL https válida (ej. https://mi-worker.workers.dev).'
}

async function configureMode(mode, existing, otherProjectId) {
  const file = envFileForMode(mode)
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  Configuración de ${mode.toUpperCase()}  (${file})`)
  console.log('─'.repeat(60))

  const projectId = await ask('Id del proyecto Firebase', {
    defaultValue: existing.VITE_FIREBASE_PROJECT_ID || '',
  })

  if (otherProjectId && projectId === otherProjectId) {
    console.log('    ✗ Ese id ya se usa para el otro entorno. staging y production deben ser distintos.')
    return configureMode(mode, existing, otherProjectId)
  }

  const values = { VITE_FIREBASE_PROJECT_ID: projectId }
  for (const key of FIREBASE_KEYS) {
    if (key === 'VITE_FIREBASE_PROJECT_ID') continue
    values[key] = await ask(key, { defaultValue: existing[key] || '' })
  }

  const siteId = await ask('Site id de Hosting (Enter = igual al project id)', {
    defaultValue: existing[siteVarForMode(mode)] || projectId,
    required: false,
  })

  values[projectVarForMode(mode)] = projectId
  if (siteId) values[siteVarForMode(mode)] = siteId

  values[PROXY_KEY] = await ask('URL del Worker (proxy de IA)', {
    defaultValue: existing[PROXY_KEY] || '',
    validate: validateHttps,
  })

  const vapid = await ask('Clave VAPID pública (Enter = sin push)', {
    defaultValue: existing[VAPID_KEY] || '',
    required: false,
  })
  if (vapid) values[VAPID_KEY] = vapid

  return values
}

async function writeFile(rel, content, { confirm = true } = {}) {
  const full = path.join(ROOT, rel)
  if (fs.existsSync(full)) {
    const current = fs.readFileSync(full, 'utf8')
    if (current === content) {
      console.log(`  = ${rel} sin cambios.`)
      return
    }
    if (confirm) {
      const answer = (await rl.question(`  ¿Sobrescribir ${rel}? (respaldo automático) [s/N]: `))
        .trim()
        .toLowerCase()
      if (!['s', 'si', 'sí', 'y', 'yes'].includes(answer)) {
        console.log(`  · ${rel} conservado.`)
        return
      }
    }
    const backupPath = backup(rel)
    if (backupPath) console.log(`  · respaldo: ${path.relative(ROOT, backupPath)}`)
  }
  fs.writeFileSync(full, content, 'utf8')
  console.log(`  ✓ escrito ${rel}`)
}

function isAffirmative(answer) {
  return ['s', 'si', 'sí', 'y', 'yes'].includes(answer.trim().toLowerCase())
}

async function main() {
  console.log('='.repeat(60))
  console.log('  ALTHEA — Asistente de configuración (staging / production)')
  console.log('='.repeat(60))
  console.log('  No se piden claves privadas: sólo valores públicos de build.')
  console.log('\n(Enter acepta el valor por defecto; dejá vacío un project id para omitir ese entorno.)')

  const existingStaging = readEnvFile(envFileForMode('staging'))
  const existingProduction = readEnvFile(envFileForMode('production'))

  const staging = await configureMode('staging', existingStaging, '')
  const production = await configureMode('production', existingProduction, staging.VITE_FIREBASE_PROJECT_ID)

  console.log('\n' + '─'.repeat(60))
  console.log('  Resumen')
  console.log('─'.repeat(60))
  console.log(`  staging    → proyecto ${staging.VITE_FIREBASE_PROJECT_ID} · host ${parseHttpsHost(staging[PROXY_KEY])}`)
  console.log(`  production → proyecto ${production.VITE_FIREBASE_PROJECT_ID} · host ${parseHttpsHost(production[PROXY_KEY])}`)

  const answer = await rl.question('\n  ¿Escribir estos archivos? [s/N]: ')
  if (!isAffirmative(answer)) {
    console.log('\n  Cancelado. No se escribió nada.')
    return
  }

  await writeFile(envFileForMode('staging'), buildEnvFileContent({ mode: 'staging', values: staging }))
  await writeFile(
    envFileForMode('production'),
    buildEnvFileContent({ mode: 'production', values: production }),
  )

  await writeFile(
    '.firebaserc',
    buildFirebasercContent({
      stagingProjectId: staging.VITE_FIREBASE_PROJECT_ID,
      productionProjectId: production.VITE_FIREBASE_PROJECT_ID,
      stagingSiteId: staging[siteVarForMode('staging')] || staging.VITE_FIREBASE_PROJECT_ID,
      productionSiteId: production[siteVarForMode('production')] || production.VITE_FIREBASE_PROJECT_ID,
    }),
  )

  const gitignorePath = path.join(ROOT, '.gitignore')
  const currentGitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
  const { content: nextGitignore, changed } = ensureGitignoreEntry(currentGitignore, '.firebaserc')
  if (changed) {
    fs.writeFileSync(gitignorePath, nextGitignore, 'utf8')
    console.log('  ✓ .gitignore actualizado (.firebaserc ignorado)')
  } else {
    console.log('  = .gitignore ya ignora .firebaserc')
  }

  console.log('\n' + '='.repeat(60))
  console.log('  Listo. Próximos pasos:')
  console.log('    1. Verificá la config:  npm run verify:env:staging')
  console.log('    2. Worker (si falta):   npm run worker:kv:staging && npm run worker:secret:staging')
  console.log('    3. Deploy:              npm run deploy:hosting:staging')
  console.log('='.repeat(60))
}

await main()
  .catch((e) => {
    console.error('[setup] error:', e?.message ?? e)
    process.exitCode = 1
  })
  .finally(() => {
    rl.close()
  })
