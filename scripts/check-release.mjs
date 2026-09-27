import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')

const PATTERNS = [
  { name: 'gsk_ (clave Groq embebida)', re: /gsk_[A-Za-z0-9]{8,}/ },
  { name: 'VITE_GROQ_API_KEY', re: /VITE_GROQ_API_KEY/ },
  { name: 'API de Groq en cliente', re: /api\.groq\.com/ },
  { name: 'X-Api-Key con valor embebido (Ninja/CalorieNinjas)', re: /X-Api-Key['"]?\s*[:=]\s*['"][A-Za-z0-9+/]{24,}['"]|X-Api-Key['"]?\s*[:=]\s*['"][^'"]{40,}['"]/ },
  { name: 'VITE_NINJA_API_KEY', re: /VITE_NINJA_API_KEY/ },
  { name: 'VITE_CALORIE_NINJAS_KEY', re: /VITE_CALORIE_NINJAS_KEY/ },
]

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      walk(p, out)
    } else {
      out.push(p)
    }
  }
}

if (!existsSync(root)) {
  console.error('[check:release] No existe dist/. Ejecutá primero: npm run build')
  process.exit(1)
}

const files = []
walk(root, files)

let hits = 0
for (const file of files) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const { name, re } of PATTERNS) {
    const m = text.match(re)
    if (m) {
      hits++
      console.error(`[check:release] SECRETO/falla: ${name} en ${file} (${m[0].slice(0, 8)}…)`)
    }
  }
}

if (hits > 0) {
  console.error(`[check:release] FALLO: ${hits} coincidencia(s) de secreto en dist/`)
  process.exit(1)
}

console.log(`[check:release] OK: sin claves de API embebidas en dist/ (${files.length} archivos revisados)`)