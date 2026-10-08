import { describe, it, expect } from 'vitest'
import {
  MUSCLE_CATALOG, getMuscle, musclesForView, synergyNames, ACTIVATION_LABEL,
} from './muscleCatalog'
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


