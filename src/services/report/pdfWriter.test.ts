import { describe, it, expect, vi } from 'vitest'
import { PdfDocument, downloadBlob, formatNumber, formatDecimal } from './pdfWriter'

/**
 * El escritor genera un PDF binario sin librerías. Estos tests atacan las tres
 * cosas que lo romperían en un lector real: escapado de delimitadores, codificación
 * WinAnsi de acentos/símbolos y offsets del xref.
 */

const textOf = async (doc: PdfDocument): Promise<string> => {
  let out = ''
  for (const b of new Uint8Array(await doc.build().arrayBuffer())) { out += String.fromCharCode(b) }
  return out
}

const build = async (draw: (doc: PdfDocument, page: ReturnType<PdfDocument['addPage']>) => void): Promise<string> => {
  const doc = new PdfDocument({ title: 'Prueba', subject: 'Prueba' })
  const page = doc.addPage()
  draw(doc, page)
  return textOf(doc)
}

describe('Escritor PDF propio', () => {
  it('escapa paréntesis y barras invertidas para no romper el literal', async () => {
    const text = await build((_doc, page) => { page.text('Press banca (barra) \\ 45 grados', 40, 700) })
    expect(text).toContain('\\(barra\\)')
    expect(text).toContain('\\\\')
    // El literal completo queda balanceado: solo los paréntesis internos se escapan.
    expect(text).toContain('(Press banca \\(barra\\) \\\\ 45 grados) Tj')
  })

  it('escribe acentos y eñes como un único byte cp1252', async () => {
    const text = await build((_doc, page) => { page.text('Masa muscular ñandú', 40, 700) })
    expect(text).toContain('Masa muscular \xF1and\xFA')
    expect(text).toContain('(Masa muscular \xF1and\xFA) Tj')
  })

  it('convierte símbolos cp1252 a su byte y los no soportados a "?"', async () => {
    const text = await build((_doc, page) => { page.text('100 € • ™', 40, 700) })
    expect(text).toContain('100 \x80 \x95 \x99')
    const emoji = await build((_doc, page) => { page.text('a🚫b', 40, 700) })
    expect(emoji).toMatch(/\(a\?+b\) Tj/)
  })

  it('sustituye flechas por ASCII para no perder información', async () => {
    const text = await build((_doc, page) => { page.text('27/08 -> 25/09', 40, 700) })
    expect(text).toContain('27/08 -> 25/09')
  })

  it('el xref apunta a cada objeto del documento', async () => {
    const text = await build((doc, page) => {
      page.text('uno', 40, 700)
      doc.addPage().text('dos', 40, 700)
    })
    const startxref = Number(text.slice(text.lastIndexOf('startxref') + 9).trim().split(/\s/)[0])
    const lines = text.slice(startxref).split('\n')
    const size = Number(/<< \/Size (\d+) \/Root/.exec(text)![1])
    expect(lines[0]).toBe('xref')
    expect(Number(lines[1].split(' ')[1])).toBe(size)
    for (let i = 1; i < size; i++) {
      const offset = Number(lines[1 + i + 1].slice(0, 10))
      expect(text.startsWith(`${i} 0 obj`, offset)).toBe(true)
    }
    expect(text).toContain('/Type /Catalog')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('el /Length declarado coincide con los bytes del stream', async () => {
    const text = await build((_doc, page) => { page.text('long ' + 'a'.repeat(300), 40, 700) })
    const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)]
    expect(streams.length).toBe(1)
    for (const m of streams) {
      const start = m.index! + m[0].length
      expect(text.slice(start + Number(m[1]) + 1, start + Number(m[1]) + 10)).toBe('endstream')
    }
  })

  it('envuelve el texto largo en varias líneas y devuelve el alto consumido', async () => {
    const doc = new PdfDocument({ title: 'x' })
    const page = doc.addPage()
    const used = page.text('palabra '.repeat(60).trim(), 40, 700, { size: 9, maxWidth: 200 })
    expect(used).toBeGreaterThan(100)
    const text = await textOf(doc)
    // Una sola línea cabría en 9*1.35; el texto partido genera varias Td.
    expect([...text.matchAll(/Td/g)].length).toBeGreaterThan(5)
    expect(text).not.toContain('palabra palabra palabra palabra palabra palabra palabra palabra')
  })

  it('formatea números con separador de miles es-AR y decimales fijos', () => {
    expect(formatNumber(48250.4)).toBe('48.250')
    expect(formatNumber(1234567.891)).toBe('1.234.568')
    expect(formatNumber(0)).toBe('0')
    expect(formatDecimal(106.44)).toBe('106,4')
    expect(formatDecimal(21.5, 2)).toBe('21,50')
    expect(formatDecimal(3, 0)).toBe('3')
  })

  it('downloadBlob enlaza, descarga y libera el objeto', () => {
    vi.useFakeTimers()
    try {
      const createObjectURL = vi.fn(() => 'blob:althea/1')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('althea-informe-30.pdf')
        expect(this.href).toContain('blob:althea/1')
      })
      downloadBlob(new Blob(['x'], { type: 'application/pdf' }), 'althea-informe-30.pdf')
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(click).toHaveBeenCalledTimes(1)
      // El ancla no queda en el DOM y la URL se libera después.
      expect(document.querySelectorAll('a[download]')).toHaveLength(0)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2000)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:althea/1')
      click.mockRestore()
      vi.unstubAllGlobals()
    } finally {
      vi.useRealTimers()
    }
  })
})
