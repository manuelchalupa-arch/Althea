#!/usr/bin/env node
/**
 * Guard fail-closed para deploys de Firebase Hosting.
 *
 * Motivo: §12 del prompt de cierre — nunca depender de un proyecto
 * seleccionado accidentalmente por la CLI de Firebase. Este script exige
 * ambiente + PROJECT_ID explícitos y muestra ENVIRONMENT / PROJECT_ID /
 * SITE_ID antes de deployar.
 *
 * Uso:
 *   FIREBASE_PROJECT_ID=mi-staging npm run deploy:hosting:staging
 *   FIREBASE_PROJECT_ID=mi-prod ALTHEA_ALLOW_PRODUCTION_DEPLOY=1 \
 *     npm run deploy:hosting:production
 *
 * Falla (exit 1) si falta PROJECT_ID, si el id es una plantilla sin
 * reemplazar, o si es production sin autorización explícita.
 */

import { spawnSync } from 'node:child_process'

const env = process.argv[2]

if (env !== 'staging' && env !== 'production') {
  console.error('[deploy-hosting] ERROR: ambiente debe ser "staging" o "production".')
  process.exit(1)
}

const projectId = process.env.FIREBASE_PROJECT_ID

if (!projectId) {
  console.error(
    '[deploy-hosting] FAIL-CLOSED: falta FIREBASE_PROJECT_ID.\n' +
      '  No se permite un deploy sin proyecto explícito.\n' +
      `  staging:    set FIREBASE_PROJECT_ID=<STAGING_PROJECT_ID>\n` +
      `  production: set FIREBASE_PROJECT_ID=<PRODUCTION_PROJECT_ID>`,
  )
  process.exit(1)
}

if (projectId.includes('REEMPLAZAR') || projectId.startsWith('STAGING_PROJECT_ID')) {
  console.error(
    `[deploy-hosting] FAIL-CLOSED: "${projectId}" es un placeholder sin reemplazar.\n` +
      '  Configurá el project id real en .firebaserc (ver .firebaserc.example).',
  )
  process.exit(1)
}

if (env === 'production' && process.env.ALTHEA_ALLOW_PRODUCTION_DEPLOY !== '1') {
  console.error(
    '[deploy-hosting] FAIL-CLOSED: deploy de PRODUCCIÓN requiere autorización explícita.\n' +
      '  Re-exportá ALTHEA_ALLOW_PRODUCTION_DEPLOY=1 sólo cuando el propietario lo autorice.\n' +
      '  (Regla §29: nunca producción automática.)',
  )
  process.exit(1)
}

// SITE_ID explícito cuando el owner define multi-site; si no, se usa el default
// del proyecto. Imprimir siempre ambos para que quede en el log del deploy.
const siteId = env === 'staging' ? process.env.FIREBASE_STAGING_SITE_ID : process.env.FIREBASE_PRODUCTION_SITE_ID

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
