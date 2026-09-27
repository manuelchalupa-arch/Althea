import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// FASE 2 - S8 - plan L196: "Instalacion sin icono real (icon-192.png 1x1)".
// Los tres PNG del manifest eran de 70 bytes y 1x1 pixel, mientras el
// manifest.webmanifest declaraba "192x192" y "512x512". El navegador instalaba
// la PWA con un icono de un pixel escalado. Este test falla si alguien vuelve
// a dejar placeholders 1x1 o si el manifest y los archivos se desincronizan.

const publicDir = resolve(__dirname, '../../public')

/** Lee el IHDR de un PNG: los bytes 16..19 son el ancho y 20..23 el alto. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(signature)) throw new Error(`${file} no es un PNG valido`)
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${file} no tiene IHDR`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf-8'))
const icons = manifest.icons as { src: string; sizes: string; type: string; purpose: string }[]
/** El instalador exige PNG reales; el SVG es un extra vectorial opcional. */
const pngIcons = icons.filter((i) => i.type === 'image/png')
const svgIcons = icons.filter((i) => i.type === 'image/svg+xml')

describe('S8 - iconos PWA reales (no placeholders 1x1)', () => {
  it('el manifest declara al menos los 3 iconos que espera el instalador', () => {
    expect(pngIcons).toHaveLength(3)
    expect(pngIcons.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable'])
  })

  it('cada icono declarado existe y tiene EXACTAMENTE el tamano que el manifest promete', () => {
    for (const icon of pngIcons) {
      const file = resolve(publicDir, icon.src.replace(/^\//, ''))
      const { width, height } = pngSize(file)
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(`${icon.src} ${width}x${height}`).toBe(`${icon.src} ${w}x${h}`)
    }
  })

  it('los iconos vectoriales declarados son SVG reales y no placeholders', () => {
    for (const icon of svgIcons) {
      const raw = readFileSync(resolve(publicDir, icon.src.replace(/^\//, '')), 'utf-8')
      expect(raw).toMatch(/<svg[\s>]/i)
      expect(raw.length).toBeGreaterThan(200)
    }
  })

  it('ningun icono es un placeholder 1x1', () => {
    for (const icon of pngIcons) {
      const { width, height } = pngSize(resolve(publicDir, icon.src.replace(/^\//, '')))
      expect(width).toBeGreaterThanOrEqual(192)
      expect(height).toBeGreaterThanOrEqual(192)
    }
  })

  it('el icono maskable fue regenerado (ya no es el placeholder de 70 bytes)', () => {
    const bytes = readFileSync(resolve(publicDir, 'icons/icon-512-maskable.png')).length
    expect(bytes).toBeGreaterThan(2000)
  })
})
