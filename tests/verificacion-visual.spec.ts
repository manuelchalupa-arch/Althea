import { test, expect, type Locator, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'

/**
 * Recorrido visual REAL por la app (390×844) contra el servidor local.
 * Hace onboarding desde cero (sin escribir IndexedDB), crea la rutina por la
 * UI, la reordena, arma la superserie y entra al entrenamiento. Cada paso deja
 * captura en shots/verificacion-ui/ y el log de acciones en recorrido.txt.
 *
 *   npx playwright test tests/verificacion-visual.spec.ts --project=chromium --workers=1 --reporter=line
 */

const OUT = 'shots/verificacion-ui'

test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 20_000 })
test.setTimeout(600_000)

const log: string[] = []
const step = (s: string) => { log.push(`${new Date().toISOString()}  ${s}`); console.log(`· ${s}`) }

/** Elemento visible por aria-label (evita la copia oculta del layout de escritorio). */
const byLabel = (page: Page, name: string) =>
  page.locator(`a[aria-label="${name}"]:visible, button[aria-label="${name}"]:visible`).first()

async function shot(page: Page, name: string) {
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

/** Captura desde el inicio de `target` (deja 50 px para el aviso de actualización). */
async function shotAt(page: Page, name: string, target: Locator) {
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -50))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

const dayRows = (page: Page, day: number) => page.locator(`[data-exrow][data-day="${day}"]`)

async function tap(page: Page, re: RegExp) {
  const b = page.locator('button:visible').filter({ hasText: re }).first()
  await expect(b).toBeVisible({ timeout: 20_000 })
  await b.click()
}

