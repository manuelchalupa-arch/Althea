/**
 * ALTHEA — Validación estática de la PWA.
 *
 * Comprueba los ARTEFACTOS de la PWA en `dist/`: manifest, service worker,
 * iconos y coherencia entre manifest y archivos realmente presentes.
 *
 * NO valida el update del service worker entre dos versiones: eso exige dos
 * despliegues reales y se reporta aparte como NOT VALIDATED. Ver `docs/` y el
 * checklist de release.
 *
 * Salida: 0 = PASS · 1 = FAIL
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const dist = path.resolve(process.cwd(), 'dist')
const failures = []
const passes = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== PWA STATIC VALIDATION ===')
console.log(`dist = ${dist}`)

if (!fs.existsSync(dist)) {
  console.error('\nFAIL — dist no existe. Ejecutá `npm run build` primero.')
  process.exit(1)
}

/** Lista recursiva de archivos relativos a dist. */
function walk(dir, prefix = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

const files = walk(dist)

// ── Manifest ────────────────────────────────────────────────────────────────
const manifestPath = files.find((f) => /(^|\/)manifest.*\.(webmanifest|json)$/i.test(f))
if (!manifestPath) {
  bad('manifest no encontrado en dist/')
} else {
  ok(`manifest: ${manifestPath}`)
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dist, manifestPath), 'utf8'))
  } catch {
    bad('el manifest no es JSON válido')
  }
  if (parsed) {
    for (const field of ['name', 'short_name', 'start_url', 'display', 'icons']) {
      if (!(field in parsed)) bad(`manifest sin campo "${field}"`)
      else ok(`manifest.${field}`)
    }
    if (parsed.display && !['standalone', 'fullscreen', 'minimal-ui'].includes(parsed.display)) {
      bad(`manifest.display = "${parsed.display}" no es instalable`)
    } else {
      ok(`display instalable: ${parsed.display}`)
    }

    // Los iconos declarados deben existir de verdad.
    const icons = Array.isArray(parsed.icons) ? parsed.icons : []
    if (icons.length === 0) bad('manifest sin icons')
    let faltan = []
    for (const icon of icons) {
      const src = String(icon.src || '').replace(/^\//, '')
      if (!src) continue
      if (!files.includes(src)) faltan.push(src)
    }
    if (faltan.length) bad(`iconos declarados ausentes en dist/: ${faltan.join(', ')}`)
    else ok(`los ${icons.length} iconos del manifest existen`)

    const maskable = icons.filter((i) => String(i.purpose || '').includes('maskable'))
    if (icons.length > 0 && maskable.length === 0) {
      console.log('  [WARN] ningún icono declara purpose=maskable')
    } else if (maskable.length) {
      ok(`${maskable.length} icono(s) maskable`)
    }
  }
}

// ── Service worker ──────────────────────────────────────────────────────────
const swFiles = files.filter((f) => /(^|\/)(sw|service-worker)[\w.-]*\.js$/i.test(f))
if (swFiles.length === 0) bad('service worker no encontrado en dist/')
else ok(`service worker: ${swFiles.join(', ')}`)

// El SW debe cachear algo: sin precache la PWA no sirve offline.
for (const sw of swFiles) {
  const content = fs.readFileSync(path.join(dist, sw), 'utf8')
  const hasPrecache = content.includes('precacheAndRoute') || content.includes('__WB_MANIFEST') || /precache/i.test(content)
  if (hasPrecache) ok(`${sw} declara precache`)
  else bad(`${sw} no parece declarar precache (PWA sin offline real)`)
}

// ── start_url resoluble ─────────────────────────────────────────────────────
const manifestAbs = manifestPath ? path.join(dist, manifestPath) : null
if (manifestAbs) {
  const parsed = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'))
  const start = String(parsed.start_url || '/').split('?')[0].split('#')[0].replace(/^\//, '')
  if (start && !files.includes(start)) bad(`manifest.start_url apunta a "${start}", que no existe`)
  else ok(`start_url resuelve (${start || '/'})`)
}

console.log('\nNOT VALIDATED aquí (requiere navegador y 2 despliegues):')
console.log('  - actualización del service worker entre versiones')
console.log('  - instalación real de la PWA')
console.log('  - comportamiento offline en dispositivo')

console.log('\n' + '='.repeat(56))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log(`PWA STATIC VALIDATION = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
