import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PdfDocument, decodePng,
  type DecodedPng,
} from './pdfWriter'
import { buildReportPdf, loadReportBust } from './reportPdf'
import type { ReportData } from './reportService'

const assetPath = join(process.cwd(), 'public/assets/brand/althea-header-96.png')

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

const asText = (buf: Uint8Array): string => {
  let out = ''
  for (const b of buf) { out += String.fromCharCode(b) }
  return out
}

const bust2x2: DecodedPng = {
  width: 2,
  height: 2,
  rgb: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]),
  alpha: null,
}

const minimalData = {
  period: '7',
  periodLabel: '7 días',
  range: { start: '2026-09-20', end: '2026-09-26' },
  completo: false,
  isEmpty: true,
} as unknown as ReportData

describe('PDF con imagen (busto de la cabecera)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodifica el asset real althea-header-96.png (96×96 RGBA)', async () => {
    const png = await decodePng(new Uint8Array(readFileSync(assetPath)))
    expect(png).not.toBeNull()
    expect(png!.width).toBe(96)
    expect(png!.height).toBe(96)
    expect(png!.rgb.length).toBe(96 * 96 * 3)
    expect(png!.alpha).not.toBeNull()
    expect(png!.alpha!.length).toBe(96 * 96)
  })

  it('decodePng devuelve null con entrada inválida (sin lanzar)', async () => {
    expect(await decodePng(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(await decodePng(new Uint8Array(100))).toBeNull()
    // Firma PNG pero sin IHDR válido
    const bad = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(await decodePng(bad)).toBeNull()
  })

  it('el documento con imagen declara XObject, SMask y operador Do', async () => {
    const doc = new PdfDocument({ title: 't' })
    const page = doc.addPage()
    const name = doc.addImage(bust2x2)
    expect(name).toBe('/Im1')
    page.image(name, 10, 10, 34, 34)
    const text = asText(await bytesOf(doc.build()))
    expect(text).toContain('/XObject')
    expect(text).toContain('/Im1 Do')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('%%EOF')
  })

  it('el documento con alfa declara SMask; sin alfa no lo declara', async () => {
    const withAlpha = new PdfDocument({ title: 't' })
    withAlpha.addPage().image(withAlpha.addImage({
      width: 1, height: 1, rgb: new Uint8Array([1, 2, 3]), alpha: new Uint8Array([255]),
    }), 0, 0, 1, 1)
    expect(asText(await bytesOf(withAlpha.build()))).toContain('/SMask')

    const withoutAlpha = new PdfDocument({ title: 't' })
    withoutAlpha.addPage().image(withoutAlpha.addImage(bust2x2), 0, 0, 1, 1)
    expect(asText(await bytesOf(withoutAlpha.build()))).not.toContain('/SMask')
  })

  it('buildReportPdf con busto dibuja la imagen y conserva el título', async () => {
    const text = asText(await bytesOf(buildReportPdf(minimalData, { today: '2026-09-26', bust: bust2x2 })))
    expect(text).toContain('/Im1 Do')
    expect(text).toContain('Informe de entrenamiento')
    expect(text).toContain('%%EOF')
  })

  it('el busto ocupa la esquina superior derecha (34×34) sin tocar el título', async () => {
    // A4 595.28 × 841.89, margen 42: imagen en (519.28, 765.89) de 34×34.
    const text = asText(await bytesOf(buildReportPdf(minimalData, { today: '2026-09-26', bust: bust2x2 })))
    expect(text).toContain('34 0 0 34 519.28 765.89 cm')
  })

  it('buildReportPdf sin busto no dibuja imagen (mismo layout vertical)', async () => {
    const text = asText(await bytesOf(buildReportPdf(minimalData, { today: '2026-09-26' })))
    expect(text).not.toContain(' Do')
    expect(text).toContain('Informe de entrenamiento')
  })

  it('loadReportBust devuelve null si el fetch falla (fallback sin imagen)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await loadReportBust()).toBeNull()
  })

  it('loadReportBust devuelve null si la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await loadReportBust()).toBeNull()
  })
})
