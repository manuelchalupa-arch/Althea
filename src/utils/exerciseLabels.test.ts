import { describe, it, expect } from 'vitest'
import { displayBodyPart, displayCategory, displayEquipment, displayDifficulty } from './exerciseLabels'

describe('exerciseLabels — valores del catálogo en español', () => {
  it('traduce partes, categorías y equipos del inglés', () => {
    expect(displayBodyPart('chest')).toBe('Pecho')
    expect(displayCategory('strength')).toBe('Fuerza')
    expect(displayEquipment('barbell')).toBe('Barra')
    expect(displayDifficulty('intermediate')).toBe('Intermedio')
  })

  it('capitaliza los equipos que ya vienen en español y respeta lo desconocido', () => {
    expect(displayEquipment('máquina')).toBe('Máquina')
    expect(displayEquipment('')).toBe('')
    expect(displayEquipment('inventado')).toBe('inventado')
    expect(displayCategory('inventado')).toBe('inventado')
  })
})
