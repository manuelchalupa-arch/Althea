import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from './db'
import { exportPDF } from './export'
import { toDateKey } from '@/utils/dates'

// FASE 2 - S7:
//  - exportPDF imprimia `l.createdAt.slice(0,10)`: el dia UTC de un instante real.
//    Un set hecho a las 21:30 en Argentina se exportaba con la fecha de manana.
// FASE 2 - S9: getTodayLocalDate() se elimino (0 llamadores, 0 exportaciones de
//    API pública). El bloque que lo cubria tambien. La cobertura que queda para
//    el patron "recortar un instante a 10 caracteres" vive en los otros 6 archivos
//    de regresion de S7.
const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

describe('S7 - exportPDF imprime la fecha civil local de cada serie', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('un set de las 21:30 se exporta con su dia local, no con el dia UTC', async () => {
    // instante real de un set hecho el 2026-03-10 a las 21:30 hora Argentina
    const createdAt = atLocal(2026, 3, 10, 21, 30).toISOString()
    expect(createdAt).toBe('2026-03-11T00:30:00.000Z') // su dia UTC es manana
    expect(toDateKey(createdAt)).toBe('2026-03-10') // su dia civil es hoy

    await db.setLogs.put({
      id: 'l1', sessionId: 's1', exerciseId: 'press', setNumber: 1,
      weight: 100, reps: 10, completed: true, createdAt,
    } as never)

    let captured: Blob | null = null
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => { captured = b; return 'blob:mock' },
    })
    vi.spyOn(window, 'open').mockReturnValue({ print: () => {} } as never)

    await exportPDF()

    expect(captured).not.toBeNull()
    const html = await (captured as unknown as Blob).text()
    expect(html).toContain('<td>2026-03-10</td>') // dia civil local
    expect(html).not.toContain('<td>2026-03-11</td>') // nunca el dia UTC
  })
})
