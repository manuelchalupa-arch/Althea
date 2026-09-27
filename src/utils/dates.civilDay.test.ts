import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayKey, toDateKey, toLocalDateKey, dayKeyOffset, daysBetween, weekdayOfKey, isDateKey, parseLocalDateKey, weekStartKey, monthStartKey } from '@/utils/dates'
import { aggregateVolumeLandmarks } from '@/services/training/prs'
import { getTrainingDayForDate, getLoadForDate, formatAgendaDate, type CycleConfig } from '@/utils/cycle'

// FASE 2 - S7: contrato de FECHA CIVIL LOCAL vs INSTANTE REAL.
// El runner de tests corre en America/Buenos_Aires (UTC-3), donde la ventana
// 21:00-23:59 local es aquella en que UTC ya va al dia siguiente. Ahi es donde
// el patron `new Date().toISOString().slice(0,10)` entrega el dia equivocado.
const mondayOf = (key: string) => dayKeyOffset(key, -((weekdayOfKey(key) + 6) % 7))

afterEach(() => { vi.useRealTimers() })

describe('S7 - 1. INSTANTE REAL ≠ FECHA CIVIL', () => {
  it('un instante NO se recorta con slice(0,10): a las 21:30 AR el dia local es el anterior', () => {
    // 2026-03-10 21:30 hora Argentina == 2026-03-11T00:30Z
    const instant = new Date('2026-03-11T00:30:00.000Z')
    expect(toDateKey(instant)).toBe('2026-03-10')
    // el recorte ingenuo (el bug) da manana
    expect(instant.toISOString().slice(0, 10)).toBe('2026-03-11')
  })

  it('de madrugada el instante pertenece al dia local ANTERIOR al dia UTC', () => {
    // 2026-03-11 00:30 AR == 2026-03-11T03:30Z
    expect(toDateKey(new Date('2026-03-11T03:30:00.000Z'))).toBe('2026-03-11')
    // 2026-03-10 21:30 AR == 2026-03-11T00:30Z -> dia civil 10, dia UTC 11
    expect(toDateKey(new Date('2026-03-11T00:30:00.000Z'))).toBe('2026-03-10')
  })

  it('el timestamp se conserva intacto como instante ISO: toDateKey no lo muta', () => {
    const iso = '2026-03-11T00:30:00.000Z'
    const d = new Date(iso)
    expect(d.toISOString()).toBe(iso)
    expect(toDateKey(d)).toBe('2026-03-10')
  })
})

describe('S7 - 2. CAMBIO DE DIA ALREDEDOR DE MEDIANOCHE (reloj falso)', () => {
  it('23:59:59 y 00:00:01 locales son dias distintos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 59))
    const antes = todayKey()
    vi.setSystemTime(new Date(2026, 2, 11, 0, 0, 1))
    const despues = todayKey()

    expect(antes).toBe('2026-03-10')
    expect(despues).toBe('2026-03-11')
    expect(daysBetween(antes, despues)).toBe(1)
  })

  it('a las 21:30 locales "hoy" sigue siendo hoy (UTC ya va al dia siguiente)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 10, 21, 30, 0))
    expect(todayKey()).toBe('2026-03-10')
    // el patron UTC (el bug corregido) daba el dia siguiente
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-03-11')
  })

  it('a la 01:00 local el dia civil es el propio, no el anterior', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11, 1, 0, 0))
    expect(todayKey()).toBe('2026-03-11')
  })
})

describe('S7 - 3. CALCULO DE WEEKDAY', () => {
  it('weekdayOfKey usa el mismo ancla local T12 que el patron consolidado', () => {
    // equivalencia probada: `new Date(k+'T12:00:00').getDay()` → weekdayOfKey(k)
    const keys = ['2026-01-05', '2026-02-28', '2026-03-01', '2026-06-15', '2026-09-23', '2026-12-31']
    for (const k of keys) {
      expect(weekdayOfKey(k)).toBe(new Date(k + 'T12:00:00').getDay())
    }
  })

  it('weekdayOfKey(hoy) === new Date().getDay() (equivalencia de Entrenar/Pr)', () => {
    // consolidamos `new Date().getDay()` → weekdayOfKey(todayKey())
    expect(weekdayOfKey(todayKey())).toBe(new Date().getDay())
  })

  it('lunes de la semana: 0=domingo, 1=lunes, y el lunes de la semana siempre es el mismo', () => {
    expect(weekdayOfKey('2026-09-20')).toBe(0) // domingo
    expect(weekdayOfKey('2026-09-21')).toBe(1) // lunes
    expect(mondayOf('2026-09-21')).toBe('2026-09-21') // lunes → sí mismo
    expect(mondayOf('2026-09-23')).toBe('2026-09-21') // miércoles → lunes 21
    expect(mondayOf('2026-09-27')).toBe('2026-09-21') // domingo 27 → lunes 21
    expect(mondayOf('2026-09-28')).toBe('2026-09-28') // lunes siguiente
  })
})

