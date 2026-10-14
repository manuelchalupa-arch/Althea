/**
 * MODELO ANATÓMICO + RECURSOS GRÁFICOS del atlas muscular.
 *
 * Las cuatro figuras de `src/assets/muscle-atlas/` están EN USO.
 *
 * ── Datos comprobados inspeccionando los archivos ─────────────────────────
 * Los cuatro archivos son PNG con **canal alfa real** (RGBA) y lienzo NO
 * cuadrado: ~394×1024 (M) y ~384–395×1024 (F). Se midieron sus cajas: la
 * figura ocupa ~368×894 (male-front) dentro de su lienzo, con ~20–27 mil
 * píxeles transparentes y ~20 mil a alfa parcial (bordes antialias).
 *
 * `keyAtlasBackground` sigue corriendo por si un asset trae fondo horneado:
 * sólo SACA alfa (nunca lo agrega). Si el archivo ya trae alfa real se
 * respeta tal cual; el tecleo por croma+luminancia+sólo se aplica a los
 * archivos sin alfa. Esto evita que los grises internos de la ilustración
 * (destellos de pelo, codos, rodillas) se borren y dejen agujeros.
 *
 * ── Proporción ────────────────────────────────────────────────────────────
 * El lienzo NO es cuadrado ni coincide con la anatomía: hay que usar las
 * cajas medidas, nunca el tamaño del archivo. Proporciones de la figura
 * dentro del lienzo: 0.37 (female-back) a 0.41 (male-front). La silueta SVG
 * mide 162.2×388.1 = 0.418, así que las figuras calzan dentro de ella.
 *
 * ── Alineación ────────────────────────────────────────────────────────────
 * `assetLayout` mapea la caja de la figura sobre la caja del cuerpo en el
 * espacio del SVG, con escala **uniforme** (por altura, sin deformar) y
 * centrado horizontal. Anchura mapeada vs. silueta SVG (162.2 unidades):
 *
 *        archivo      ancho mapeado   vs silueta
 *        male-front       160.6        −1 %
 *        male-back        158.3        −2 %
 *        female-front     147.1        −9 %   (hombros más estrechos)
 *        female-back      145.1       −10 %
 *
 * La silueta es neutra y la femenina es naturalmente más estrecha. Por eso
 * el grupo de regiones va ENMASCARADO con la propia figura: el relleno nunca
 * se sale del cuerpo dibujado.
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
  /** Lienzo de origen (NO cuadrado: hay que usar las dos medidas). */
  canvasW: number
  canvasH: number
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

/**
 * Bounds medidos (píxeles) de la figura dentro de su lienzo.
 * Se midió el bounding box de los píxeles con alfa > 0 de cada PNG.
 */
const FIG_BOUNDS: Record<string, { cw: number; ch: number; x: number; y: number; w: number; h: number }> = {
  'male-front.png': { cw: 394, ch: 1024, x: 11, y: 35, w: 368, h: 894 },
  'male-back.png': { cw: 390, ch: 1024, x: 12, y: 33, w: 361, h: 886 },
  'female-front.png': { cw: 384, ch: 1024, x: 18, y: 37, w: 341, h: 898 },
  'female-back.png': { cw: 395, ch: 1024, x: 31, y: 39, w: 347, h: 938 },
}

function layoutFor(file: string): AtlasAssetLayout {
  const b = FIG_BOUNDS[file]
  const s = BODY_HEIGHT / b.h
  const figCx = b.x + b.w / 2
  return {
    canvasW: b.cw,
    canvasH: b.ch,
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
// Regla: el tecleo SÓLO quita alfa, nunca lo agrega.
//
// Los PNG actuales traen canal alfa real. En ese caso se respeta tal cual y
// lo único que se hace es ponear a 0 los píxeles de fondo que la inundación
// alcance (por si un asset trae fondo horneado). NO se aplica el tecleo por
// croma: los grises internos de la ilustración (destellos de pelo, codos,
// rodillas) tienen croma bajo y se borrarían, dejando agujeros.
//
// Si el archivo NO trae alfa (un JPEG con damero horneado) se usa el tecleo
// completo. El damero es gris/blanco (croma R≈B) y MUY claro: el 99% de los
// píxeles de croma bajo tiene luminancia ≥234. NI el croma solo NI croma +
// luminancia alcanzan por sí solos, porque la ilustración es sepia monocroma
// y sus destellos claros caen en el mismo rango. Se separa por
// CONECTIVIDAD: un píxel es fondo sólo si además está unido al borde de la
// imagen. El cuerpo es un bloque central rodeado por contornos oscuros, así
// que nada de su interior se alcanza.
const CHROMA_MIN = 6
const CHROMA_MAX = 28
const BG_LUM_MIN = 220

const keyedCache = new Map<string, string>()

/** Convierte el fondo en alfa real sin tocar la figura. */
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

        // Candidatos a fondo: gris y claro. A la vez detectamos si el archivo
        // ya trae alfa real (algún píxel con alfa != 255).
        let realAlpha = false
        const cand = new Uint8Array(n)
        for (let p = 0, i = 0; p < n; p++, i += 4) {
          if (px[i + 3] !== 255) { realAlpha = true }
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
          } else if (!realAlpha) {
            const chroma = px[i] - px[i + 2]
            px[i + 3] = chroma >= CHROMA_MAX ? 255
              : chroma <= CHROMA_MIN ? 255
              : Math.round(((chroma - CHROMA_MIN) / (CHROMA_MAX - CHROMA_MIN)) * 255)
          }
          // realAlpha: se conserva el alfa de origen (sólo se pudo quitar arriba).
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
