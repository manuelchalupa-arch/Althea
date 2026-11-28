import { expect, test } from '@playwright/test'

/**
 * Recorrido real de navegador para el tramo onboarding → invitación.
 *
 * Cubre lo que la prueba de componente NO cubre: el gate de App.tsx deja
 * entrar a /onboarding, el perfil se guarda en Dexie y la navegación real
 * termina en la invitación original. Usa modo offline para no depender de
 * cuentas reales; el tramo registro/login se verificó manualmente con Auth
 * Emulator y se documenta como recorrido manual, no como E2E automatizado.
 */
test.describe('Grupos — retorno a la invitación desde onboarding', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('completar el perfil vuelve a la invitación guardada', async ({ page }) => {
    const token = 'a'.repeat(64)
    const invitePath = `/crossfit/invitacion/${token}`
    await page.addInitScript((path) => {
      ;(window as unknown as Record<string, unknown>).__ALTHEA_SPLASH_SHOWN_THIS_DOCUMENT__ = true
      localStorage.setItem('althea:offlineMode', '1')
      sessionStorage.setItem('althea:groups-invite-return', path)
    }, invitePath)

    await page.goto('/onboarding')
    await expect(page.getByText('PASO 1 DE 8')).toBeVisible()

    await page.getByText('Gimnasio tradicional').click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByText('Ganar masa muscular').click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByText('Principiante').click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByText('Lun', { exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByText('Personalizar equipamiento').click()
    await page.getByText('Mancuernas', { exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByRole('button', { name: 'COMENZAR →' }).click()

    await expect(page).toHaveURL(new RegExp(`/crossfit/invitacion/${token}$`))
    expect(await page.evaluate(() => sessionStorage.getItem('althea:groups-invite-return'))).toBeNull()
  })
})