describe('S7 - 4. OFFSETS DE DIAS', () => {
  it('el cutoff de 7 dias a la 01:00 local es -6 (no -7: ventana un dia anticipada)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11, 1, 0, 0))
    // 7 dias de ventana inclusiva → empieza hace 6 dias
    expect(dayKeyOffset(todayKey(), -(7 - 1))).toBe('2026-03-05')
    expect(daysBetween(dayKeyOffset(todayKey(), -6), todayKey())).toBe(6)
  })

  it('dayKeyOffset cruza bisiesto y fin de año', () => {
    expect(dayKeyOffset('2024-02-28', 1)).toBe('2024-02-29')
    expect(dayKeyOffset('2024-02-29', 1)).toBe('2024-03-01')
    expect(dayKeyOffset('2026-12-31', 1)).toBe('2027-01-01')
    expect(dayKeyOffset('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('parseLocalDateKey devuelve el mismo dia local (mediodia, no medianoche UTC)', () => {
    const d = parseLocalDateKey('2026-03-10')
    expect(toLocalDateKey(d)).toBe('2026-03-10')
    expect(d.getHours()).toBe(12)
    expect(isDateKey('2026-03-10')).toBe(true)
  })
})

describe('S7 - 5. AGREGADOS DE VOLUMEN (PR) SIN DEPENDER DE UTC', () => {
  const sets = [
    { weight: 100, reps: 10, date: '2026-01-05' },
    { weight: 100, reps: 10, date: '2026-01-11' }, // domingo → misma semana (lunes 05)
    { weight: 100, reps: 10, date: '2026-01-12' },
    { weight: 90, reps: 8, date: '2026-02-02' },
  ]

  it('la clave semanal coincide con el lunes de la capa centralizada', () => {
    const weekly = aggregateVolumeLandmarks(sets, 'weekly')
    for (const w of weekly) {
      expect(weekdayOfKey(w.date)).toBe(1) // toda clave semanal es un lunes
    }
    const expected = Array.from(new Set(sets.map(s => mondayOf(s.date)))).sort()
    expect(weekly.map(w => w.date)).toEqual(expected)
  })

  it('la clave mensual es el dia 1 del mes local', () => {
    const monthly = aggregateVolumeLandmarks(sets, 'monthly')
    for (const m of monthly) {
      expect(m.date.endsWith('-01')).toBe(true)
    }
    const expected = Array.from(new Set(sets.map(s => s.date.slice(0, 7) + '-01'))).sort()
    expect(monthly.map(m => m.date)).toEqual(expected)
  })

  it('sobre un año entero la clave semanal siempre es el lunes de la capa centralizada', () => {
    // Recorre 365 dias consecutivos: si vuelve el patron T12→UTC, esta
    // asercion falla en zonas con offset >= +13 (allí el bug es off-by-one).
    const all: Array<{ weight: number; reps: number; date: string }> = []
    for (let i = 0; i < 365; i++) {
      all.push({ weight: 10, reps: 1, date: dayKeyOffset('2026-01-01', i) })
    }
    const weekly = aggregateVolumeLandmarks(all, 'weekly')

    expect(weekly.length).toBe(53) // 365 dias = 53 semanas
    for (const w of weekly) {
      expect(weekdayOfKey(w.date)).toBe(1)
      expect(daysBetween(w.date, dayKeyOffset(w.date, 6))).toBe(6)
    }
    // cada dia cae en la semana que dice su lunes, y el conteo por semana es
    // exactamente el número de dias del rango que pertenecen a esa semana
    const expected = new Map<string, number>()
    for (const s of all) {
      const m = mondayOf(s.date)
      expected.set(m, (expected.get(m) ?? 0) + 1)
    }
    for (const w of weekly) {
      expect(w.totalSets).toBe(expected.get(w.date))
    }
    // las semanas completas del rango tienen 7 dias
    const full = weekly.filter(w => w.totalSets === 7)
    expect(full.length).toBeGreaterThan(50)
  })
})

describe('S7 - 6. CYCLE USA LA CAPA CENTRALIZADA (weekdayOfKey/parseLocalDateKey)', () => {
  // 2026-01-05 es lunes. weekMap va 0=Dom..6=Sáb.
  const cycle: CycleConfig = {
    startDate: '2026-01-05',
    methodId: 'hypertrophy',
    trainingDays: [
      { n: 1, name: 'Lunes' },
      { n: 2, name: 'Martes' },
      { n: 3, name: 'Miercoles' },
    ],
    weekMap: [null, 1, 2, 3, null, null, null],
  }

  it('getTrainingDayForDate mapea el dia de la semana con la clave local', () => {
    expect(getTrainingDayForDate('2026-01-05', cycle).n).toBe(1) // lunes
    expect(getTrainingDayForDate('2026-01-06', cycle).n).toBe(2) // martes
    expect(getTrainingDayForDate('2026-01-07', cycle).n).toBe(3) // miercoles
    expect(getTrainingDayForDate('2026-01-08', cycle).isRest).toBe(true) // jueves
    expect(getTrainingDayForDate('2026-01-11', cycle).isRest).toBe(true) // domingo
  })

  it('getLoadForDate usa el mismo dow que weekdayOfKey (no el dia UTC)', () => {
    // sin weekLoads explícitos: NORMAL en día de treino, CARGA_CERO en descanso
    expect(getLoadForDate('2026-01-05', cycle)).toBe('NORMAL')     // dow 1
    expect(getLoadForDate('2026-01-08', cycle)).toBe('CARGA_CERO') // dow 4
    expect(getLoadForDate('2026-01-11', cycle)).toBe('CARGA_CERO') // dow 0
  })

  it('formatAgendaDate muestra el dia local correcto (mediodia, no medianoche UTC)', () => {
    const agenda = formatAgendaDate('2026-01-05')
    // new Date('2026-01-05') en AR es 4 de enero 21:00 → mostraría dayNum 4
    expect(agenda.dayNum).toBe(5)
    expect(agenda.dow).toBe(1) // lunes
  })
})

describe('S7 - 7. weekStartKey / monthStartKey (anclaje de bucket civil)', () => {
  it('weekStartKey devuelve SIEMPRE el lunes, para los 7 dias', () => {
    // semana del lunes 2026-03-09 al domingo 2026-03-15
    for (let i = 0; i < 7; i++) {
      const key = dayKeyOffset('2026-03-09', i)
      expect(weekStartKey(key)).toBe('2026-03-09')
    }
    expect(weekStartKey('2026-03-09')).toBe('2026-03-09') // lunes
    expect(weekStartKey('2026-03-15')).toBe('2026-03-09') // domingo
    expect(weekdayOfKey(weekStartKey('2026-03-15'))).toBe(1)
  })

  it('weekStartKey respeta el cambio de anio y los bisiestos', () => {
    expect(weekStartKey('2026-12-31')).toBe('2026-12-28')
    expect(weekStartKey('2027-01-01')).toBe('2026-12-28')
    expect(weekStartKey('2028-03-01')).toBe('2028-02-28') // 2028 es bisiesto
    expect(weekStartKey('2026-03-01')).toBe('2026-02-23')
  })

  it('monthStartKey recorta al dia 1 sin pasar por un Date', () => {
    expect(monthStartKey('2026-03-15')).toBe('2026-03-01')
    expect(monthStartKey('2026-12-31')).toBe('2026-12-01')
    expect(monthStartKey('2027-01-01')).toBe('2027-01-01')
  })

  it('los helpers son equivalentes a la aritmetica local que reemplazan', () => {
    for (const key of ['2026-03-09', '2026-03-15', '2026-12-31', '2027-01-01', '2028-03-01']) {
      expect(weekStartKey(key)).toBe(mondayOf(key))
    }
  })
})
