/**
 * Escritor de PDF mínimo, vectorial y sin dependencias.
 *
 * Por qué propio y no una librería: la app es offline, no queremos sumar peso al
 * bundle ni dependencias que auditar. Con lo que el informe necesita (texto con
 * acentos, líneas, rectángulos, barras y anillos) el formato PDF 1.4 es estable
 * y pequeño. Todo se mide en puntos (1 pt = 1/72"), A4 = 595.28 × 841.89 pt.
 *
 * El texto se codifica en WinAnsi (cp1252), la variante que usa Helvetica en
 * PDF, así que acentos y ñ se ven correctos sin embeber fuentes.
 */

export const A4 = { width: 595.28, height: 841.89 } as const

export interface Rgb { r: number; g: number; b: number }

export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b })

/** Paleta de marca reutilizada por el informe (mismo verde que la app). */
export const BRAND = {
  primary: rgb(0x1d, 0x4b, 0x38),
  primaryDark: rgb(0x0f, 0x2c, 0x21),
  primarySoft: rgb(0x8f, 0xd0, 0xb4),
  marble: rgb(0xf6, 0xf7, 0xf5),
  ink: rgb(0x1a, 0x1d, 0x1b),
  inkSoft: rgb(0x5b, 0x63, 0x5e),
  line: rgb(0xd8, 0xdd, 0xd9),
  water: rgb(0x38, 0x9f, 0xc4),
  macroProtein: rgb(0x2f, 0x7a, 0x4f),
  macroCarbs: rgb(0xc9, 0x6a, 0x3c),
  macroFat: rgb(0xc0, 0x93, 0x2a),
  danger: rgb(0xa3, 0x3a, 0x3a),
} as const

/**
 * cp1252: 32..126 y 160..255 son idénticos a Latin-1; 128..159 usan esta tabla
 * de codepoints. El byte que se debe escribir es siempre 0x80 + índice.
 */
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
]

/** Índice inverso: codepoint → byte cp1252 (0x80..0x9F). */
const CP1252_BYTE = new Map<number, number>()
CP1252_HIGH.forEach((cp, i) => { if (cp !== 0xfffd) { CP1252_BYTE.set(cp, 0x80 + i) } })

/** Flechas y emotes no existen en cp1252: se sustituyen por su equivalente ASCII. */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[↑⬆]/g, '^'],
  [/[↓⬇]/g, 'v'],
  [/→/g, '->'],
  [/←/g, '<-'],
  [/≈/g, '~'],
  [/[–—]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/ /g, ' '],
  [/[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, '?'],
]

function sanitize(input: string): string {
  let out = input
  for (const [re, to] of REPLACEMENTS) { out = out.replace(re, to) }
  return out
}

/** Codifica a bytes cp1252 (1 byte por carácter, como espera WinAnsiEncoding). */
function winAnsi(input: string): Uint8Array {
  const src = sanitize(input)
  const bytes = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i)
    if (code < 0x80) { bytes[i] = code; continue }
    if (code >= 0xa0 && code <= 0xff) { bytes[i] = code; continue }
    const mapped = code >= 0x80 && code <= 0x9f ? code : CP1252_BYTE.get(code)
    bytes[i] = mapped ?? 0x3f
  }
  return bytes
}

/** Escapa los delimitadores del literal de cadena PDF. */
function pdfString(input: string): string {
  let out = ''
  for (const b of winAnsi(input)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) { out += `\\${String.fromCharCode(b)}` }
    else if (b < 32) { out += ' ' }
    else { out += String.fromCharCode(b) }
  }
  return `(${out})`
}

const n = (v: number): string => (Math.round(v * 100) / 100).toString()

export interface TextOptions {
  size?: number
  bold?: boolean
  color?: Rgb
  align?: TextAlign
  /** Ancho máximo: parte el texto en varias líneas y devuelve el alto usado. */
  maxWidth?: number
  lineHeight?: number
  charWidth?: number
}

export type TextAlign = 'left' | 'center' | 'right'

export interface RectOptions {
  fill?: Rgb
  stroke?: Rgb
  lineWidth?: number
  radius?: number
}

export interface BarDatum { label: string; value: number; caption?: string }

export function formatNumber(v: number): string {
  return Math.round(v).toLocaleString('es-AR')
}

