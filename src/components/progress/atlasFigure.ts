/**
 * MODELO ANATÓMICO + RECURSOS GRÁFICOS del atlas muscular.
 *
 * Las cuatro figuras de `src/assets/muscle-atlas/` están EN USO.
 *
 * ── Datos comprobados inspeccionando los archivos ─────────────────────────
 * Los cuatro archivos tienen extensión `.png` pero su contenido real es JPEG
 * (firma `FF D8 FF`). JPEG no admite canal alfa, y de hecho el damero de
 * "transparencia" está horneado en los píxeles. Por eso, antes de usarlos se
 * **teclea el fondo en tiempo de ejecución** sobre un canvas: los píxeles
 * gris/blanco del damero pasan a alfa 0 y la figura queda con transparencia
 * real. El resultado se cachea por archivo.
 *
 * ── Proporción ────────────────────────────────────────────────────────────
 * El LIENZO mide 512×512 (1.0), pero la FIGURA dentro no. Medida píxel a
 * píxel, la altura del cuerpo es ~474–499 px y el ancho ~219–247 px, es decir
 * una proporción de 0.45–0.51, muy cercana a la del `viewBox` de referencia
 * (200×400 = 0.5). La proporción del lienzo NO es la de la anatomía.
 *
 * ── Alineación ────────────────────────────────────────────────────────────
 * `assetLayout` mapea la caja de la figura sobre la caja del cuerpo en el
 * espacio del SVG, con escala **uniforme** (por altura, sin deformar) y
 * centrado horizontal. Los valores se obtuvieron midiendo ambos cuerpos con
 * el mismo método; el torso calza casi exacto:
 *
 *      altura  SVG nW   PNG nW (male-front)
 *        20%    0.273     0.274
 *        25%    0.291     0.291
 *        30%    0.305     0.312
 *
 * Divergencias reales, registradas: la ilustración tiene la cabeza más grande
 * y las piernas más gruesas que la silueta neutra, y los brazos un ~12% más
 * abiertos. Afecta al ancho de algunos rellenos, no a su posición.
 */
import { useEffect, useState } from 'react'
import type { SexCode } from '@/utils/sex'

import maleFrontPng from '@/assets/muscle-atlas/male-front.png'
import maleBackPng from '@/assets/muscle-atlas/male-back.png'
import femaleFrontPng from '@/assets/muscle-atlas/female-front.png'
import femaleBackPng from '@/assets/muscle-atlas/female-back.png'

export type AtlasSex = SexCode

/** Caja del cuerpo dentro de la silueta SVG (viewBox 0 0 200 400). */
const BODY_TOP = 8
const BODY_CENTER_X = 100
const BODY_HEIGHT = 388.1

/** Geometría de cada archivo, medida sobre los píxeles reales. */
export interface AtlasAssetLayout {
  /** Lienzo de origen. */
  canvas: number
  /** Caja de la figura dentro del lienzo (píxeles). */
  figX: number
  figY: number
  figW: number
  figH: number
  /** `translate(tx,ty) scale(s)`: figura → caja del cuerpo, escala uniforme. */
  tx: number
  ty: number
  s: number
}

/** Bounds medidos (píxeles) de la figura dentro del lienzo 512×512. */
const FIG_BOUNDS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'male-front.png': { x: 143, y: 16, w: 226, h: 474 },
  'male-back.png': { x: 133, y: 11, w: 247, h: 483 },
  'female-front.png': { x: 149, y: 10, w: 219, h: 490 },
  'female-back.png': { x: 134, y: 4, w: 244, h: 499 },
}

function layoutFor(file: string): AtlasAssetLayout {
  const b = FIG_BOUNDS[file]
  const s = BODY_HEIGHT / b.h
  const figCx = b.x + b.w / 2
  return {
    canvas: 512,
    figX: b.x, figY: b.y, figW: b.w, figH: b.h,
    tx: BODY_CENTER_X - figCx * s,
    ty: BODY_TOP - b.y * s,
    s,
  }
}

const ATLAS_IMAGES = {
  M: { front: maleFrontPng, back: maleBackPng },
  F: { front: femaleFrontPng, back: femaleBackPng },
} as const

const ATLAS_LAYOUTS: Record<string, AtlasAssetLayout> = {
  'M-front': layoutFor('male-front.png'),
  'M-back': layoutFor('male-back.png'),
  'F-front': layoutFor('female-front.png'),
  'F-back': layoutFor('female-back.png'),
}

