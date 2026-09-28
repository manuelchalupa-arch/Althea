/**
 * Informe PDF de Althea: arma el documento a partir de ReportData (datos reales)
 * usando el escritor vectorial propio. Sin dependencias, sin red y sin imprimir.
 */
import {
  BRAND, PdfDocument, downloadBlob, formatDecimal, formatNumber, rgb,
  type BarDatum, type PdfPage,
} from './pdfWriter'
import type { ReportData } from './reportService'
import { todayKey } from '@/utils/dates'

const MARGIN = 42
const ACCENT = rgb(0x8f, 0xd0, 0xb4)

/** Marca Althea en vector: cuadro verde con la curva de barras del ícono. */
function drawMark(page: PdfPage, x: number, y: number, size: number): void {
  page.rect(x, y, size, size, { fill: BRAND.primaryDark, radius: size * 0.22 })
  const k = size * 0.27
  const w = size * 0.052
  page.line(x + k * 0.85, y + size * 0.36, x + k * 0.85, y + size * 0.64, ACCENT, w)
  page.line(x + k * 1.45, y + size * 0.36, x + k * 1.45, y + size * 0.7, ACCENT, w)
  page.line(x + k * 2.05, y + size * 0.36, x + k * 2.05, y + size * 0.6, ACCENT, w)
  page.line(x + k * 0.6, y + size * 0.32, x + k * 2.3, y + size * 0.32, ACCENT, w)
  page.rect(x + k * 0.79, y + size * 0.76, w * 0.78, w * 0.78, { fill: BRAND.primarySoft })
}

function header(page: PdfPage, title: string, subtitle: string, range: string): number {
  drawMark(page, MARGIN, page.height - MARGIN - 34, 34)
  page.text('ALTHEA', MARGIN + 44, page.height - MARGIN - 14, { size: 13, bold: true, color: BRAND.primary })
  page.text('GYM NOTEBOOK', MARGIN + 44, page.height - MARGIN - 27, { size: 7.5, color: BRAND.inkSoft })
  page.text(title, page.right, page.height - MARGIN - 14, { size: 12, bold: true, align: 'right' })
  page.text(subtitle, page.right, page.height - MARGIN - 27, { size: 8, color: BRAND.inkSoft, align: 'right' })
  page.line(MARGIN, page.height - MARGIN - 42, page.right, page.height - MARGIN - 42, BRAND.line, 1)
  page.text(`Período: ${range}`, MARGIN, page.height - MARGIN - 58, { size: 8.5, color: BRAND.inkSoft })
  return page.height - MARGIN - 74
}

function footer(page: PdfPage, index: number, total: number, generated: string): void {
  page.line(MARGIN, MARGIN + 22, page.right, MARGIN + 22, BRAND.line, 0.6)
  page.text('Althea - datos registrados en tu cuaderno, sin estimaciones externas', MARGIN, MARGIN + 10, { size: 7, color: BRAND.inkSoft })
  page.text(generated, page.right - 60, MARGIN + 10, { size: 7, color: BRAND.inkSoft, align: 'right' })
  page.text(`Página ${index}/${total}`, page.right, MARGIN + 10, { size: 7, bold: true, color: BRAND.primary, align: 'right' })
}

function sectionTitle(page: PdfPage, y: number, title: string, hint?: string): number {
  page.text(title.toUpperCase(), MARGIN, y, { size: 9, bold: true, color: BRAND.primary })
  const w = page.measure(title.toUpperCase(), 9, true)
  page.line(MARGIN, y - 4, MARGIN + w, y - 4, BRAND.primarySoft, 1.6)
  if (hint) { page.text(hint, page.right, y, { size: 7.5, color: BRAND.inkSoft, align: 'right' }) }
  return y - 18
}

interface Kpi { label: string; value: string; sub?: string; color?: ReturnType<typeof rgb> }

