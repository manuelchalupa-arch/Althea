// Duplicidad de ejercicios al crear (§USER_CREATED).
// Regla: un ejercicio duplica otro si es el MISMO movimiento, con el MISMO
// equipamiento y activando el MISMO grupo muscular → la creación se BLOQUEA
// y se sugiere el ejercicio que ya existe en la biblioteca. Cualquier solape
// parcial (movimiento + equipamiento, o movimiento + músculo) solo SUGIERE.
// Comparación tolerante: sinónimos ES/EN, alias, singular/plural, acentos.
// Falla abierta: si el catálogo remoto no responde, compara solo fuentes locales.
import { normFold } from '@/utils/format'
import { db } from '@/services/storage/db'
import * as Gym from '@/services/exerciseGym'
import { getSynonyms } from './exerciseSearch'

export type DuplicateLevel = 'block' | 'suggest'

export interface DuplicateMatch {
  id: string
  name: string
  source: 'catalogo' | 'legado' | 'propio' | 'compartido'
  level: DuplicateLevel
  reason: string
}

export interface DuplicateInput {
  name: string
  muscle: string
  equipment: string
  machine?: string
  secondaryMuscles?: string[]
}

interface Candidate {
  id: string
  name: string
  alias?: string
  muscle: string
  equipment: string
  source: DuplicateMatch['source']
}

/** Minúsculas + sin acentos, sin guiones/underscores legacy (peso_corporal). */
const clean = (s: string): string =>
  normFold(s || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

const synonymEqual = (a: string, b: string): boolean => {
  const na = normFold(a || '').trim()
  const nb = normFold(b || '').trim()
  return !!na && !!nb && (na === nb || getSynonyms(na).includes(nb) || getSynonyms(nb).includes(na))
}

// Equipamiento: sinónimos que exerciseSearch no cubre (ES/EN/legacy).
const EQUIP_GROUPS: string[][] = [
  ['peso corporal', 'bodyweight', 'barra fija', 'paralelas', 'pull up bar'],
  ['maquina', 'machine', 'sillon'],
  ['banda', 'band', 'bandas elasticas'],
  ['polea', 'cable', 'cables'],
  ['barra', 'barbell', 'ez bar'],
  ['mancuerna', 'dumbbell'],
]

const equipKey = (s: string): string => {
  const n = clean(s)
  for (const g of EQUIP_GROUPS) {
    if (g.some((t) => synonymEqual(n, t))) {return g[0]}
  }
  return n
}

const equipEqual = (a: string, b: string): boolean => {
  const ka = equipKey(a)
  return !!ka && ka === equipKey(b)
}

// Músculos: equivalencias ES/EN adicionales a las de exerciseSearch.
const MUSCLE_GROUPS: string[][] = [
  ['lats', 'dorsal', 'dorsales', 'latissimus dorsi'],
  ['espalda alta', 'trapecio', 'traps', 'romboides', 'rhomboids', 'upper back'],
  ['antebrazos', 'forearms', 'forearm'],
  ['oblicuos', 'obliques'],
]

const muscleEqual = (a: string, b: string): boolean => {
  const na = normFold(a || '').trim()
  const nb = normFold(b || '').trim()
  if (!na || !nb) {return false}
  if (synonymEqual(na, nb)) {return true}
  for (const g of MUSCLE_GROUPS) {
    const inA = g.some((t) => synonymEqual(na, t))
    const inB = g.some((t) => synonymEqual(nb, t))
    if (inA && inB) {return true}
  }
  return false
}

/** Comparación de nombres: exacta, por sinónimos o por contención de frases
 *  (cubre alias cruzados ES/EN: "press banca con mancuernas" ⊃ "press banca"). */
const nameEqual = (a: string, b: string): boolean => {
  const na = clean(a)
  const nb = clean(b)
  if (!na || !nb) {return false}
  if (na === nb) {return true}
  if (synonymEqual(na, nb)) {return true}
  const shorter = Math.min(na.length, nb.length)
  if (shorter >= 8 && (na.includes(nb) || nb.includes(na))) {return true}
  return false
}

/** ¿Comparten palabra significativa (≥5 chars)? Para sugerir "parecido" sin bloquear. */
const shareWord = (a: string, b: string): boolean => {
  const wa = new Set(clean(a).split(' ').filter((w) => w.length >= 5))
  return clean(b).split(' ').some((w) => w.length >= 5 && wa.has(w))
}

async function collectCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = []
  // 1. Catálogo Gym (jsDelivr). Timeout corto: no debe colgar el guardado.
  try {
    const catalog = await Promise.race([
      Gym.fetchAll().then((r) => r.exercises || []).catch(() => [] as Gym.Exercise[]),
      new Promise<Gym.Exercise[]>((res) => setTimeout(() => res([]), 3000)),
    ])
    for (const e of catalog) {
      out.push({ id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, source: 'catalogo' })
    }
  } catch { /* fail-open: sin red seguimos con fuentes locales */ }
  // 2. Seed legacy local (valores ES: groupMain / equipment).
  try {
    const seed = (await db.exercises.toArray().catch(() => [])) as Array<Record<string, unknown>>
    for (const e of seed) {
      out.push({
        id: String(e.id ?? ''),
        name: String(e.name ?? ''),
        alias: e.alias ? String(e.alias) : undefined,
        muscle: String(e.groupMain ?? e.muscle ?? ''),
        equipment: String(e.equipment ?? ''),
        source: 'legado',
      })
    }
  } catch { /* noop */ }
  // 3. Propios y compartidos.
  try {
    const customs = (await db.customExercises.toArray().catch(() => [])) as unknown as Array<Candidate & { archived?: boolean }>
    for (const c of customs) {
      if (c && !c.archived) {out.push({ ...c, source: 'propio' })}
    }
  } catch { /* noop */ }
  try {
    const shared = (await db.sharedExercises.toArray().catch(() => [])) as unknown as Candidate[]
    for (const s of shared) {
      if (s) {out.push({ ...s, source: 'compartido' })}
    }
  } catch { /* noop */ }
  return out.filter((c) => c.id && c.name)
}

