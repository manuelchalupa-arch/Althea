import { describe, it, expect } from 'vitest'
import { todayKey, toDateKey, dayKeyOffset, daysBetween, weekdayOfKey, isDateKey } from '@/utils/dates'

describe('dates — claves de día LOCALES (§1M-A)', () => {
  it('parsea fechas como día local (no UTC): instantes del día local → misma clave', () => {
    const localNoon = new Date()
    localNoon.setHours(12, 0, 0, 0)
    expect(toDateKey(localNoon)).toBe(todayKey())

    // Un instante justo antes de medianoche LOCAL sigue siendo "hoy"
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 0, 0)
    expect(toDateKey(endOfDay)).toBe(todayKey())
  })

  it('no pierde claves en la frontera UTC (días en que UTC ≠ local): si hoy local es L, ancla es L', () => {
    // Hoy local nunca puede divergir de todayKey(): ambos usan el ancla local
    const y = new Date().getFullYear()
    const m = new Date().getMonth()
    const d = new Date().getDate()
    const manual = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    expect(todayKey()).toBe(manual)
    // getDay() local es el mismo día que el de la clave
    expect(weekdayOfKey(todayKey())).toBe(new Date().getDay())
  })

  it('dayKeyOffset cruza límites de mes/año de forma determinista', () => {
    expect(dayKeyOffset('2024-03-01', -1)).toBe('2024-02-29')
    expect(dayKeyOffset('2024-03-01', -2)).toBe('2024-02-28')
    expect(dayKeyOffset('2024-01-01', -1)).toBe('2023-12-31')
    expect(dayKeyOffset('2023-12-31', 1)).toBe('2024-01-01')
    expect(dayKeyOffset('2024-02-28', 1)).toBe('2024-02-29') // bisiesto
  })

  it('daysBetween es exacto (incluye extremos) cruzando años', () => {
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0)
    expect(daysBetween('2024-01-01', '2024-01-02')).toBe(1)
    expect(daysBetween('2023-12-31', '2024-01-01')).toBe(1)
    expect(daysBetween('2024-01-01', '2024-12-31')).toBe(365)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
  })

  it('weekdayOfKey devuelve 0=domingo…6=sábado (día local de la clave)', () => {
    expect(weekdayOfKey('2024-01-07')).toBe(0) // domingo
    expect(weekdayOfKey('2024-01-08')).toBe(1) // lunes
    expect(weekdayOfKey('2024-01-13')).toBe(6) // sábado
  })

  it('round-trip clave→fecha→clave es estable', () => {
    const key = todayKey()
    expect(toDateKey(new Date(key + 'T12:00:00'))).toBe(key)
  })

  it('isDateKey valida formato', () => {
    expect(isDateKey('2024-01-01')).toBe(true)
    expect(isDateKey('2024-1-1')).toBe(false)
    expect(isDateKey('2024/01/01')).toBe(false)
    expect(isDateKey('20240101')).toBe(false)
  })
})