function kpiRow(page: PdfPage, y: number, items: Kpi[]): number {
  const cols = Math.min(4, items.length)
  const gap = 10
  const w = (page.usableWidth - gap * (cols - 1)) / cols
  items.forEach((k, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = MARGIN + col * (w + gap)
    const top = y - row * 62
    page.rect(x, top - 50, w, 50, { fill: BRAND.marble, stroke: BRAND.line, radius: 6 })
    page.text(k.label.toUpperCase(), x + 10, top - 10, { size: 6.8, color: BRAND.inkSoft })
    page.text(k.value, x + 10, top - 27, { size: 14, bold: true, color: k.color ?? BRAND.ink })
    if (k.sub) { page.text(k.sub, x + 10, top - 39, { size: 7, color: BRAND.inkSoft, maxWidth: w - 20 }) }
  })
  const rows = Math.ceil(items.length / cols)
  return y - rows * 62 + 4
}

function table(page: PdfPage, y: number, headers: string[], rows: string[][], widths: number[]): number {
  const total = widths.reduce((a, b) => a + b, 0)
  const scale = page.usableWidth / total
  const cols = widths.map((w) => w * scale)
  const xs: number[] = []
  let acc = MARGIN
  for (const c of cols) { xs.push(acc); acc += c }

  page.rect(MARGIN, y - 12, page.usableWidth, 16, { fill: rgb(0xef, 0xf1, 0xef) })
  headers.forEach((h, i) => {
    page.text(h, i === 0 ? xs[0] + 6 : xs[i] + cols[i] - 6, y - 1, {
      size: 7.5, bold: true, color: BRAND.inkSoft, align: i === 0 ? 'left' : 'right',
    })
  })
  let cy = y - 12
  rows.forEach((r, ri) => {
    cy -= 15
    if (ri % 2 === 1) { page.rect(MARGIN, cy, page.usableWidth, 15, { fill: rgb(0xfa, 0xfb, 0xfa) }) }
    r.forEach((cell, i) => {
      const text = cell.length > 34 ? `${cell.slice(0, 33)}…` : cell
      page.text(text, i === 0 ? xs[0] + 6 : xs[i] + cols[i] - 6, cy + 10.5, {
        size: 8, color: BRAND.ink, align: i === 0 ? 'left' : 'right',
      })
    })
    page.line(MARGIN, cy, page.right, cy, BRAND.line, 0.4)
  })
  return cy - 6
}

/** Divide los datos en páginas para que ninguna tabla se corte a la mitad. */
class Pager {
  readonly pages: PdfPage[] = []
  constructor(private readonly doc: PdfDocument, private readonly startContinuation: (p: PdfPage) => number) {}

  get current(): PdfPage { return this.pages[this.pages.length - 1] }

  /**
   * Devuelve la base desde la que seguir escribiendo: si no entran `needed`
   * puntos antes del pie, abre una página nueva con cabecera de continuación.
   */
  ensure(needed: number, y: number): number {
    if (y - needed < MARGIN + 34) {
      const page = this.doc.addPage()
      this.pages.push(page)
      return this.startContinuation(page)
    }
    return y
  }
}

