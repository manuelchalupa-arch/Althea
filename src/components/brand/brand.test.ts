import { describe, it, expect } from 'vitest'
import { ICONS, NAV_ITEMS, MAS_GROUPS, ICON_MANIFEST, iconSrc, type NavItem } from './icons'
import { sigilForSection, sectionForPath, type TempleSection } from './temple'

const SEMANTIC = /^[a-z0-9-]+\.svg$/
const BANNED = /icon\d|final|newicon|definitiv/i
const GROUPS = new Set(['navigation', 'more', 'actions', 'modules'])

describe('manifiesto de iconos (§14-16, §19)', () => {
  it('nombres semánticos, sin icon1/final/newicon', () => {
    expect(ICON_MANIFEST.length).toBeGreaterThan(30)
    for (const e of ICON_MANIFEST) {
      const file = e.path.split('/').pop() || ''
      expect(file).toMatch(SEMANTIC)
      expect(file).not.toMatch(BANNED)
      expect(GROUPS.has(ICONS[e.name].group)).toBe(true)
    }
  })
  it('logo + 5 navegación + opciones Más presentes', () => {
    for (const n of ['logo', 'home', 'training', 'nutrition', 'progress', 'more']) {
      expect(ICONS[n], n).toBeTruthy()
    }
    const masNames = MAS_GROUPS.flatMap((g) => g.items.map((i) => i.icon))
    for (const n of masNames) expect(ICONS[n], String(n)).toBeTruthy()
  })
  it('toda entrada de nav/menú resuelve a un archivo', () => {
    const check = (n: NavItem['icon'] | string) => expect(iconSrc(String(n))).toMatch(/^\/assets\/icons\//)
    NAV_ITEMS.forEach((i) => check(i.icon))
    MAS_GROUPS.forEach((g) => g.items.forEach((i) => check(i.icon)))
  })
  it('entrenamiento conserva prioridad visual', () => {
    expect(NAV_ITEMS.find((i) => i.to === '/entrenar')?.priority).toBe(true)
  })
})

describe('sigilos por sección (§10, §27)', () => {
  it('cada sección mapea a una variante conocida', () => {
    const sections: TempleSection[] = ['inicio', 'entrenar', 'nutricion', 'progreso', 'mas', 'biblioteca', 'rutina', 'calendario', 'recuperacion', 'perfil', 'coach', 'default']
    const kinds = new Set(sections.map(sigilForSection))
    expect(kinds.size).toBeGreaterThan(1) // variedad sutil
    expect(kinds.size).toBeLessThanOrEqual(7) // un mismo universo
  })
  it('rutas conocidas resuelven sección', () => {
    expect(sectionForPath('/')).toBe('inicio')
    expect(sectionForPath('/entrenar')).toBe('entrenar')
    expect(sectionForPath('/progreso')).toBe('progreso')
    expect(sectionForPath('/rutinas')).toBe('rutina')
    expect(sectionForPath('/no-existe')).toBe('default')
  })
})