export function formatDecimal(v: number, digits = 1): string {
  return v.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export class PdfPage {
  readonly ops: string[] = []
  private y: number

  constructor(readonly width: number, readonly height: number, private readonly margin: number) {
    this.y = height - margin
  }

  get contentBottom(): number { return this.y }
  set contentBottom(v: number) { this.y = v }
  get left(): number { return this.margin }
  get right(): number { return this.width - this.margin }
  get usableWidth(): number { return this.width - this.margin * 2 }

  skip(points: number): number {
    this.y -= points
    return this.y
  }

  moveTo(y: number): number {
    this.y = y
    return this.y
  }

  private font(size: number, bold: boolean): string {
    return `/${bold ? 'F2' : 'F1'} ${n(size)} Tf`
  }

  private colorOp(c: Rgb, stroke: boolean): string {
    return `${n(c.r / 255)} ${n(c.g / 255)} ${n(c.b / 255)} ${stroke ? 'RG' : 'rg'}`
  }

  /** Ancho aproximado de Helvetica; alcanza para alinear y ajustar líneas. */
  measure(text: string, size: number, bold = false): number {
    const factor = bold ? 0.58 : 0.53
    return sanitize(text).length * size * factor
  }

  text(value: string, x: number, y: number, opts: TextOptions = {}): number {
    const size = opts.size ?? 10
    const bold = opts.bold ?? false
    const color = opts.color ?? BRAND.ink
    const align = opts.align ?? 'left'
    const lh = opts.lineHeight ?? size * 1.35
    if (!opts.maxWidth) {
      const tx = align === 'center' ? x - this.measure(value, size, bold) / 2
        : align === 'right' ? x - this.measure(value, size, bold)
          : x
      this.ops.push('BT', this.colorOp(color, false), this.font(size, bold), `${n(tx)} ${n(y)} Td`, `${pdfString(value)} Tj`, 'ET')
      return size * 1.2
    }

    const cw = opts.charWidth ?? size * (bold ? 0.58 : 0.53)
    const words = sanitize(value).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (candidate.length * cw > opts.maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) { lines.push(line) }
    lines.forEach((l, i) => {
      const ly = y - i * lh
      const tx = align === 'center' ? x - this.measure(l, size, bold) / 2
        : align === 'right' ? x - this.measure(l, size, bold)
          : x
      this.ops.push('BT', this.colorOp(color, false), this.font(size, bold), `${n(tx)} ${n(ly)} Td`, `${pdfString(l)} Tj`, 'ET')
    })
    return lines.length * lh
  }

  rect(x: number, y: number, w: number, h: number, opts: RectOptions = {}): void {
    const r = Math.max(0, Math.min(opts.radius ?? 0, w / 2, h / 2))
    this.ops.push('q')
    if (opts.fill) { this.ops.push(this.colorOp(opts.fill, false)) }
    if (opts.stroke) { this.ops.push(this.colorOp(opts.stroke, true), `${n(opts.lineWidth ?? 0.8)} w`) }
    if (r > 0) {
      const k = r * 0.5523
      this.ops.push(
        `${n(x + r)} ${n(y)} m`,
        `${n(x + w - r)} ${n(y)} l`,
        `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
        `${n(x + w)} ${n(y + h - r)} l`,
        `${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
        `${n(x + r)} ${n(y + h)} l`,
        `${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`,
        `${n(x)} ${n(y + r)} l`,
        `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
        'h',
      )
    } else {
      this.ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`)
    }
    if (opts.fill && opts.stroke) { this.ops.push('B') }
    else if (opts.fill) { this.ops.push('f') }
    else { this.ops.push('S') }
    this.ops.push('Q')
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb = BRAND.line, lineWidth = 0.8): void {
    this.ops.push('q', this.colorOp(color, true), `${n(lineWidth)} w`, `${n(x1)} ${n(y1)} m`, `${n(x2)} ${n(y2)} l`, 'S', 'Q')
  }

  /** Anillo de progreso: dibuja el arco como polilínea (visible en cualquier lector). */
  ring(cx: number, cy: number, radius: number, pct: number, color: Rgb, track: Rgb = BRAND.line, lineWidth = 6): void {
    const steps = 72
    const arc = (from: number, to: number, c: Rgb) => {
      this.ops.push('q', this.colorOp(c, true), `${n(lineWidth)} w`, '1 J', '1 j')
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps
        const x = cx + radius * Math.cos(a)
        const y = cy + radius * Math.sin(a)
        this.ops.push(i === 0 ? `${n(x)} ${n(y)} m` : `${n(x)} ${n(y)} l`)
      }
      this.ops.push('S', 'Q')
    }
    const start = Math.PI / 2
    arc(start, start + Math.PI * 2, track)
    const clamped = Math.max(0, Math.min(1, pct))
    if (clamped > 0) { arc(start, start + Math.PI * 2 * clamped, color) }
  }

  /** Barras horizontales con etiqueta a la izquierda y valor a la derecha. */
  bars(data: BarDatum[], x: number, y: number, width: number, opts: {
    barHeight?: number
    gap?: number
    color?: Rgb
    max?: number
    valueSuffix?: string
    labelSize?: number
  } = {}): number {
    const h = opts.barHeight ?? 8
    const gap = opts.gap ?? 16
    const size = opts.labelSize ?? 8.5
    const max = opts.max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1)
    const labelW = Math.min(130, width * 0.36)
    let cy = y
    for (const d of data) {
      if (d.caption) { this.text(d.caption, x, cy + h / 2 + 4, { size: 7, color: BRAND.inkSoft, align: 'right' }) }
      this.text(d.label, x, cy + h / 2, { size, color: BRAND.inkSoft, align: 'right' })
      const barX = x + labelW + 8
      const barW = Math.max(10, width - labelW - 8)
      this.rect(barX, cy, barW, h, { fill: rgb(0xef, 0xf1, 0xef), radius: h / 2 })
      const filled = Math.max(2, (Math.abs(d.value) / max) * barW)
      this.rect(barX, cy, filled, h, { fill: opts.color ?? BRAND.primary, radius: h / 2 })
      this.text(`${formatNumber(d.value)}${opts.valueSuffix ?? ''}`, x + width, cy + h / 2, { size, bold: true, align: 'right' })
      cy -= gap
    }
    return cy
  }
}

