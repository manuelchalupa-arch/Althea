import { describe, it, expect } from 'vitest'
import { NAV_ITEMS, MAS_GROUPS } from '@/components/brand/icons'
import { TOGGLEABLE_SECTIONS } from '@/hooks/useVisibleSections'
import { SECTION_TITLES, sectionForPath } from '@/components/brand/temple'

/**
 * Guardia de unificación de nombres de secciones (auditoría §3.A):
 * una misma ruta no puede presentar labels distintos según la lista
 * desde la que se consulte (nav principal, menú Más/sidebar, toggles
 * de "Secciones de la app" ni el título del header).
 */
const toggleByIcon = new Map(TOGGLEABLE_SECTIONS.map((s) => [s.icon, s.label]))
const navByRoute = new Map(NAV_ITEMS.map((i) => [i.to, i.label]))
const masItems = MAS_GROUPS.flatMap((g) => g.items)

describe('unificación de labels de secciones', () => {
  it('NAV_ITEMS y MAS_GROUPS coinciden en label para la misma ruta', () => {
    for (const item of masItems) {
      const navLabel = navByRoute.get(item.to)
      if (navLabel) {
        expect(item.label, `ruta ${item.to}`).toBe(navLabel)
      }
    }
  })

  it('el label de cada ítem coincide con el toggle de "Secciones de la app" de su icono', () => {
    for (const item of [...NAV_ITEMS, ...masItems]) {
      const toggleLabel = toggleByIcon.get(String(item.icon))
      if (toggleLabel) {
        expect(item.label, `icono ${String(item.icon)}`).toBe(toggleLabel)
      }
    }
  })

  it('el título del header coincide con el label del menú para cada ruta conocida', () => {
    const routes = [...new Set([...NAV_ITEMS.map((i) => i.to), ...masItems.map((i) => i.to)])]
    for (const route of routes) {
      const section = sectionForPath(route)
      if (section === 'default') { continue }
      const title = SECTION_TITLES[section]
      const expected = navByRoute.get(route) ?? masItems.find((i) => i.to === route)?.label
      expect(title, `ruta ${route}`).toBe(expected)
    }
  })
})
