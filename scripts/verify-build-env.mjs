#!/usr/bin/env node
/**
 * ALTHEA — Guard de configuración de build (staging / production).
 *
 * Se ejecuta SÓLO en la ruta de deploy (`deploy:hosting:<modo>`), después de
 * resolver la configuración y antes de compilar. No afecta `npm run dev` ni
 * los tests unitarios.
 *
 * Verifica que el entorno del build sea coherente y real:
 *   - los 6 valores de Firebase presentes y sin plantillas;
 *   - `VITE_GROQ_PROXY_URL` presente, https y sin plantillas;
 *   - el proyecto Firebase coincide con FIREBASE_<MODO>_PROJECT_ID;
 *   - staging no apunta a producción (ni al revés).
 *
 * Nunca imprime secretos: sólo modo, proyecto y host.
 *
 * Salida: 0 = OK · 1 = configuración inválida · 2 = uso incorrecto.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  FIREBASE_KEYS,
  PROXY_KEY,
  VAPID_KEY,
  envFileForMode,
  isMode,
  projectVarForMode,
  siteVarForMode,
  parseEnvFile,
  resolveEnvValues,
  validateBuildEnv,
} from './lib/env-config.mjs'

const ROOT = process.cwd()
const mode = process.argv[2]

if (!isMode(mode)) {
  console.error('[verify-build-env] uso: node scripts/verify-build-env.mjs <staging|production>')
  process.exit(2)
}

if (!fs.existsSync(path.join(ROOT, 'dist')) && process.env.ALTHEA_ALLOW_MISSING_DIST !== '1') {
  // No es un requisito del validador; sólo un aviso útil en la ruta de deploy.
  console.warn('[verify-build-env] aviso: dist/ aún no existe; el build lo generará.')
}

function readEnvFile(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return {}
  return parseEnvFile(fs.readFileSync(full, 'utf8'))
}

/** Nombre del Worker declarado en worker/wrangler.<modo>.toml (o ''). */
function workerNameFor(otherMode) {
  const rel = path.join('worker', `wrangler.${otherMode}.toml`)
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return ''
  const m = fs.readFileSync(full, 'utf8').match(/^name\s*=\s*"([^"]+)"/m)
  return m ? m[1] : ''
}

const otherMode = mode === 'production' ? 'staging' : 'production'

// Precedencia Vite: proceso > .env.<modo> > .env
const processLayer = process.env
const modeLayer = readEnvFile(envFileForMode(mode))
const baseLayer = readEnvFile('.env')
const layers = [processLayer, modeLayer, baseLayer]

const keys = [
  ...FIREBASE_KEYS,
  PROXY_KEY,
  VAPID_KEY,
  projectVarForMode(mode),
  siteVarForMode(mode),
  projectVarForMode(otherMode),
]
const values = resolveEnvValues(keys, layers)

// El id del otro entorno puede venir del entorno o de su propio .env.<otro>.
const otherLayer = readEnvFile(envFileForMode(otherMode))
const otherProjectId =
  process.env[projectVarForMode(otherMode)] ||
  otherLayer[projectVarForMode(otherMode)] ||
  otherLayer.VITE_FIREBASE_PROJECT_ID ||
  ''

const result = validateBuildEnv({
  mode,
  values,
  otherProjectId,
  otherWorkerName: workerNameFor(otherMode),
})

const line = '─'.repeat(60)
console.log(line)
console.log(`  ALTHEA — VERIFICACIÓN DE BUILD (${mode.toUpperCase()})`)
console.log(line)
console.log(`  PROYECTO   = ${result.summary.project}`)
console.log(`  PROXY HOST = ${result.summary.host}`)
console.log(`  ARCHIVO    = ${envFileForMode(mode)}`)
console.log(line)

if (!result.ok) {
  console.error('\n[verify-build-env] FAIL — configuración inválida:')
  for (const err of result.errors) console.error(`  - ${err}`)
  console.error(
    '\n  Solución: ejecutá `npm run setup` para generar la configuración,\n' +
      '  o revisá ' + envFileForMode(mode) + ' (ver .env.example).',
  )
  process.exit(1)
}

// Aviso no bloqueante: sin VAPID la app funciona igual, sólo se pierde push.
if (!values[VAPID_KEY]) {
  console.log('[verify-build-env] aviso: sin VITE_FIREBASE_VAPID_KEY — push web deshabilitado.')
}

console.log('\n[verify-build-env] OK — configuración coherente para ' + mode + '.')