export interface PdfMeta {
  title: string
  author?: string
  subject?: string
}

export class PdfDocument {
  private pages: PdfPage[] = []
  readonly margin: number

  constructor(private readonly meta: PdfMeta, opts: { margin?: number } = {}) {
    this.margin = opts.margin ?? 42
  }

  addPage(): PdfPage {
    const page = new PdfPage(A4.width, A4.height, this.margin)
    this.pages.push(page)
    return page
  }

  get pageCount(): number { return this.pages.length }

  /** Ensambla el archivo completo y devuelve un Blob descargable. */
  build(): Blob {
    if (this.pages.length === 0) { this.addPage() }
    const chunks: Uint8Array[] = []
    let length = 0
    const push = (text: string) => {
      const bytes = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i++) { bytes[i] = text.charCodeAt(i) & 0xff }
      chunks.push(bytes)
      length += bytes.length
    }

    const objects: string[] = []
    const addObject = (body: string) => {
      objects.push(body)
      return objects.length
    }

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

    const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    // Objetos siguientes: 2 por página (contenido + página), luego Pages.
    const pagesObjNum = objects.length + this.pages.length * 2 + 1

    const kids: number[] = []
    for (const page of this.pages) {
      const content = page.ops.join('\n')
      const streamNum = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
      kids.push(addObject(
        `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${n(A4.width)} ${n(A4.height)}] `
        + `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${streamNum} 0 R >>`,
      ))
    }
    addObject(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
    const catalogNum = addObject(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`)
    const infoNum = addObject(
      `<< /Title ${pdfString(this.meta.title)} /Author ${pdfString(this.meta.author ?? 'Althea')} `
      + `/Subject ${pdfString(this.meta.subject ?? 'Informe de entrenamiento')} `
      + `/Creator ${pdfString('Althea - Gym Notebook')} /Producer ${pdfString('Althea PDF writer')} >>`,
    )

    const offsets: number[] = []
    for (let i = 0; i < objects.length; i++) {
      offsets.push(length)
      push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`)
    }

    const xrefStart = length
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const off of offsets) { xref += `${off.toString().padStart(10, '0')} 00000 n \n` }
    push(xref)
    push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

    const out = new Uint8Array(length)
    let pos = 0
    for (const c of chunks) { out.set(c, pos); pos += c.length }
    return new Blob([out], { type: 'application/pdf' })
  }
}

/** Lanza la descarga del PDF en el navegador sin tocar el estado de la app. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
