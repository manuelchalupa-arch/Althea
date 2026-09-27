import { describe, it, expect } from 'vitest'
import {
  MUSCLE_CATALOG, getMuscle, musclesForView, synergyNames, ACTIVATION_LABEL,
} from './muscleCatalog'
import { MUSCLE_SHAPES, SILHOUETTE, MIRROR_TRANSFORM } from './muscleGeometry'
import { MUSCLE_GROUPS } from './muscleGroups'

describe('muscleCatalog', () => {
  it('cada músculo tiene id único, nombre español y técnico', () => {
    const ids = MUSCLE_CATALOG.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MUSCLE_CATALOG) {
      expect(m.nameEs.length).toBeGreaterThan(2)
      expect(m.nameAnatomy.length).toBeGreaterThan(2)
      expect(MUSCLE_GROUPS).toContain(m.group)
      expect(ACTIVATION_LABEL[m.activation]).toBeTruthy()
    }
  })

  it('cada músculo declara vista frontal o posterior', () => {
    for (const m of MUSCLE_CATALOG) {
      expect(['front', 'back']).toContain(m.view)
    }
    expect(musclesForView('front').length).toBeGreaterThan(0)
    expect(musclesForView('back').length).toBeGreaterThan(0)
  })

  it('los sinergistas referencian músculos existentes y se resuelven a nombres', () => {
    for (const m of MUSCLE_CATALOG) {
      for (const s of m.synergists) {
        expect(getMuscle(s), `${m.id} → ${s}`).toBeTruthy()
      }
      expect(synergyNames(m).every(n => n.length > 0)).toBe(true)
    }
  })
})

describe('muscleGeometry', () => {
  it('la geometría existe para exactamente los músculos del catálogo', () => {
    for (const view of ['front', 'back'] as const) {
      const geo = MUSCLE_SHAPES[view].map(s => s.id).sort()
      const cat = musclesForView(view).map(m => m.id).sort()
      expect(geo).toEqual(cat)
      expect(SILHOUETTE[view].length).toBeGreaterThan(0)
    }
  })

  it('cada músculo dibuja al menos un path cerrado', () => {
    for (const view of ['front', 'back'] as const) {
      for (const s of MUSCLE_SHAPES[view]) {
        expect(s.paths.length).toBeGreaterThan(0)
        for (const d of s.paths) {
          expect(d.startsWith('M')).toBe(true)
          expect(d).toMatch(/[Zz]$/)
        }
      }
    }
  })

  it('el reflejo izquierda/derecha usa la transformación espejo', () => {
    expect(MIRROR_TRANSFORM).toBe('translate(120,0) scale(-1,1)')
  })

  it('los ids de sinergistas cruzados existen en la geometría de su vista', () => {
    for (const view of ['front', 'back'] as const) {
      const ids = new Set(MUSCLE_SHAPES[view].map(s => s.id))
      for (const m of musclesForView(view)) {
        for (const s of m.synergists) {
          // un sinergista puede estar en la otra vista (biceps ↔ lats), pero
          // si está en la misma tiene que tener geometría
          const other = getMuscle(s)
          if (other && other.view === view) { expect(ids.has(s), `${m.id} → ${s}`).toBe(true) }
        }
      }
    }
  })
})