/** Arrastra la fila `from` del día 1 a la posición `to` usando el grip. */
async function dragRowTo(page: Page, from: number, to: number) {
  const rows = page.locator('[data-exrow][data-day="2"]')
  const center = (l: Locator) => l.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await center(rows.nth(from))
  const grip = rows.nth(from).locator('button[aria-label^="Reordenar"]')
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  const dir = to > from ? 1 : -1
  for (let i = from + dir; ; i += dir) {
    const row = rows.nth(i)
    await center(row)
    const box = (await row.boundingBox())!
    const fx = i % 2 === 0 ? 0.65 : 0.35
    await page.mouse.move(box.x + box.width * fx, box.y + box.height / 2, { steps: 4 })
    await page.waitForTimeout(150)
    if (i === to) { break }
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

test('recorrido visual: modalidades, simplificada, superserie, reorden y entrenar', async ({ page }) => {
  const dayOrder = async () =>
    (await page.locator('[data-exrow][data-day="2"] .font-medium').allTextContents()).map((s) => s.trim())

  /* ── 0. Entrada: login sin cuenta + onboarding por la UI ── */
  await page.goto('/')
  await tap(page, /Continuar sin cuenta/i)
  step('Login: "Continuar sin cuenta"')

  await expect(page.getByText(/Cuál es tu objetivo principal/i)).toBeVisible({ timeout: 30_000 })
  await tap(page, /Ganar masa muscular/)
  await tap(page, /Siguiente/)
  step('Onboarding 1/7: objetivo = Ganar masa muscular')

  await expect(page.getByText(/Paso 2 de 7/i)).toBeVisible({ timeout: 15_000 })
  await tap(page, /^Intermedio/)
  await tap(page, /Siguiente/)
  step('Onboarding 2/7: experiencia = Intermedio')

  await expect(page.getByText(/Paso 3 de 7/i)).toBeVisible({ timeout: 15_000 })
  for (const d of ['Lun', 'Mié', 'Vie']) { await page.getByRole('button', { name: d, exact: true }).click() }
  await tap(page, /Siguiente/)
  step('Onboarding 3/7: días = Lun, Mié, Vie')

  await expect(page.getByText(/Paso 4 de 7/i)).toBeVisible({ timeout: 15_000 })
  for (const e of ['Barra', 'Mancuernas', 'Máquinas']) { await page.getByRole('button', { name: e, exact: true }).click() }
  await tap(page, /Siguiente/)
  step('Onboarding 4/7: equipamiento = Barra, Mancuernas, Máquinas')

  await expect(page.getByText(/Paso 5 de 7/i)).toBeVisible({ timeout: 15_000 })
  await tap(page, /Siguiente/)
  await expect(page.getByText(/Paso 6 de 7/i)).toBeVisible({ timeout: 15_000 })
  await tap(page, /Siguiente/)
  step('Onboarding 5-6/7: horario y coach por defecto')

  await expect(page.getByText(/Paso 7 de 7/i)).toBeVisible({ timeout: 15_000 })
  await page.getByPlaceholder('Manuel', { exact: true }).fill('Nico')
  await page.getByPlaceholder('manuel@mail.com', { exact: true }).fill('nico@verificacion.local')
  await page.getByPlaceholder('80', { exact: true }).fill('80')
  await page.getByPlaceholder('180', { exact: true }).fill('175')
  await tap(page, /Comenzar/i)
  await expect(page.getByText(/Hola, Nico/i)).toBeVisible({ timeout: 30_000 })
  step('Onboarding 7/7 completado → Inicio con perfil Nico')

  /* ── 1. Rutinas desde la navegación normal (Más → Rutinas) ── */
  await byLabel(page, 'Más').click()
  await page.getByRole('link', { name: /Rutinas/ }).first().click()
  await expect(page).toHaveURL(/\/rutina/)
  step('Navegación: Más → Rutinas')

  await page.locator('button[aria-expanded]').first().click()
  await page.getByRole('button', { name: /Nueva rutina/i }).first().click()
  await expect(page.locator('[role="group"][aria-label="Modalidad de rutina"]')).toBeVisible({ timeout: 15_000 })
  await shot(page, '01-eleccion-modalidades')
  step('Rutinas → Nueva rutina: diálogo con "Rutina asistida" y "Rutina simplificada"')

  /* ── 2. Rutina simplificada completa ── */
  await page.getByRole('button', { name: 'Rutina simplificada' }).click()
  await page.getByPlaceholder(/Rutina de verano/).fill('Verificación simplificada UI')
  await shot(page, '01b-modalidad-simplificada')
  await page.getByRole('button', { name: 'Crear rutina' }).click()
  const dialog = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await shot(page, '02-formulario-simplificada')
  step('Simplificada: nombre libre + formulario manual abierto')

  // Hoy la app entrena el día 2 del ciclo (martes): cerramos el formulario del
  // día 1 y cargamos los ejercicios en el día que realmente se entrena hoy.
  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  const manuals = page.getByRole('button', { name: 'Manual', exact: true })
  await expect(manuals.nth(1)).toBeVisible({ timeout: 15_000 })
  await manuals.nth(1).click()
  const form = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
  await expect(form).toBeVisible({ timeout: 20_000 })
  await expect(form.getByText(/Día N°2/)).toBeVisible()
  step('Formulario manual abierto para el Día N°2 (el de hoy)')

  const exs = [
    { name: 'Press banca', muscle: 'pectorales', kg: 80 },
    { name: 'Remo con barra', muscle: 'dorsales', kg: 60 },
    { name: 'Sentadilla', muscle: 'cuadriceps', kg: 100 },
    { name: 'Peso muerto', muscle: 'isquiotibiales', kg: 90 },
  ]
  for (const e of exs) {
    await form.getByPlaceholder(/Press plano con mancuernas/).fill(e.name)
    const nums = form.locator('input[type="number"]')
    await nums.nth(0).fill('3'); await nums.nth(1).fill('8')
    await nums.nth(2).fill(String(e.kg)); await nums.nth(3).fill('90')
    await form.locator('select[aria-label="Músculo principal"]').selectOption(e.muscle)
    await form.getByRole('button', { name: 'Agregar ejercicio' }).click()
    await expect(form.getByRole('button', { name: 'Agregar ejercicio' })).toBeEnabled({ timeout: 20_000 })
  }
  await form.getByRole('button', { name: 'Listo' }).click()
  await expect(form).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('[data-exrow][data-day="2"]')).toHaveCount(4, { timeout: 20_000 })
  await shotAt(page, '03-rutina-simplificada-controles', dayRows(page, 2).first())
  step('Simplificada guardada: 4 ejercicios con controles SS, subir/bajar y grip')

  /* ── 3. Reorden: botones + arrastre, y persistencia tras recarga ── */
  await shotAt(page, '05-orden-antes', dayRows(page, 2).first())
  await page.locator('button[aria-label="Bajar Press banca"]').click()
  await expect.poll(dayOrder).toEqual(['Remo con barra', 'Press banca', 'Sentadilla', 'Peso muerto'])
  step('Reorden por botón: Bajar Press banca')

  await dragRowTo(page, 3, 0)
  await expect.poll(dayOrder).toEqual(['Peso muerto', 'Remo con barra', 'Press banca', 'Sentadilla'])
  step('Reorden por arrastre del grip: Peso muerto 3→0')

  await page.reload()
  await expect(page.locator('[data-exrow][data-day="2"]')).toHaveCount(4, { timeout: 30_000 })
  await expect.poll(dayOrder).toEqual(['Peso muerto', 'Remo con barra', 'Press banca', 'Sentadilla'])
  await shotAt(page, '06-orden-despues-recarga', dayRows(page, 2).first())
  step('Recarga: el orden reordenado persiste')

  /* ── 4. Superserie de 4 ── */
  for (const n of ['Peso muerto', 'Remo con barra', 'Press banca', 'Sentadilla']) {
    await page.locator(`button[aria-label="Superserie ${n}"]`).click()
  }
  await expect(page.getByText(/Superserie: 4 seleccionados/i)).toBeVisible({ timeout: 15_000 })
  await shotAt(page, '04a-superserie-seleccion', page.getByText(/Superserie: 4 seleccionados/i))
  await page.getByRole('button', { name: /Crear bloque/i }).click()
  await expect(page.getByText('SS 1/4')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('SS 4/4')).toBeVisible()
  await shotAt(page, '04b-superserie-4-creada', dayRows(page, 2).first())
  step('Superserie: 4 ejercicios seleccionados → bloque SS 1/4 … SS 4/4')

  await page.reload()
  await expect(page.getByText('SS 1/4')).toBeVisible({ timeout: 30_000 })
  step('Recarga: el bloque de 4 persiste')

  /* ── 5. Entrenamiento con controles esenciales ── */
  await byLabel(page, 'Inicio').click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: /Comenzar entrenamiento/i }).first().click()
  await expect(page).toHaveURL(/\/entrenar/)
  await expect(page.locator('button[aria-label="Confirmar serie 1"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Registrar/i).first()).toBeVisible()
  await expect(page.locator('input[aria-label="modo R serie 1"]')).toBeVisible()
  // El control esencial no puede quedar fuera del viewport en un teléfono de 390 px.
  const reg = await page.locator('button[aria-label="Confirmar serie 1"]').boundingBox()
  expect(reg!.x + reg!.width).toBeLessThanOrEqual(391)
  await shot(page, '07-entrenar-controles')
  step('Inicio → Comenzar → Entrenar: Registrar, modo R y series visibles')

  /* ── 6. Rutina asistida: al crearla se abre el selector inteligente ── */
  await byLabel(page, 'Más').click()
  await page.getByRole('link', { name: /Rutinas/ }).first().click()
  await page.locator('button[aria-expanded]').first().click()
  await page.getByRole('button', { name: /Nueva rutina/i }).first().click()
  await page.getByRole('button', { name: 'Rutina asistida' }).click()
  await page.getByPlaceholder(/Rutina de verano/).fill('Verificación asistida UI')
  await page.getByRole('button', { name: 'Crear rutina' }).click()
  await expect(page.getByText('Rutina asistida').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Agregar ejercicio').first()).toBeVisible()
  await shot(page, '08-selector-asistida-badge')
  step('Asistida: crear rutina abre el selector inteligente (badge "Rutina asistida")')

  writeFileSync(`${OUT}/recorrido.txt`, log.join('\n') + '\n')
})
