import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * Verificación del rediseño visual (v2 editorial) contra `vite preview`.
 *
 *  · Onboarding real una vez (sin escribir IndexedDB a mano).
 *  · Captura cada pantalla principal a 390 px.
 *  · Repite Inicio + Rutinas en las 8 anchuras pedidas y comprueba que
 *    ninguna desborde en horizontal.
 *
 *   npm run build
 *   npx playwright test tests/verificacion-rediseno.spec.ts --project=chromium --workers=1 --reporter=line
 */

const OUT = 'shots/rediseno'
const ANCHOS = [360, 375, 390, 412, 430, 768, 1366, 1440]
const RUTAS: Array<{ ruta: string; nombre: string }> = [
  { ruta: '/', nombre: 'inicio' },
  { ruta: '/rutina', nombre: 'rutina' },
  { ruta: '/nutricion', nombre: 'nutricion' },
  { ruta: '/progreso', nombre: 'progreso' },
  { ruta: '/crossfit', nombre: 'crossfit' },
  { ruta: '/biblioteca', nombre: 'biblioteca' },
  { ruta: '/perfil', nombre: 'perfil' },
  { ruta: '/mas', nombre: 'mas' },
]

test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 20_000 })
test.setTimeout(900_000)

const informe: string[] = []

async function tap(page: Page, re: RegExp) {
  const b = page.locator('button:visible').filter({ hasText: re }).first()
  await expect(b).toBeVisible({ timeout: 20_000 })
  await b.click()
}

async function asentar(page: Page) {
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
}

test('rediseño: pantallas a 390 y 8 anchuras sin desbordes', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })

  const abrir = async (ruta: string) => {
    await page.goto(ruta)
    await expect(page.locator('h1:visible').first()).toBeVisible({ timeout: 30_000 })
    await asentar(page)
  }

  /* ── Onboarding real ── */
  await page.goto('/')
  await tap(page, /Continuar sin cuenta/i)
  await tap(page, /Ganar masa muscular/)
  await tap(page, /Siguiente/)
  await tap(page, /^Intermedio/)
  await tap(page, /Siguiente/)
  for (const d of ['Lun', 'Mié', 'Vie']) await page.getByRole('button', { name: d, exact: true }).click()
  await tap(page, /Siguiente/)
  for (const e of ['Barra', 'Mancuernas', 'Máquinas']) await page.getByRole('button', { name: e, exact: true }).click()
  await tap(page, /Siguiente/)
  await tap(page, /Siguiente/)
  await tap(page, /Siguiente/)
  await page.getByPlaceholder('Manuel', { exact: true }).fill('Nico')
  await page.getByPlaceholder('manuel@mail.com', { exact: true }).fill('nico@rediseno.local')
  await page.getByPlaceholder('80', { exact: true }).fill('80')
  await page.getByPlaceholder('180', { exact: true }).fill('175')
  await tap(page, /Comenzar/i)
  await expect(page.getByText(/Hola, Nico/i)).toBeVisible({ timeout: 30_000 })
  informe.push('onboarding completado (Nico, 80 kg, 175 cm)')

  /* ── Pantallas principales a 390 ── */
  for (const { ruta, nombre } of RUTAS) {
    await abrir(ruta)
    await page.screenshot({ path: `${OUT}/390-${nombre}.png`, fullPage: true })
    informe.push(`390 ${nombre}`)
  }

  /* ── Modo oscuro en Inicio ── */
  await abrir('/')
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('althea:theme', 'dark')
  })
  await asentar(page)
  await page.screenshot({ path: `${OUT}/390-inicio-oscuro.png`, fullPage: true })
  informe.push('390 inicio (oscuro)')
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('althea:theme', 'light')
  })

  /* ── 8 anchuras: Inicio y Rutinas, con test de desborde ── */
  for (const w of ANCHOS) {
    await page.setViewportSize({ width: w, height: w >= 768 ? 900 : 844 })
    for (const { ruta, nombre } of [RUTAS[0], RUTAS[1]]) {
      await abrir(ruta)
      const desborde = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
        culpables: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 1 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed'
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`),
      }))
      if (desborde.doc > desborde.win + 1) {
        informe.push(`DESBORDE ${w}px ${nombre}: doc=${desborde.doc} win=${desborde.win} → ${desborde.culpables.join(', ')}`)
      } else {
        informe.push(`${w}px ${nombre}: sin desborde`)
      }
      await page.screenshot({ path: `${OUT}/${w}-${nombre}.png`, fullPage: true })
    }
  }

  /* ── Táctiles de la barra inferior (solo móvil) ── */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await asentar(page)
  const chicos = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('nav a, nav button')]
      .map((el) => ({ t: el.getAttribute('aria-label') ?? el.textContent?.trim(), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.width < 44 || x.r.height < 44))
      .map((x) => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`),
  )
  informe.push(chicos.length ? `TÁCTIL <44px: ${chicos.join(', ')}` : 'táctil: todos los destinos de nav ≥44px')

  writeFileSync(`${OUT}/informe.txt`, informe.join('\n') + '\n')
  expect(informe.filter((l) => l.startsWith('DESBORDE'))).toEqual([])
  expect(chicos).toEqual([])
})