export function buildReportPdf(data: ReportData, opts: { today?: string } = {}): Blob {
  const today = opts.today ?? todayKey()
  const generated = `Generado el ${today.split('-').reverse().join('/')}`
  const doc = new PdfDocument({
    title: `Althea - Informe ${data.periodLabel}`,
    subject: `Resumen de entrenamiento ${data.range.start} a ${data.range.end}`,
  })
  const first = doc.addPage()
  const range = `${data.periodLabel} · ${data.range.start} → ${data.range.end}`
  const pager = new Pager(doc, (p) => {
    p.text('ALTHEA', MARGIN, p.height - MARGIN - 16, { size: 8.5, bold: true, color: BRAND.primary })
    p.text('Informe de entrenamiento (continuación)', p.right, p.height - MARGIN - 16, { size: 7.5, color: BRAND.inkSoft, align: 'right' })
    p.line(MARGIN, p.height - MARGIN - 24, p.right, p.height - MARGIN - 24, BRAND.line, 0.8)
    return p.height - MARGIN - 40
  })
  pager.pages.push(first)
  const contentWidth = first.usableWidth

  let y = header(first, 'Informe de entrenamiento', data.completo ? 'Informe completo' : 'Informe parcial', range)

  if (data.isEmpty) {
    first.text('Período vacío: no hay datos reales registrados en este rango.', MARGIN, y, { size: 10, color: BRAND.inkSoft, maxWidth: contentWidth })
    footer(first, 1, 1, generated)
    return doc.build()
  }

  // ─── Resumen ejecutivo ───
  y = sectionTitle(first, y, 'Resumen', 'Todo proviene de tus registros')
  const kpis: Kpi[] = []
  if (data.entrenamiento) {
    kpis.push({ label: 'Días entrenados', value: formatNumber(data.entrenamiento.diasEntrenados), sub: `${formatDecimal(data.entrenamiento.frecuencia, 2)} sesiones/día` })
    kpis.push({ label: 'Volumen total', value: `${formatNumber(data.entrenamiento.volumen)} kg`, sub: `${formatNumber(data.entrenamiento.series)} series · ${formatNumber(data.entrenamiento.repeticiones)} reps` })
  }
  if (data.fuerza) {
    kpis.push({ label: '1RM estimado', value: `${formatDecimal(data.fuerza.rmEstimado)} kg`, sub: `Peso máx ${formatDecimal(data.fuerza.pesoMax)} kg` })
  }
  if (data.mediciones?.peso) {
    const d = data.mediciones.peso.delta
    kpis.push({
      label: 'Peso', value: `${formatDecimal(data.mediciones.peso.final)} kg`,
      sub: `${d > 0 ? '+' : ''}${formatDecimal(d)} kg en el período`,
      color: d <= 0 ? BRAND.primary : BRAND.danger,
    })
  }
  if (data.recuperacion?.avgScore !== undefined) {
    const s = data.recuperacion.avgScore
    kpis.push({ label: 'Recuperación', value: `${formatDecimal(s, 0)}/100`, sub: `${data.recuperacion.scores.length} check-ins`, color: s >= 70 ? BRAND.primary : s >= 40 ? BRAND.macroFat : BRAND.danger })
  }
  if (data.nutricion) {
    kpis.push({ label: 'Calorías', value: `${formatNumber(data.nutricion.calorias)} kcal`, sub: `Agua ${formatNumber(data.nutricion.hidratacionMl)} ml` })
  }
  y = kpiRow(first, y, kpis)
  y -= 6

  // ─── Entrenamiento ───
  if (data.entrenamiento) {
    y = pager.ensure(120, y)
    y = sectionTitle(pager.current, y, 'Entrenamiento', 'Sesiones y carga')
    const rows: string[][] = [
      ['Días entrenados', formatNumber(data.entrenamiento.diasEntrenados)],
      ['Sesiones', formatNumber(data.entrenamiento.sesiones)],
      ['Volumen total', `${formatNumber(data.entrenamiento.volumen)} kg`],
      ['Series completadas', formatNumber(data.entrenamiento.series)],
      ['Repeticiones', formatNumber(data.entrenamiento.repeticiones)],
      ['Frecuencia', `${formatDecimal(data.entrenamiento.frecuencia, 2)} sesiones/día`],
    ]
    if (data.entrenamiento.adherencia !== undefined) { rows.push(['Adherencia', `${data.entrenamiento.adherencia}%`]) }
    if (data.entrenamiento.rendimiento) { rows.push(['Volumen por sesión', `${formatNumber(data.entrenamiento.rendimiento.volumenPorSesion)} kg`]) }
    if (data.entrenamiento.duracionMin) { rows.push(['Duración', `${data.entrenamiento.duracionMin} min`]) }
    y = table(pager.current, y, ['Indicador', 'Valor'], rows, [3, 1])
    y -= 8

    const serie = (data.entrenamiento.serieDiaria ?? []).slice(-14)
    if (serie.length) {
      const label = `Volumen diario · ${serie.length} ${serie.length === 1 ? 'día con series' : 'días con series'}`
      const gap = 16
      const labelH = 10
      y = pager.ensure((serie.length - 1) * gap + 8 + labelH + 14, y)
      const used = pager.current.text(label, MARGIN, y, { size: 7.5, color: BRAND.inkSoft })
      y -= used + 4
      const bars: BarDatum[] = serie.map((d) => ({
        label: d.fecha.slice(5).replace('-', '/'),
        value: Math.round(d.volumen),
      }))
      y = pager.current.bars(bars, MARGIN, y, contentWidth, { color: BRAND.primary, valueSuffix: ' kg', gap })
      y -= 6
    }
  }

  // ─── Fuerza ───
  if (data.fuerza?.progresoPorEjercicio.length) {
    y = pager.ensure(140, y)
    y = sectionTitle(pager.current, y, 'Fuerza', '1RM estimado (Epley)')
    const rows = data.fuerza.progresoPorEjercicio.slice(0, 12).map(p => [
      p.exerciseId.split('/').pop()?.replace(/-/g, ' ') ?? p.exerciseId,
      formatDecimal(p.pesoMax),
      formatNumber(p.reps),
      formatDecimal(p.rm),
    ])
    y = table(pager.current, y, ['Ejercicio', 'Peso máx (kg)', 'Reps', '1RM (kg)'], rows, [3.2, 1, 0.8, 0.9])
    y -= 8
  }

  // ─── Músculos ───
  if (data.musculos?.cargaPorGrupo.length) {
    y = pager.ensure(150, y)
    y = sectionTitle(pager.current, y, 'Carga muscular', 'Atribución real por grupo')
    const bars: BarDatum[] = data.musculos.cargaPorGrupo.slice(0, 10).map(c => ({
      label: c.muscle, value: c.volumen, caption: `${formatDecimal(c.pct, 1)}%`,
    }))
    y = pager.current.bars(bars, MARGIN, y, contentWidth, { color: BRAND.primary, valueSuffix: ' kg', gap: 17 })
    y -= 6
    const notes = [
      data.musculos.gruposMas.length ? `Más trabajados: ${data.musculos.gruposMas.join(', ')}` : '',
      data.musculos.gruposMenos.length ? `Menos trabajados: ${data.musculos.gruposMenos.join(', ')}` : '',
    ].filter(Boolean)
    for (const note of notes) {
      // text() devuelve el alto consumido, no la nueva base: hay que restarlo.
      const used = pager.current.text(note, MARGIN, y, { size: 8, color: BRAND.inkSoft, maxWidth: contentWidth })
      y -= used + 4
    }
    y -= 6
  }

  // ─── Recuperación ───
  if (data.recuperacion?.scores.length) {
    y = pager.ensure(160, y)
    y = sectionTitle(pager.current, y, 'Recuperación', 'Check-ins del período')
    const p = pager.current
    const w = contentWidth
    const avg = data.recuperacion.avgScore ?? 0
    p.ring(MARGIN + 46, y - 52, 40, avg / 100, avg >= 70 ? BRAND.primary : avg >= 40 ? BRAND.macroFat : BRAND.danger, rgb(0xe6, 0xe9, 0xe7), 8)
    p.text(String(Math.round(avg)), MARGIN + 46, y - 58, { size: 18, bold: true, align: 'center' })
    p.text('/100', MARGIN + 46, y - 44, { size: 7.5, color: BRAND.inkSoft, align: 'center' })
    p.text('Promedio del período', MARGIN + 46, y - 4, { size: 7.5, color: BRAND.inkSoft, align: 'center' })

    // Serie de scores como barras compactas.
    const chartX = MARGIN + 110
    const chartW = w - 110
    const last = data.recuperacion.scores.slice(-21)
    const barW = Math.max(3, (chartW - (last.length - 1) * 3) / Math.max(1, last.length))
    const baseY = y - 12
    const hMax = 64
    p.text('Últimos check-ins', chartX, y - 2, { size: 7.5, color: BRAND.inkSoft })
    last.forEach((s, i) => {
      const h = Math.max(2, (Math.max(0, Math.min(100, s.score)) / 100) * hMax)
      const x = chartX + i * (barW + 3)
      p.rect(x, baseY - h, barW, h, { fill: s.score >= 70 ? BRAND.primary : s.score >= 40 ? BRAND.macroFat : BRAND.danger, radius: 1.5 })
    })
    p.line(chartX, baseY, chartX + last.length * (barW + 3), baseY, BRAND.line, 0.6)
    y = baseY - hMax - 22

    const rows: string[][] = [
      ['Check-ins registrados', formatNumber(data.recuperacion.scores.length)],
      ['Promedio', formatDecimal(avg, 1)],
      ['Horas de sueño (media)', formatDecimal(mean(data.recuperacion.suenoHoras), 1)],
      ['Fatiga declarada (media)', formatDecimal(mean(data.recuperacion.fatiga), 1)],
      ['Estrés (media)', formatDecimal(mean(data.recuperacion.estres), 1)],
      ['Motivación (media)', formatDecimal(mean(data.recuperacion.motivacion), 1)],
      ['Incidencias de dolor', formatNumber(data.recuperacion.dolorIncidencias)],
    ]
    y = table(p, y, ['Indicador', 'Valor'], rows, [3, 1])
    y -= 8
  }

  // ─── Mediciones ───
  if (data.mediciones) {
    y = pager.ensure(130, y)
    y = sectionTitle(pager.current, y, 'Mediciones', `${data.mediciones?.dias ?? 0} registros`)
    const rows: string[][] = []
    const push = (label: string, v?: { inicial: number; final: number; delta: number; min?: number; max?: number } | null) => {
      if (!v) { return }
      const extra = v.min !== undefined && v.max !== undefined ? ` (mín ${formatDecimal(v.min)} · máx ${formatDecimal(v.max)})` : ''
      rows.push([label, formatDecimal(v.inicial), formatDecimal(v.final), `${v.delta > 0 ? '+' : ''}${formatDecimal(v.delta)}${extra}`])
    }
    push('Peso (kg)', data.mediciones.peso)
    push('% grasa', data.mediciones.grasaPct)
    push('Masa muscular (kg)', data.mediciones.masaMuscularKg)
    for (const p of data.mediciones.perimetros ?? []) { push(`${p.clave} (cm)`, p) }
    if (rows.length) { y = table(pager.current, y, ['Medida', 'Inicial', 'Final', 'Δ'], rows, [2.4, 1, 1, 2.2]) }
    y -= 8
  }

  // ─── Nutrición ───
  if (data.nutricion) {
    y = pager.ensure(120, y)
    y = sectionTitle(pager.current, y, 'Nutrición', 'Promedios del período')
    const nu = data.nutricion
    const p = pager.current
    y -= 6
    y = p.bars([
      { label: 'Calorías', value: nu.calorias, caption: 'kcal' },
      { label: 'Proteínas', value: nu.proteinas, caption: 'g', },
      { label: 'Carbohidratos', value: nu.carbohidratos, caption: 'g' },
      { label: 'Grasas', value: nu.grasas, caption: 'g' },
    ], MARGIN, y, contentWidth, { color: BRAND.primary, gap: 18 })
    y -= 6
    y -= 14
    p.rect(MARGIN, y, contentWidth, 8, { fill: rgb(0xe6, 0xf2, 0xfa), radius: 4 })
    const waterPct = Math.min(1, nu.hidratacionMl / 3000)
    p.rect(MARGIN, y, contentWidth * waterPct, 8, { fill: BRAND.water, radius: 4 })
    p.text('Hidratación', MARGIN, y + 20, { size: 8, color: BRAND.inkSoft })
    p.text(`${formatNumber(nu.hidratacionMl)} ml`, contentWidth + MARGIN, y + 20, { size: 8, bold: true, align: 'right' })
    y -= 26
  }

  // Pie en todas las páginas + numeración definitiva.
  const total = pager.pages.length
  pager.pages.forEach((p, i) => footer(p, i + 1, total, generated))
  return doc.build()
}

function mean(values: number[]): number {
  const nums = values.filter((v) => Number.isFinite(v))
  if (nums.length === 0) { return 0 }
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Nombre de archivo con período y fecha, apto para descargas repetidas. */
export function reportFileName(data: ReportData, today = todayKey()): string {
  return `althea-informe-${data.period}-${today}.pdf`
}

/** Genera y descarga el informe en un solo paso. */
export function downloadReportPdf(data: ReportData, opts: { today?: string } = {}): string {
  const today = opts.today ?? todayKey()
  const blob = buildReportPdf(data, { today })
  const name = reportFileName(data, today)
  downloadBlob(blob, name)
  return name
}
