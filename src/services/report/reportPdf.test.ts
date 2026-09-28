import { describe, it, expect } from 'vitest'
import { buildReportPdf, reportFileName } from './reportPdf'
import type { ReportData } from './reportService'

/**
 * El PDF es un archivo binario: si el xref, los offsets o el /Length quedan
 * desalineados, el navegador lo rechaza sin mensaje claro. Estos tests leen los
 * bytes generados y validan la estructura, igual que haría un lector real.
 */

const data: ReportData = {
  period: '30',
  periodLabel: 'Últimos 30 días',
  range: { start: '2026-08-27', end: '2026-09-25' },
  entrenamiento: {
    diasEntrenados: 18, diasUnicos: ['2026-09-01'], sesiones: 18, volumen: 48250.4,
    series: 320, repeticiones: 9120, frecuencia: 0.6, adherencia: 72,
    rendimiento: { volumenPorSesion: 2680 },
    completadas: 16, incompletas: 2, duracionMin: 842,
    serieDiaria: [
      { fecha: '2026-09-02', volumen: 900, series: 12 },
      { fecha: '2026-09-20', volumen: 3200, series: 24 },
    ],
    gastoCalorico: {
      totalKcal: 5432.6, totalMinutes: 842, motivo: null,
      porFecha: [
        { fecha: '2026-09-02', kcal: 460.4, minutes: 55 },
        { fecha: '2026-09-20', kcal: 512.2, minutes: 62 },
      ],
    },
    distribucion: [
      { dia: 'Lun', sesiones: 6 }, { dia: 'Mar', sesiones: 2 }, { dia: 'Mié', sesiones: 3 },
      { dia: 'Jue', sesiones: 1 }, { dia: 'Vie', sesiones: 4 }, { dia: 'Sáb', sesiones: 2 },
      { dia: 'Dom', sesiones: 0 },
    ],
    diasActividad: { mayor: { fecha: '2026-09-20', volumen: 3200 }, menor: { fecha: '2026-09-02', volumen: 900 } },
    comparativa: { primeraMitad: 22000, segundaMitad: 26250.4, deltaPct: 19 },
    observaciones: ['Buena energía en la sesión del 20 de septiembre'],
    destacados: [{ exerciseId: 'pecho/press-banca', volumen: 12000 }],
  },
  fuerza: {
    pesoMax: 92.5, repeticiones: 5, volumen: 462, rmEstimado: 106.4,
    progresoPorEjercicio: [
      { exerciseId: 'pecho/press-banca', pesoMax: 92.5, reps: 5, volumen: 462, rm: 106.4 },
      { exerciseId: 'espalda/remo-barra', pesoMax: 80, reps: 8, volumen: 640, rm: 102.2 },
    ],
    prs: [
      { exerciseId: 'pecho/press-banca', peso: 92.5, reps: 5, fecha: '2026-09-10', rm: 106.4, enPeriodo: true },
      { exerciseId: 'espalda/remo-barra', peso: 80, reps: 8, fecha: '2026-06-02', rm: 102.2, enPeriodo: false },
    ],
  },
  musculos: {
    cargaPorGrupo: [
      { muscle: 'pecho', volumen: 18000, pct: 37.3 },
      { muscle: 'espalda', volumen: 15000, pct: 31.1 },
      { muscle: 'piernas', volumen: 9000, pct: 18.7 },
    ],
    frecuencia: {},
    gruposMas: ['pecho', 'espalda'],
    gruposMenos: ['hombros'],
  },
  recuperacion: {
    scores: [
      { date: '2026-09-01', score: 55 },
      { date: '2026-09-02', score: 78 },
      { date: '2026-09-03', score: 91 },
    ],
    avgScore: 74.7, fatiga: [4, 5, 3], suenoHoras: [7, 7.5, 8], dolorIncidencias: 1,
    estres: [3, 2, 3], motivacion: [8, 8, 9],
  },
  nutricion: { calorias: 2450, proteinas: 180, carbohidratos: 240, grasas: 78, hidratacionMl: 2120 },
  mediciones: {
    dias: 6,
    peso: { inicial: 82.4, final: 81.1, delta: -1.3, min: 81.1, max: 82.4 },
    grasaPct: { inicial: 21.5, final: 20.4, delta: -1.1 },
    perimetros: [{ clave: 'Cintura', inicial: 88, final: 86.5, delta: -1.5 }],
  },
  conclusiones: [
    'Sesiones en el período: 16 completadas y 2 incompletas · 842 min de entrenamiento medidos.',
    'Gasto calórico del ejercicio: 5433 kcal (estimación MET sobre sesiones con duración y peso registrados).',
  ],
  isEmpty: false,
  completo: true,
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

const headerText = (buf: Uint8Array): string => {
  let out = ''
  for (const b of buf) { out += String.fromCharCode(b) }
  return out
}

describe('Informe PDF descargable (escritor propio, sin dependencias)', () => {
  it('produce un PDF válido: cabecera, trailer, xref y %%EOF', async () => {
    const blob = buildReportPdf(data, { today: '2026-09-26' })
    expect(blob.type).toBe('application/pdf')
    const text = headerText(await bytesOf(blob))
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('%%EOF')
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Pages')
    expect(text).toContain('trailer')
    expect(text).toMatch(/\/Count \d+/)
  })

  it('cada offset del xref apunta al objeto correcto (archivo abrible)', async () => {
    const text = headerText(await bytesOf(buildReportPdf(data, { today: '2026-09-26' })))
    const startxref = Number(text.slice(text.lastIndexOf('startxref') + 'startxref'.length).trim().split(/\s/)[0])
    const xrefAt = text.slice(startxref)
    const lines = xrefAt.split('\n')
    const count = Number(lines[1].split(' ')[1])
    expect(startxref).toBeGreaterThan(0)
    expect(count).toBeGreaterThan(3)
    for (let i = 1; i < count; i++) {
      const offset = Number(lines[1 + i + 1].slice(0, 10))
      expect(text.startsWith(`${i} 0 obj`, offset)).toBe(true)
    }
  })

  it('el /Length de cada stream coincide con los bytes reales del contenido', async () => {
    const text = headerText(await bytesOf(buildReportPdf(data, { today: '2026-09-26' })))
    const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)]
    expect(streams.length).toBeGreaterThan(0)
    for (const m of streams) {
      const declared = Number(m[1])
      const start = m.index! + m[0].length
      expect(text.slice(start + declared, start + declared + 10)).toContain('endstream')
    }
  })

  it('codifica los acentos y la ñ en WinAnsi sin romperse', async () => {
    const text = headerText(await bytesOf(buildReportPdf(data, { today: '2026-09-26' })))
    // Las secciones van en mayúsculas: "RECUPERACIÓN" con Ó = 0xD3 en cp1252.
    expect(text).toContain('RECUPERACI\xD3N')
    expect(text).toMatch(/P\xE1gina 1\/\d+/)
    expect(text).toContain('Epley')
    expect(text).toContain('1RM estimado')
  })

  it('incluye los datos reales de cada sección del informe', async () => {
    const text = headerText(await bytesOf(buildReportPdf(data, { today: '2026-09-26' })))
    expect(text).toContain('48.250')       // volumen total
    expect(text).toContain('106,4')        // 1RM estimado
    expect(text).toContain('74,7')         // promedio de recuperación
    expect(text).toContain('2.450')        // calorías
    expect(text).toContain('2.120')        // hidratación
    expect(text).toContain('Cintura')
    expect(text).toContain('press banca')
  })

  it('pagina el contenido largo y numera todas las páginas', async () => {
    const many: ReportData = {
      ...data,
      fuerza: {
        ...data.fuerza!,
        progresoPorEjercicio: Array.from({ length: 40 }, (_, i) => ({
          exerciseId: `pecho/press-${i}`, pesoMax: 60 + i, reps: 8, volumen: 480, rm: 74 + i,
        })),
      },
      recuperacion: {
        ...data.recuperacion!,
        scores: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, score: 40 + (i % 55) })),
      },
    }
    const text = headerText(await bytesOf(buildReportPdf(many, { today: '2026-09-26' })))
    const count = Number(/\/Count (\d+)/.exec(text)![1])
    expect(count).toBeGreaterThan(1)
    for (let p = 1; p <= count; p++) { expect(text).toContain(`P\xE1gina ${p}/${count}`) }
    expect(text).toContain('continuaci\xF3n')
  })

  it('incluye gasto calórico, distribución, records y conclusiones', async () => {
    const text = headerText(await bytesOf(buildReportPdf(data, { today: '2026-09-26' })))
    expect(text).toContain('GASTO CAL\xD3RICO DEL EJERCICIO') // sección del gasto del ejercicio
    expect(text).toContain('5.433')                          // total del período (5432,6 → 5.433 kcal)
    expect(text).toContain('DISTRIBUCI\xD3N')                // sesiones por día de la semana
    expect(text).toContain('RECORDS Y MEJORES MARCAS')       // PRs/1RM
    expect(text).toContain('CONCLUSIONES')                   // conclusiones del informe
    expect(text).toContain('842 min')                        // duración real medida
    expect(text).toContain('Buena energ\xEDa en la sesi\xF3n') // observaciones registradas
  })

  it('cuando no hay datos suficientes para el gasto lo dice, sin rellenar ceros', async () => {
    const sinGasto: ReportData = {
      ...data,
      entrenamiento: {
        ...data.entrenamiento!,
        gastoCalorico: { totalKcal: null, totalMinutes: null, motivo: 'SIN_PESO', porFecha: [] },
      },
      conclusiones: ['Gasto calórico del ejercicio: sin datos suficientes para estimar.'],
    }
    const text = headerText(await bytesOf(buildReportPdf(sinGasto, { today: '2026-09-26' })))
    expect(text).toContain('Sin datos suficientes')
    expect(text).toContain('Falta el peso corporal registrado')
    expect(text).not.toContain('Total del período: 0 kcal')
  })

  it('un período vacío no inventa datos y lo dice explícitamente', async () => {
    const empty: ReportData = { ...data, isEmpty: true, completo: false, entrenamiento: undefined, fuerza: undefined, musculos: undefined, recuperacion: undefined, nutricion: undefined, mediciones: undefined }
    const text = headerText(await bytesOf(buildReportPdf(empty, { today: '2026-09-26' })))
    expect(text).toContain('Per\xEDodo vac\xEDo')
    expect(text).not.toContain('48.250')
  })

  it('el nombre de archivo incluye período y fecha', () => {
    expect(reportFileName(data, '2026-09-26')).toBe('althea-informe-30-2026-09-26.pdf')
  })
})
