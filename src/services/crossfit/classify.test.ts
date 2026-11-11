import { describe, it, expect } from 'vitest'
import { classifyModalities, modalityOfMovement, sessionKindOf } from './classify'

describe('classify — clasificación automática G/M/W', () => {
  it('movimientos del catálogo se clasifican por su modalidad', () => {
    expect(modalityOfMovement('Bar Muscle-Up')).toBe('G')
    expect(modalityOfMovement('Thruster')).toBe('W')
    expect(modalityOfMovement('Rowing')).toBe('M')
    expect(modalityOfMovement('Back Squat')).toBe('W')
  })

  it('reglas de respaldo para movimientos fuera del catálogo', () => {
    expect(modalityOfMovement('Ring Row')).toBe('G') // no es remo
    expect(modalityOfMovement('Handstand Push-Up')).toBe('G') // no es press
    expect(modalityOfMovement('Battle Ropes')).toBe('M') // default
  })

  it('ejemplos de clasificación de WOD del prompt', () => {
    expect(classifyModalities(['Running', 'Rowing'])).toEqual(['M'])
    expect(classifyModalities(['Pull-Ups', 'Push-Ups'])).toEqual(['G'])
    expect(classifyModalities(['Back Squat', 'Deadlift'])).toEqual(['W'])
    expect(classifyModalities(['Thruster', 'Pull-Ups'])).toEqual(['G', 'W'])
    expect(classifyModalities(['Remo', 'Thrusters', 'Toes-to-Bar'])).toEqual(['G', 'M', 'W'])
  })

  it('ordena siempre G, M, W y elimina duplicados', () => {
    expect(classifyModalities(['Thruster', 'Burpees', 'Toes-to-Bar', 'Rowing'])).toEqual(['G', 'M', 'W'])
    expect(classifyModalities([])).toEqual([])
    expect(classifyModalities(['  '])).toEqual([])
  })

  it('sessionKindOf arma la clase de sesión de la programación', () => {
    expect(sessionKindOf(['W', 'G'])).toBe('G+W')
    expect(sessionKindOf(['M'])).toBe('M')
    expect(sessionKindOf(['G', 'M', 'W'])).toBe('G+M+W')
    expect(sessionKindOf([])).toBe('rest')
  })
})