/**
 * Resuelve el recurso estático para un sexo/vista. `X` no tiene ilustración
 * propia: devuelve null y el atlas dibuja la silueta neutral existente.
 */
export function getAtlasImage(sex: AtlasSex, view: 'front' | 'back'): string | null {
  if (sex === 'M') { return ATLAS_IMAGES.M[view] }
  if (sex === 'F') { return ATLAS_IMAGES.F[view] }
  return null
}

/** Geometría de colocación para un sexo/vista, o null para `X`. */
export function getAtlasLayout(sex: AtlasSex, view: 'front' | 'back'): AtlasAssetLayout | null {
  if (sex === 'M' || sex === 'F') { return ATLAS_LAYOUTS[`${sex}-${view}`] }
  return null
}

/** Nombres de archivo realmente empaquetados (para pruebas). */
export function atlasImageFiles(): string[] {
  return ['female-back.png', 'female-front.png', 'male-back.png', 'male-front.png']
}

// ── Teclado de fondo ──────────────────────────────────────────────────────
// El damero es gris/blanco (croma R≈B) y MUY claro. Medido sobre los cuatro
// archivos, el 99% de los píxeles de croma bajo tiene luminancia ≥234.
//
// NI el croma solo NI el croma + luminancia alcanzan: la ilustración es
// sepia monocroma y sus destellos claros (pelo, codos, rodillas, muñecas)
// caen en el mismo rango que el damero y se borraban, dejando agujeros y
// manchas grises. Se separa por CONECTIVIDAD: un píxeles es fondo solo si
// además está unido al borde de la imagen. El cuerpo es un bloque central
// rodeado por contornos oscuros, así que nada de su interior se alcanza.
const CHROMA_MIN = 6
const CHROMA_MAX = 28
const BG_LUM_MIN = 220

const keyedCache = new Map<string, string>()

/** Convierte un JPEG (fondo damero horneado) en un PNG con alfa real. */
export function keyAtlasBackground(src: string): Promise<string> {
  const cached = keyedCache.get(src)
  if (cached) { return Promise.resolve(cached) }
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(src); return }
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        const n = w * h

        // Candidatos a fondo: gris y claro.
        const cand = new Uint8Array(n)
        for (let p = 0, i = 0; p < n; p++, i += 4) {
          cand[p] = px[i] - px[i + 2] <= CHROMA_MIN && (px[i] + px[i + 1] + px[i + 2]) / 3 >= BG_LUM_MIN ? 1 : 0
        }

        // Inundación desde el borde.
        const bg = new Uint8Array(n)
        const stack: number[] = []
        const seed = (p: number) => { if (cand[p] && !bg[p]) { bg[p] = 1; stack.push(p) } }
        for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x) }
        for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1) }
        while (stack.length > 0) {
          const p = stack.pop() as number
          const x = p % w
          const y = (p / w) | 0
          if (x > 0) { seed(p - 1) }
          if (x < w - 1) { seed(p + 1) }
          if (y > 0) { seed(p - w) }
          if (y < h - 1) { seed(p + w) }
        }

        for (let p = 0, i = 0; p < n; p++, i += 4) {
          if (bg[p]) {
            px[i + 3] = 0
          } else {
            const chroma = px[i] - px[i + 2]
            px[i + 3] = chroma >= CHROMA_MAX ? 255
              : chroma <= CHROMA_MIN ? 255
              : Math.round(((chroma - CHROMA_MIN) / (CHROMA_MAX - CHROMA_MIN)) * 255)
          }
        }

        ctx.putImageData(data, 0, 0)
        const url = canvas.toDataURL('image/png')
        keyedCache.set(src, url)
        resolve(url)
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

/**
 * Figura lista para pintar: imagen tecleada (fondo transparente) + su
 * geometría de colocación. Para `X` devuelve null: se usa la silueta SVG.
 */
export function useAtlasFigure(sex: AtlasSex, view: 'front' | 'back') {
  const raw = getAtlasImage(sex, view)
  const layout = getAtlasLayout(sex, view)
  const [url, setUrl] = useState<string | null>(raw)
  const [ready, setReady] = useState(raw === null)

  useEffect(() => {
    let alive = true
    if (!raw) {
      setUrl(null)
      setReady(true)
      return
    }
    setReady(false)
    keyAtlasBackground(raw).then((keyed) => {
      if (!alive) { return }
      setUrl(keyed)
      setReady(true)
    })
    return () => { alive = false }
  }, [raw])

  return { url: raw ? url : null, layout, ready, sex, view }
}
