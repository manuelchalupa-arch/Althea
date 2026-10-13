#!/usr/bin/env node
/**
 * Guard fail-closed para deploys de Firebase Hosting.
 *
 * Motivo: §12 del prompt de cierre — nunca depender de un proyecto
 * seleccionado accidentalmente por la CLI de Firebase. Este script exige
 * ambiente + PROJECT_ID y muestra ENVIRONMENT / PROJECT_ID / SITE_ID antes de
 * deployar.
 *
 * El PROJECT_ID se puede aportar de dos maneras equivalentes:
 *   1. variable de entorno `FIREBASE_PROJECT_ID` (o específica del modo), o
 *   2. el archivo `.env.<modo>` (FIREBASE_<MODO>_PROJECT_ID o
 *      VITE_FIREBASE_PROJECT_ID), generado por `npm run setup`.
 * En ningún caso se usa el proyecto "default" de la CLI de Firebase.
 *
 * Uso:
 *   npm run deploy:hosting:staging
 *   ALTHEA_ALLOW_PRODUCTION_DEPLOY=1 npm run deploy:hosting:production
 *
 * Falla (exit 1) si falta PROJECT_ID, si el id es una plantilla sin
 * reemplazar, si staging/production no coinciden con el proyecto declarado,
 * o si es production sin autorización explícita.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { envFileForMode, isMode, projectVarForMode, siteVarForMode, parseEnvFile } from './lib/env-config.mjs'

const env = process.argv[2]

if (!isMode(env)) {
  console.error('[deploy-hosting] ERROR: ambiente debe ser "staging" o "production".')
  process.exit(1)
}

const ROOT = process.cwd()

/** Lee una clave de `.env.<modo>`. Devuelve '' si no existe. */
function fileValue(mode, key) {
  const full = path.join(process.cwd(), envFileForMode(mode))
  if (!fs.existsSync(full)) return ''
  try {
    return (parseEnvFile(fs.readFileSync(full, 'utf8'))[key] || '').trim()
  } catch {
    return ''
  }
}

/** Resuelve el project id: entorno primero, luego `.env.<modo>`. */
function resolveProjectId(mode) {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env[projectVarForMode(mode)] ||
    fileValue(mode, projectVarForMode(mode)) ||
    fileValue(mode, 'VITE_FIREBASE_PROJECT_ID') ||
    ''
  )
}

/** Proyecto declarado como "el de este modo" (env o archivo). */
function declaredProject(mode) {
  return process.env[projectVarForMode(mode)] || fileValue(mode, projectVarForMode(mode)) || ''
}

/** Site id opcional (multi-site). */
function resolveSiteId(mode) {
  return process.env[siteVarForMode(mode)] || fileValue(mode, siteVarForMode(mode)) || ''
}

const projectId = resolveProjectId(env)

if (!projectId) {
  console.error(
    '[deploy-hosting] FAIL-CLOSED: falta el PROJECT_ID.\n' +
      '  No se permite un deploy sin proyecto explícito.\n' +
      '  Opciones:\n' +
      '    - generá la configuración con `npm run setup`, o\n' +
      `    - exportá FIREBASE_PROJECT_ID=<id real de ${env}>.`,
  )
  process.exit(1)
}

if (projectId.includes('REEMPLAZAR') || isPlaceholderId(projectId)) {
  console.error(
    `[deploy-hosting] FAIL-CLOSED: "${projectId}" es un placeholder sin reemplazar.\n` +
      '  Configurá el project id real (npm run setup, o ver .firebaserc.example).',
  )
  process.exit(1)
}

function isPlaceholderId(id) {
  return /REEMPLAZAR|STAGING_PROJECT_ID|PRODUCTION_PROJECT_ID|tu-proyecto/i.test(id)
}

/**
 * Un deploy de staging NO puede caer en el proyecto de producción.
 *
 * `FIREBASE_PROJECT_ID` alcanza por sí solo: si alguien exporta el id de
 * producción y llama al script de staging por error, el deploy iría a
 * producción sin que nada lo detenga. Se exige además que el proyecto
 * coincida con el declarado para este modo.
 */
function assertModeProject(mode, id) {
  const expected = declaredProject(mode)
  if (!expected || !expected.trim()) {
    console.error(
      `[deploy-hosting] FAIL-CLOSED: falta ${projectVarForMode(mode)}.\n` +
        `  Un deploy de ${mode} debe declarar explícitamente cuál es su proyecto.\n` +
        '  Definilo en .env.' + mode + ' con `npm run setup` o exportá la variable.',
    )
    process.exit(1)
  }
  if (id !== expected.trim()) {
    console.error(
      `[deploy-hosting] FAIL-CLOSED: se pidió ${mode} pero el proyecto es "${id}"\n` +
        `  y el declarado para ${mode} es "${expected.trim()}".\n` +
        '  Se aborta para no mezclar ambientes.',
    )
    process.exit(1)
  }
}

/**
 * Producción exige autorización explícita. Nunca se activa sola.
 */
function assertProductionAuthorization() {
  if (process.env.ALTHEA_ALLOW_PRODUCTION_DEPLOY !== '1') {
    console.error(
      '[deploy-hosting] FAIL-CLOSED: deploy de PRODUCCIÓN requiere autorización explícita.\n' +
        '  Re-exportá ALTHEA_ALLOW_PRODUCTION_DEPLOY=1 sólo cuando el propietario lo autorice.\n' +
        '  (Regla §29: nunca producción automática.)',
    )
    process.exit(1)
  }
}

assertModeProject(env, projectId)
if (env === 'production') {
  assertProductionAuthorization()
}

const siteId = resolveSiteId(env)

console.log('─'.repeat(60))
console.log('  ALTHEA — DEPLOY GUARD (fail-closed)')
console.log('─'.repeat(60))
console.log(`  ENVIRONMENT = ${env.toUpperCase()}`)
console.log(`  PROJECT_ID  = ${projectId}`)
console.log(`  SITE_ID     = ${siteId || '(default del proyecto)'}`)
if (env === 'production') {
  console.log('  ⚠ PRODUCTION DEPLOY — autorizado por ALTHEA_ALLOW_PRODUCTION_DEPLOY=1')
}
console.log('─'.repeat(60))

const args = ['deploy', '--only', 'hosting', '--project', projectId]
if (siteId) args.push('--site', siteId)

const res = spawnSync('npx', ['--yes', 'firebase-tools', ...args], { stdio: 'inherit', shell: true })

if (res.status !== 0) {
  console.error(`[deploy-hosting] deploy falló (exit ${res.status}).`)
  process.exit(res.status ?? 1)
}

console.log('[deploy-hosting] deploy completado.')
console.log('[deploy-hosting] Para rollback: firebase hosting:rollback --project ' + projectId + (siteId ? ` --site ${siteId}` : ''))
