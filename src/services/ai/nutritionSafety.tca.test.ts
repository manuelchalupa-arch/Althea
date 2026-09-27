import { describe, it, expect } from 'vitest'
import { checkTCA } from './nutritionSafety'
import type { NutritionUserProfile } from './nutritionMethods'

// FASE 2 - S9 - regresion de la red de seguridad de TCA.
//
// El detector de antecedentes de trastorno de conducta alimentaria comparaba el
// texto del usuario contra una lista de indicadores. Dos de esos indicadores
// estaban rotos:
//   - 'com?????ivo'  -> texto corrupto. `answer.includes('com?????ivo')` jamas
//                       fue true para ninguna entrada humana.
//   - 'atracon'      -> solo cubria la forma sin tilde, y la comparacion es
//                       sobre texto en minusculas SIN normalizar acentos, asi que
//                       "atracon" con tilde nunca coincidia.
// Una red de seguridad que no dispara es peor que no tenerla: el usuario veia un
// mensaje normal del Coach mientras su propia respuesta describia el problema.

const base: NutritionUserProfile = {
  weightKg: 60, heightCm: 165, age: 30, sex: 'female', activityLevel: 'moderado',
} as NutritionUserProfile

const hasTcaAlert = (answer: string) =>
  checkTCA(base, [{ key: 'q1', answer }]).some(a => a.category === 'tca' && a.severity === 'critical')

describe('S9 - el detector de TCA coincide con el texto real del usuario', () => {
  it('detecta "compulsivo" (el indicador antes corrupto no detectaba nada)', () => {
    expect(hasTcaAlert('Siento que como de forma compulsiva')).toBe(true)
    expect(hasTcaAlert('Mi comportamiento es compulsivo con la comida')).toBe(true)
  })

  it('detecta "compulsion" con tilde', () => {
    expect(hasTcaAlert('Tengo una compulsión por comer')).toBe(true)
  })

  it('detecta "atracon" con y sin tilde', () => {
    expect(hasTcaAlert('Ayer hice un atracón enorme')).toBe(true)
    expect(hasTcaAlert('ayer hice un atracon enorme')).toBe(true)
  })

  it('sigue detectando los indicadores que ya funcionaban', () => {
    expect(hasTcaAlert('A veces tengo que purgar')).toBe(true)
    expect(hasTcaAlert('Siento culpa al comer')).toBe(true)
    expect(hasTcaAlert('Tengo miedo a engordar')).toBe(true)
  })

  it('NO dispara con una conversacion normal de nutricion', () => {
    expect(hasTcaAlert('Como 200g de pollo y 3 huevos al mediodia')).toBe(false)
    expect(hasTcaAlert('Queria saber cuantas calorias tiene el arroz')).toBe(false)
  })

  it('NO dispara si el usuario no respondio nada', () => {
    expect(checkTCA(base, [{ key: 'q1', answer: '' }]).some(a => a.severity === 'critical')).toBe(false)
  })
})