/**
 * Busca ejercicios de la biblioteca que dupliquen o se parezcan al input.
 * `excludeId` permite editar un ejercicio sin que se compare consigo mismo.
 */
export async function findExerciseDuplicates(input: DuplicateInput, excludeId?: string): Promise<DuplicateMatch[]> {
  const candidates = (await collectCandidates()).filter((c) => !excludeId || c.id !== excludeId)
  const matches: DuplicateMatch[] = []
  for (const c of candidates) {
    const nameHit = nameEqual(input.name, c.name) || (!!c.alias && nameEqual(input.name, c.alias))
    const equipHit = equipEqual(input.equipment, c.equipment)
    const muscles: string[] = [input.muscle, ...(input.secondaryMuscles || [])]
    const muscleHit = muscles.some((m) => muscleEqual(m, c.muscle))
    let level: DuplicateLevel | null = null
    let reason = ''
    if (nameHit && equipHit && muscleHit) {
      level = 'block'
      reason = `Ya existe en la biblioteca: “${c.name}”. Mismo movimiento, mismo equipamiento y mismo grupo muscular. Usá ese ejercicio o variá uno de los tres.`
    } else if (nameHit && (equipHit || muscleHit)) {
      level = 'suggest'
      reason = `Puede que ya exista: “${c.name}” (${equipHit ? 'mismo movimiento y equipamiento' : 'mismo movimiento y grupo muscular'}).`
    } else if (equipHit && muscleHit && shareWord(input.name, c.name)) {
      level = 'suggest'
      reason = `Movimiento parecido a “${c.name}”: mismo equipamiento y grupo muscular.`
    }
    if (level) {matches.push({ id: c.id, name: c.name, source: c.source, level, reason })}
  }
  return matches.sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1))
}
