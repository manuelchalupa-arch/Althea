import { EXERCISE_GYM_BASE as GYM_BASE } from '@/services/exerciseGymBase'
import { db } from '@/services/storage/db'
import { METHOD_COACHING_STYLES } from '@/services/ai/coachPersonality'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { fetchByMuscle, type Exercise } from '@/services/exerciseGym'
import { GROUP_MAP, PIERNA_FAMILY, parseDayMuscles, displayMuscle } from '@/utils/muscleMap'
import { todayKey } from '@/utils/dates'
import { getProxyUrl, getGroqHeaders } from './groqConfig'
import { aiLimitMessage, getAiAuthHeaders, isLimitError, stripLimitPrefix } from './aiAuth'
import { buildAiTrainingContext, getTrainingPreferences } from '@/utils/profilePreferences'

const MODEL = 'openai/gpt-oss-20b'
const RATE_LIMIT_KEY = 'groq:lastRequestAt'
const MIN_GAP_MS = 12_000

export interface UserWants {
  goal: string
  daysPerWeek: number
  focus: string
  injuryNote: string
  /** Pedido libre en lenguaje natural: la IA interpreta prioridades, ejercicios, equipo, etc. */
  description?: string
  /** Preferencias del perfil: mandan cuando el pedido libre no dice lo contrario. */
  level?: 'beginner' | 'intermediate' | 'advanced'
  durationMin?: number
  modality?: 'gym' | 'crossfit'
  allowedEquipment?: string[]
  excludedMovements?: string[]
  excludedExerciseIds?: string[]
  trainingIntensity?: number
}

/** Días mencionados explícitamente en el pedido libre ("4 días", "cuatro veces"). */
export function detectDaysMention(description: string): number | null {
  const text = (description || '').toLowerCase()
  if (!text.trim()) {return null}
  const words: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 }
  const m = text.match(/(\d+)\s*(d[ií]as?|veces|sesiones)/) || text.match(/(dos|tres|cuatro|cinco|seis|siete)\s*(d[ií]as?|veces|sesiones)/)
  if (!m) {return null}
  const n = Number(m[1]) || words[m[1]] || 0
  return n >= 2 && n <= 7 ? n : null
}

export type RoutineSplit = 'torso_piernas' | 'push_pull_legs' | 'full_body'

/** Instrucciones estructuradas extraídas del texto libre. Mandan sobre los valores por defecto. */
export interface RoutineInstructions {
  days: number | null
  split: RoutineSplit | null
  sessionMinutes: number | null
  /** Músculos de la API (pectorals, lats, quads…). */
  priorities: string[]
  /** Equipamiento permitido (dumbbell, barbell, lever…). null = sin restricción. */
  equipment: string[] | null
  /** Frases normalizadas que deben aparecer. */
  includes: string[]
  /** Frases normalizadas que no deben aparecer. */
  excludes: string[]
  level: 'beginner' | 'intermediate' | 'advanced' | null
  lowVolumeHighIntensity: boolean
  gradualProgression: boolean
}

export interface GeneratedRoutine {
  name: string
  cycle: {
    startDate: string
    trainingDays: { n: number; name: string }[]
    weekMap: (number | null)[]
    methodId: TrainingMethodId
    methodJustification: string
  }
  dayExercises: Record<number, {
    id: string; exId: string; sets: number; reps: number; weight: number;
    gifUrl?: string; name?: string; muscle?: string;
    restSec?: number; transitionRestSec?: number;
    supersetId?: string | null; supersetOrder?: number | null;
  }[]>
  explanation: {
    goal: string; method: string; distribution: string; intensity: string;
    progression: string; keyFeatures: string[];
    /** Prioridades interpretadas del pedido libre (ej. "piernas"). */
    priorities?: string[];
  }
}

// ─── Lectura del pedido libre ───────────────────────────────────────────────

function plainText(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function normalizedName(name: string): string {
  return plainText(name).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** ¿El nombre del ejercicio coincide con la frase? Tolera plurales y palabras sueltas. */
function matchesTerm(name: string, term: string): boolean {
  const n = normalizedName(name)
  const t = normalizedName(term)
  if (!t) {return false}
  if (n.includes(t)) {return true}
  const words = t.split(' ').filter(w => w.length >= 3)
  if (words.length === 0) {return false}
  return words.every(w => n.includes(w) || n.includes(w.replace(/s$/, '')))
}

function matchesAny(name: string, terms: string[]): boolean {
  return terms.some(t => matchesTerm(name, t))
}

const GENERIC_WORDS = new Set([
  'rutina', 'rutinas', 'ejercicio', 'ejercicios', 'entrenamiento', 'dia', 'dias', 'semana', 'semanas',
  'peso', 'pesas', 'trabajo', 'sesion', 'sesiones', 'gym', 'gimnasio', 'nada', 'algo', 'eso', 'esto',
  'los', 'las', 'el', 'la', 'un', 'una', 'unos', 'unas', 'de', 'del', 'que', 'y', 'e', 'o', 'en',
  'con', 'por', 'para', 'mi', 'mis', 'tus', 'sus', 'muy', 'mas', 'menos', 'solo', 'solamente',
])

function termsFrom(chunk: string): string[] {
  return plainText(chunk)
    .split(/[,;\/]|\s+y\s+|\s+e\s+|\s+ni\s+/)
    .map(t => t.replace(/[^a-z0-9\s-]/g, ' ').trim())
    .filter(t => t.length >= 3)
    .filter(t => t.split(/\s+/).length <= 4)
    .filter(t => !t.split(/\s+/).every(w => GENERIC_WORDS.has(w)))
}

function extractPhrases(text: string, re: RegExp): string[] {
  const out = new Set<string>()
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let m: RegExpExecArray | null
  while ((m = rx.exec(plainText(text)))) {
    for (const term of termsFrom(m[1] || '')) {out.add(term)}
  }
  return [...out]
}

const EQUIPMENT_TERMS: Array<[RegExp, string[]]> = [
  [/mancuernas?|dumbbells?/, ['dumbbell']],
  [/\bbarras?\b(?!\s*z)/, ['barbell']],
  [/\bbarra z\b|\bez.?bar\b/, ['ez-bar']],
  [/\bmaquinas?\b|\bmachines?\b/, ['lever', 'machine', 'smith', 'sled', 'cable']],
  [/\bpoleas?\b|\bcables?\b/, ['cable']],
  [/\bbandas?\b|\belasticos?\b/, ['band']],
  [/kettlebells?|pesa rusa/, ['kettlebell']],
  [/\bsmith\b/, ['smith']],
  [/peso corporal|bodyweight|sin equipo/, ['bodyweight']],
]

function detectEquipment(text: string): string[] | null {
  const t = plainText(text)
  const allowed = new Set<string>()
  for (const [re, eqs] of EQUIPMENT_TERMS) {
    if (re.test(t)) {eqs.forEach(e => allowed.add(e))}
  }
  return allowed.size ? [...allowed] : null
}

function detectMinutes(t: string): number | null {
  if (/hora y media/.test(t)) {return 90}
  if (/\b(?:una|1) hora\b/.test(t)) {return 60}
  if (/media hora/.test(t)) {return 30}
  const m = t.match(/(\d{1,3})\s*(?:min|minutos)/)
  if (!m) {return null}
  const n = Number(m[1])
  return n >= 15 && n <= 180 ? n : null
}

function detectSplit(t: string): RoutineSplit | null {
  if (/\btorso\b|\btren superior\b[\s\S]*\btren inferior\b|upper[\s\S]*lower/.test(t)) {return 'torso_piernas'}
  if ((/empuje|push/.test(t)) && (/tir[oó]n|pull/.test(t))) {return 'push_pull_legs'}
  if (/cuerpo completo|full.?body/.test(t)) {return 'full_body'}
  return null
}

function addMuscleAliases(sentence: string, out: Set<string>) {
  if (/\bbrazos?\b/.test(sentence)) {
    out.add('biceps'); out.add('triceps'); out.add('forearms')
  }
  if (/\btorso\b/.test(sentence)) {
    ;['pectorals', 'lats', 'upper-back', 'delts'].forEach(m => out.add(m))
  }
}

export function parseRoutineInstructions(description = ''): RoutineInstructions {
  const raw = description || ''
  const text = plainText(raw)
  const priorities = new Set<string>()
  for (const sentence of text.split(/[.;\n]/)) {
    if (/priorid|prioriz|enfasis|poco desarrollad|debil|mejorar|reforzar|mas (?:grande|fuerte|volumen|trabajo)|darle? mas/.test(sentence)) {
      parseDayMuscles(sentence).forEach(m => priorities.add(m))
      addMuscleAliases(sentence, priorities)
    }
  }
  return {
    days: detectDaysMention(raw),
    split: detectSplit(text),
    sessionMinutes: detectMinutes(text),
    priorities: [...priorities],
    equipment: detectEquipment(text),
    includes: extractPhrases(raw, /(?:incluir|incluye|inclui|agregar|agrega|mete|sumar|suma|quiero hacer|quiero usar|quiero trabajar)\s+([^.;\n]+)/),
    excludes: extractPhrases(raw, /(?:no quiero|no queria|no incluir|evitar|evita|excluir|excluye|exclui|nada de|\bsin\b)\s+([^.;\n]+)/),
    level: /principiante|beginner|novat/.test(text) ? 'beginner'
      : /avanzad/.test(text) ? 'advanced'
        : /intermedi/.test(text) ? 'intermediate' : null,
    lowVolumeHighIntensity: /menos ejercicios|pocos ejercicios|mayor intensidad|mas intensidad|alta intensidad|series pesadas|pocas reps/.test(text),
    gradualProgression: /progresion gradual|progresivo|paulatin|de a poco/.test(text),
  }
}

// ─── Plantillas y catálogo ─────────────────────────────────────────────────

type DayTemplate = { name: string; muscles: string[] }

const TORSO_A = ['pectorals', 'lats', 'upper-back', 'delts']
const TORSO_B = ['lats', 'upper-back', 'pectorals', 'delts', 'biceps', 'triceps']
const LEGS = [...PIERNA_FAMILY]
const PUSH = ['pectorals', 'delts', 'triceps']
const PULL = ['lats', 'upper-back', 'biceps', 'traps']
const FULL_BODY = ['pectorals', 'lats', 'quads', 'hamstrings', 'delts', 'abs', 'triceps', 'biceps', 'glutes', 'calves']

export function splitTemplates(split: RoutineSplit, days: number): DayTemplate[] {
  const n = clampDays(days)
  if (split === 'torso_piernas') {
    return Array.from({ length: n }, (_, i) => {
      const pair = Math.floor(i / 2)
      return i % 2 === 0
        ? { name: `Torso ${String.fromCharCode(65 + pair)}`, muscles: pair % 2 === 0 ? TORSO_A : TORSO_B }
        : { name: `Piernas ${String.fromCharCode(65 + pair)}`, muscles: LEGS }
    })
  }
  if (split === 'push_pull_legs') {
    const base = [
      { name: 'Empuje', muscles: PUSH },
      { name: 'Tirón', muscles: PULL },
      { name: 'Piernas', muscles: LEGS },
    ]
    return Array.from({ length: n }, (_, i) => {
      const b = base[i % base.length]
      const round = Math.floor(i / base.length)
      return { name: round === 0 ? b.name : `${b.name} ${round + 1}`, muscles: b.muscles }
    })
  }
  return Array.from({ length: n }, (_, i) => {
    const start = (i * 3) % FULL_BODY.length
    return { name: n === 1 ? 'Cuerpo completo' : `Cuerpo completo ${i + 1}`, muscles: [...FULL_BODY.slice(start), ...FULL_BODY.slice(0, start)] }
  })
}

function splitLabel(split: RoutineSplit | null): string | null {
  if (split === 'torso_piernas') {return 'torso / piernas'}
  if (split === 'push_pull_legs') {return 'empuje / tirón / piernas'}
  if (split === 'full_body') {return 'cuerpo completo'}
  return null
}

function clampDays(days: number): number {
  return Math.max(1, Math.min(7, Math.round(Number(days) || 4)))
}

function maxExercisesPerDay(instructions: RoutineInstructions, profileMinutes?: number | null): number {
  if (instructions.lowVolumeHighIntensity) {return 3}
  const minutes = instructions.sessionMinutes ?? (Number(profileMinutes) || 60)
  if (minutes <= 45) {return 3}
  if (minutes <= 75) {return 4}
  if (minutes <= 105) {return 5}
  return 6
}

function volumeForGoal(level: string, lowVolume: boolean, goal: string): { sets: number; reps: number } {
  const sets = level === 'beginner' ? 2 : level === 'advanced' ? 4 : 3
  const reps = /fuerza/i.test(goal) ? 6 : /resistencia|grasa|perdida/i.test(goal) ? 15 : 10
  if (!lowVolume) {return { sets, reps }}
  return { sets: Math.min(5, sets + 1), reps: Math.min(reps, 8) }
}

function maxSetsForLevel(level: string): number {
  if (level === 'beginner') {return 3}
  if (level === 'advanced') {return 6}
  return 5
}

type PoolEx = { id: string; name: string; eq: string; gif: string; muscle: string }
type RoutineExercise = GeneratedRoutine['dayExercises'][number][number]

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Catálogo curado por músculo. Antes se enviaban los primeros 8 ejercicios
 * alfabéticos (estiramientos y bandas), lo que hacía que la IA repitiera
 * siempre lo mismo. Se filtran estiramientos, equipo y exclusiones, y se
 * prioriza fuerza/compuestos con una rotación estable por pedido.
 */
async function loadMusclePools(
  instructions: RoutineInstructions,
  seed: number,
  excludedIds: string[] = [],
): Promise<Record<string, PoolEx[]>> {
  const rawMuscles = [...new Set(Object.values(GROUP_MAP))]
  const muscles = rawMuscles.flatMap(m => (m === '__piernas__' ? PIERNA_FAMILY : [m])).filter(Boolean)
  const fetches = await Promise.allSettled(muscles.map(m => fetchByMuscle(m)))
  const excluded = new Set(excludedIds)
  const seen = new Set<string>()
  const pools: Record<string, PoolEx[]> = {}
  for (let i = 0; i < muscles.length; i++) {
    const r = fetches[i]
    if (r.status !== 'fulfilled' || !r.value?.exercises) {continue}
    const limit = instructions.priorities.includes(muscles[i]) ? 16 : 12
    const scored = r.value.exercises
      .filter((e: Exercise) => !excluded.has(e.id) && e.category !== 'stretching')
      .filter((e: Exercise) => !matchesAny(e.name, instructions.excludes))
      .filter((e: Exercise) => !instructions.equipment || instructions.equipment.includes(e.equipment))
      .map((e: Exercise) => {
        let score = 0
        if (matchesAny(e.name, instructions.includes)) {score += 100}
        if (e.category === 'strength') {score += 4}
        score += Math.min(6, e.secondaryMuscles?.length || 0)
        if (instructions.priorities.includes(e.muscle)) {score += 5}
        // Rotación determinista: dos pedidos distintos reciben subconjuntos distintos.
        score += (hashStr(`${e.id}|${seed}`) % 1000) / 500
        return { e, score }
      })
      .sort((a, b) => b.score - a.score)
    const picked: PoolEx[] = []
    for (const { e } of scored) {
      if (picked.length >= limit) {break}
      if (seen.has(e.id)) {continue}
      seen.add(e.id)
      picked.push({ id: e.id, name: e.name, eq: e.equipment, gif: e.gifUrl, muscle: e.muscle || muscles[i] })
    }
    pools[muscles[i]] = picked
  }
  return pools
}

function newExercise(c: PoolEx, sets: number, reps: number): RoutineExercise {
  return {
    id: uid(), exId: c.id, name: c.name, muscle: c.muscle,
    sets, reps, weight: 0,
    gifUrl: c.gif || `${GYM_BASE}/api/es/exercises/${c.id}.gif`,
  }
}

function fillDay(
  list: RoutineExercise[],
  muscles: string[],
  pools: Record<string, PoolEx[]>,
  used: Set<string>,
  target: number,
  make: (c: PoolEx) => RoutineExercise,
  allowUsed: boolean,
) {
  const groups = muscles.filter(m => (pools[m]?.length ?? 0) > 0)
  const order = groups.length ? groups : Object.keys(pools)
  for (let round = 0; list.length < target; round++) {
    let added = false
    for (const m of order) {
      const cand = (pools[m] || []).find(c => !list.some(x => x.exId === c.id) && (allowUsed || !used.has(c.id)))
      if (!cand) {continue}
      list.push(make(cand))
      used.add(cand.id)
      added = true
      if (list.length >= target) {break}
    }
    if (!added) {break}
  }
}

type DayEntry = { name: string; muscles: string[]; list: RoutineExercise[]; max: number }

function ensureIncludes(
  days: DayEntry[],
  catalog: PoolEx[],
  instructions: RoutineInstructions,
  make: (c: PoolEx) => RoutineExercise,
) {
  for (const term of instructions.includes) {
    if (days.some(d => d.list.some(x => matchesAny(x.name || '', [term])))) {continue}
    const cand = catalog.find(c => matchesAny(c.name, [term]))
    if (!cand) {continue}
    const target = days.find(d => d.muscles.includes(cand.muscle)) || days[0]
    if (!target || target.list.some(x => x.exId === cand.id)) {continue}
    if (target.list.length >= target.max) {
      const idx = [...target.list].reverse().findIndex(x => !matchesAny(x.name || '', instructions.includes))
      if (idx >= 0) {target.list.splice(target.list.length - 1 - idx, 1)}
    }
    target.list.push(make(cand))
  }
}

function resolveCatalog(
  raw: any,
  catalog: Map<string, PoolEx>,
  instructions: RoutineInstructions,
): PoolEx | null {
  const id = String(raw?.exId || raw?.id || '').trim()
  const direct = catalog.get(id)
  if (direct && !matchesAny(direct.name, instructions.excludes)) {return direct}
  const wanted = String(raw?.name || '').trim()
  if (!wanted) {return null}
  for (const c of catalog.values()) {
    if (matchesTerm(c.name, wanted)) {return c}
  }
  return null
}

function normalizeRoutine(
  parsed: any,
  wants: UserWants,
  instructions: RoutineInstructions,
  ctx: { profile: any; exercises: Record<string, PoolEx[]> },
): GeneratedRoutine {
  const days = clampDays(instructions.days ?? wants.daysPerWeek)
  const previous: any[] = Array.isArray(parsed.cycle?.trainingDays) ? parsed.cycle.trainingDays : []
  const catalog = new Map<string, PoolEx>()
  for (const [muscle, list] of Object.entries(ctx.exercises)) {
    for (const e of list) {catalog.set(e.id, { ...e, muscle: e.muscle || muscle })}
  }
  const catalogList = [...catalog.values()]
  const allMuscles = [...new Set(catalogList.map(e => e.muscle))]
  const max = maxExercisesPerDay(instructions, ctx.profile?.sessionDurationMin)
  const min = Math.min(3, max)
  const level = instructions.level || wants.level || (ctx.profile?.experienceLevel as string) || 'intermediate'
  const v = volumeForGoal(level, instructions.lowVolumeHighIntensity, wants.goal)
  const make = (c: PoolEx) => newExercise(c, v.sets, v.reps)
  const used = new Set<string>()
  const entries: DayEntry[] = []

  const explicit = instructions.split ? splitTemplates(instructions.split, days) : null
  for (let i = 0; i < days; i++) {
    const oldDay = previous[i]
    const oldN = oldDay?.n ?? i + 1
    const rawList: any[] = Array.isArray(parsed.dayExercises?.[oldN]) ? parsed.dayExercises[oldN] : []
    const name = explicit?.[i]?.name || oldDay?.name || `Día ${i + 1}`
    const parsedMuscles = parseDayMuscles(name)
    const muscles = explicit?.[i]?.muscles?.length ? explicit[i].muscles : (parsedMuscles.length ? parsedMuscles : allMuscles)
    const list: RoutineExercise[] = []
    const seenDay = new Set<string>()

    for (const raw of rawList) {
      if (list.length >= max) {break}
      const hit = resolveCatalog(raw, catalog, instructions)
      if (!hit || seenDay.has(hit.id) || used.has(hit.id)) {continue}
      seenDay.add(hit.id)
      used.add(hit.id)
      let sets = clampNum(Number(raw?.sets) || v.sets, 1, maxSetsForLevel(level))
      let reps = clampNum(Number(raw?.reps) || v.reps, 1, 30)
      if (instructions.lowVolumeHighIntensity) {reps = clampNum(reps, 4, 10)}
      list.push({
        id: uid(), exId: hit.id, name: hit.name, muscle: hit.muscle,
        sets, reps, weight: Math.max(0, Number(raw?.weight) || 0),
        gifUrl: hit.gif || `${GYM_BASE}/api/es/exercises/${hit.id}.gif`,
        restSec: Number(raw?.restSec) > 0 ? Number(raw.restSec) : undefined,
        supersetId: raw?.supersetId ? String(raw.supersetId) : undefined,
        supersetOrder: raw?.supersetId ? Number(raw.supersetOrder) || 0 : undefined,
      })
    }

    fillDay(list, muscles, ctx.exercises, used, max, make, false)
    if (list.length < min) {fillDay(list, muscles, ctx.exercises, used, min, make, true)}
    entries.push({ name, muscles, list, max })
  }

  ensureIncludes(entries, catalogList, instructions, make)
  if (wants.modality === 'crossfit') {entries.forEach((d, i) => { d.name = `WOD ${i + 1}` })}

  // Recorte: el pedido de duración/volumen puede imponer un máximo menor al de la IA.
  for (const d of entries) {
    if (d.list.length <= d.max) {continue}
    const keep = d.list.filter(x => matchesAny(x.name || '', instructions.includes))
    const rest = d.list.filter(x => !keep.includes(x)).slice(0, Math.max(0, d.max - keep.length))
    d.list.length = 0
    d.list.push(...keep, ...rest)
  }

  // Superseries: solo bloques con 2+ integrantes reales del mismo día.
  entries.forEach((entry, idx) => {
    const dayN = idx + 1
    const byBlock = new Map<string, any[]>()
    for (const ex of entry.list) {
      if (!ex.supersetId) {continue}
      const list = byBlock.get(ex.supersetId) || []
      list.push(ex); byBlock.set(ex.supersetId, list)
    }
    const valid = new Set([...byBlock.entries()].filter(([, list]) => list.length >= 2).map(([id]) => id))
    let order = 0
    for (const ex of entry.list) {
      if (ex.supersetId && valid.has(ex.supersetId)) {
        ex.supersetId = `ss-${dayN}-${ex.supersetId}`
        ex.supersetOrder = order++
        ex.transitionRestSec = 15
      } else {
        ex.supersetId = null
        ex.supersetOrder = null
      }
    }
  })

  parsed.cycle.trainingDays = entries.map((d, i) => ({ n: i + 1, name: d.name }))
  parsed.dayExercises = Object.fromEntries(entries.map((d, i) => [i + 1, d.list]))

  // weekMap: exactamente los días elegidos, sin referencias a días recortados.
  const rawWeek: any[] = Array.isArray(parsed.cycle.weekMap) ? parsed.cycle.weekMap : []
  const weekMap: (number | null)[] = Array.from({ length: 7 }, (_, i) => {
    const value = Number(rawWeek[i])
    return Number.isFinite(value) && value >= 1 && value <= days ? value : null
  })
  for (let d = 1; d <= days; d++) {
    if (weekMap.includes(d)) {continue}
    const free = [1, 2, 3, 4, 5, 6, 0].find(i => weekMap[i] === null)
    if (free !== undefined) {weekMap[free] = d}
  }
  parsed.cycle.weekMap = weekMap

  if (!parsed.explanation) {
    parsed.explanation = {
      goal: wants.goal,
      method: parsed.cycle.methodJustification || 'Método seleccionado por IA',
      distribution: `${days} días por semana`,
      intensity: 'Moderada a alta según nivel',
      progression: 'Aumentar carga o repeticiones cada semana',
      keyFeatures: [
        'Personalizada por IA', 'Basada en tu perfil', 'Ejercicios verificados',
        ...(wants.modality === 'crossfit' ? ['Modalidad CrossFit: sesiones funcionales/WOD.'] : []),
      ],
    }
  }
  if ((!Array.isArray(parsed.explanation.priorities) || parsed.explanation.priorities.length === 0) && instructions.priorities.length > 0) {
    parsed.explanation.priorities = instructions.priorities.map(m => displayMuscle(m))
  }
  return parsed as GeneratedRoutine
}

function clampNum(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isAvailable(): boolean {
  try {
    return getProxyUrl().length > 0
  } catch {
    return false
  }
}

function goalToMethodId(goal: string): TrainingMethodId {
  const g = goal.toLowerCase()
  if (g.includes('fuerza')) {return 'strength'}
  if (g.includes('perdida_grasa') || g.includes('grasa')) {return 'hiit'}
  if (g.includes('resistencia')) {return 'strength_endurance'}
  if (g.includes('hipertrofia')) {return 'hypertrophy'}
  return 'hypertrophy'
}

// Fallback local 100% offline — usa misma estructura que IA pero sin API.
// Declara explícitamente qué instrucciones aplica y cuáles no puede interpretar.
async function generateRoutineFallback(
  wants: UserWants,
  instructions: RoutineInstructions,
  reason?: string,
): Promise<GeneratedRoutine> {
  const methodId = goalToMethodId(wants.goal)
  const { buildCycleFromMethod } = await import('@/utils/cycle')
  const cycle = buildCycleFromMethod(methodId, undefined, todayKey())
  const desiredDays = clampDays(instructions.days ?? wants.daysPerWeek)
  const profile: any = await db.userProfile.get('me').catch(() => null) || {}
  const seed = hashStr([wants.description || '', wants.goal, wants.focus, desiredDays].join('|'))
  const pools = await loadMusclePools(instructions, seed, profile.excludedExercises || [])
  const catalog = Object.values(pools).flat()
  const fallbackMuscles = FULL_BODY.slice(0, 6)
  const templates: DayTemplate[] = instructions.split
    ? splitTemplates(instructions.split, desiredDays)
    : Array.from({ length: desiredDays }, (_, i) => {
        const name = cycle.trainingDays[i % Math.max(1, cycle.trainingDays.length)]?.name || `Día ${i + 1}`
        const parsed = parseDayMuscles(name)
        return { name, muscles: parsed.length ? parsed : fallbackMuscles }
      })
  const max = maxExercisesPerDay(instructions, profile.sessionDurationMin)
  const min = Math.min(3, max)
  const level = instructions.level || wants.level || (profile.experienceLevel as string) || 'intermediate'
  const v = volumeForGoal(level, instructions.lowVolumeHighIntensity, wants.goal)
  const make = (c: PoolEx) => newExercise(c, v.sets, v.reps)
  const used = new Set<string>()
  const entries: DayEntry[] = []

  for (const t of templates) {
    const list: RoutineExercise[] = []
    fillDay(list, t.muscles, pools, used, max, make, false)
    if (list.length < min) {fillDay(list, t.muscles, pools, used, min, make, true)}
    entries.push({ name: t.name, muscles: t.muscles, list, max })
  }
  ensureIncludes(entries, catalog, instructions, make)
  if (wants.modality === 'crossfit') {entries.forEach((d, i) => { d.name = `WOD ${i + 1}` })}

  const weekMap: (number | null)[] = [null, null, null, null, null, null, null]
  ;[1, 2, 3, 4, 5, 6, 0].slice(0, desiredDays).forEach((dow, i) => {weekMap[dow] = i + 1})

  const label = splitLabel(instructions.split)
  const applied: string[] = []
  if (instructions.split) {applied.push(`split ${label}`)}
  if (instructions.sessionMinutes) {applied.push(`sesiones de ${instructions.sessionMinutes} min`)}
  if (instructions.priorities.length) {applied.push(`prioridad ${instructions.priorities.map(displayMuscle).join(', ')}`)}
  if (instructions.equipment) {applied.push('equipo permitido')}
  if (instructions.excludes.length) {applied.push('exclusiones')}
  if (instructions.lowVolumeHighIntensity) {applied.push('menos ejercicios y más intensidad')}

  return {
    name: wants.modality === 'crossfit'
      ? `Rutina CrossFit — ${desiredDays} días`
      : `Rutina ${wants.goal} — ${desiredDays} días${label ? ` (${label})` : ''}`,
    cycle: {
      ...cycle,
      trainingDays: entries.map((d, i) => ({ n: i + 1, name: d.name })),
      weekMap,
      methodId,
      methodJustification: `Método ${methodId} por objetivo ${wants.goal}${label ? ` y split ${label}` : ''}.`,
    },
    dayExercises: Object.fromEntries(entries.map((d, i) => [i + 1, d.list])),
    explanation: {
      goal: wants.goal,
      method: methodId,
      distribution: `${desiredDays} días/semana${label ? ` — ${label}` : ''}`,
      intensity: instructions.lowVolumeHighIntensity ? 'Alta: menos ejercicios, más series' : 'Moderada (ajustable en cada serie)',
      progression: instructions.gradualProgression ? 'Progresión gradual: sumá carga o reps de a poco' : 'Subí 2.5 kg cuando completes todas las reps',
      keyFeatures: [
        reason || 'Generada localmente: no hay IA externa configurada.',
        applied.length ? `Aplica del pedido: ${applied.join(', ')}.` : 'Aplica días, foco, equipo y exclusiones disponibles.',
        'No interpreta condiciones narrativas fuera de días, split, duración, prioridades, equipo y exclusiones.',
        'Ejercicios verificados del catálogo.',
        ...(wants.modality === 'crossfit' ? ['Modalidad CrossFit: sesiones funcionales/WOD.'] : []),
      ],
      priorities: instructions.priorities.map(m => displayMuscle(m)),
    },
  }
}

function uid(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function canRequestNow(): { ok: boolean; waitSec: number } {
  try {
    const last = Number(localStorage.getItem(RATE_LIMIT_KEY) || '0')
    const elapsed = Date.now() - last
    if (elapsed < MIN_GAP_MS) {return { ok: false, waitSec: Math.ceil((MIN_GAP_MS - elapsed) / 1000) }}
    return { ok: true, waitSec: 0 }
  } catch { return { ok: true, waitSec: 0 } }
}

function markRequested() {
  try { localStorage.setItem(RATE_LIMIT_KEY, String(Date.now())) } catch { /* noop */ }
}

type CompactEx = PoolEx

async function collectContext(
  instructions: RoutineInstructions,
  seed: number,
): Promise<{ profile: any; history: string; style: any; methodName: string; exercises: Record<string, CompactEx[]> }> {
  const profile = await db.userProfile.get('me').catch(() => null) as any || {}
  // Método vigente de la planificación (canónico). Snapshot profile.cycle como
  // fallback; 'hypertrophy' solo si no hay ninguna fuente (comportamiento previo).
  let canonicalMethodId: string | null = null
  try {
    const { getActiveVersion, PROFILE_SCOPE } = await import('@/services/planning/cycleVersions')
    const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
    canonicalMethodId = pv?.methodId ?? pv?.cycle?.methodId ?? null
  } catch { /* noop */ }
  const coachingMethod = (canonicalMethodId || profile?.cycle?.methodId || 'hypertrophy') as TrainingMethodId
  const style = METHOD_COACHING_STYLES[coachingMethod]
  const method = getMethod(coachingMethod)

  let history = ''
  try {
    const sessions: any[] = await db.trainingSessions.toArray().catch(() => [])
    const done = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
      .sort((a, b) => (a.calendarDate || '').localeCompare(b.calendarDate || '')).slice(-3)
    if (done.length > 0) {
      const lines: string[] = []
      for (const s of done) {
        const ex: any[] = await db.sessionExercises.where('sessionId').equals(s.id).toArray().catch(() => [])
        const names = ex.slice(0, 3).map((e: any) => e.exerciseName || e.exerciseId)
        lines.push(`${s.calendarDate}:${s.sessionStatus === 'COMPLETED' ? 'OK' : 'PARCIAL'} ${ex.length}ex ${names.join(',')} ${Math.round(Number(s.totalVolume || 0))}kg`)
      }
      const surveys: any[] = await db.postWorkoutSurveys.toArray().catch(() => [])
      const last3 = surveys.slice(-3)
      if (last3.length > 0) {
        const avg = Math.round(last3.reduce((a: number, s: any) => a + (s.sessionRating || 3), 0) / last3.length)
        const pain = last3.filter((s: any) => s.pain === 1).length
        lines.push(`encuesta:${avg}/5${pain > 0 ? ` ${pain}dolor` : ''}`)
      }
      history = lines.join(' | ')
    }
  } catch { /* noop */ }

  const exercises = await loadMusclePools(instructions, seed, profile.excludedExercises || [])
  return { profile, history, style, methodName: method?.nameEs || coachingMethod, exercises }
}

function buildPrompt(ctx: {
  profile: any; history: string; style: any; methodName: string; exercises: Record<string, CompactEx[]>
}, wants: UserWants, instructions: RoutineInstructions, corrections: string[] = []): string {
  const p = ctx.profile || {}
  const s = ctx.style
  const today = todayKey()
  const days = clampDays(instructions.days ?? wants.daysPerWeek)
  // El pedido explícito manda sobre la preferencia por defecto del perfil.
  const time = instructions.sessionMinutes ?? wants.durationMin ?? (Number(p.sessionDurationMin || p.schedule?.sessionDurationMin) || 60)
  const maxPerDay = maxExercisesPerDay(instructions, time)
  const level = wants.level || instructions.level || p.experienceLevel || 'intermediate'
  const allowed = instructions.equipment || wants.allowedEquipment || p.equipment || []
  const equipment = allowed.join(', ') || 'gimnasio'
  const description = (wants.description || '').trim()
  const label = splitLabel(instructions.split)

  const exLines = Object.entries(ctx.exercises)
    .map(([m, exs]) => `${m}:${exs.map(e => `${e.id}|${e.name}|${e.eq}`).join(';')}`)
    .join('\n')

  const hardRules = [
    `- Días por semana: ${days}.`,
    label ? `- Split obligatorio: ${label}.` : '- Split: el que mejor responda al pedido.',
    `- Duración máxima: ${time} min → como máximo ${maxPerDay} ejercicios por día.`,
    instructions.priorities.length ? `- Prioridades (más volumen/frecuencia): ${instructions.priorities.map(displayMuscle).join(', ')}.` : '',
    instructions.equipment ? `- Equipo permitido: ${equipment}. No uses otro.` : `- Equipo disponible: ${equipment}.`,
    instructions.includes.length ? `- Debe incluir: ${instructions.includes.join(', ')}.` : '',
    instructions.excludes.length ? `- No incluir: ${instructions.excludes.join(', ')} (ni variantes equivalentes).` : '',
    `- Nivel: ${level}. ${instructions.lowVolumeHighIntensity ? 'Menos ejercicios y mayor intensidad.' : ''}`,
    wants.trainingIntensity ? `- Intensidad del entrenamiento: ${wants.trainingIntensity}/5 (no es el tono del Coach).` : '',
    wants.excludedMovements?.length ? `- Movimientos prohibidos: ${wants.excludedMovements.join(', ')} (ni variantes).` : '',
    wants.excludedExerciseIds?.length ? `- IDs de ejercicios prohibidos: ${wants.excludedExerciseIds.join(', ')}.` : '',
    wants.modality === 'crossfit' ? '- Modalidad CrossFit: WOD/metcon/funcional; no splits por músculo aislado.' : '- Modalidad: gimnasio tradicional.',
    instructions.gradualProgression ? '- Progresión gradual y explícita.' : '',
  ].filter(Boolean).join('\n')

  return `Eres un entrenador personal experto en fuerza e hipertrofia. Genera una rutina de entrenamiento en formato JSON.

PEDIDO DEL USUARIO (texto libre, es la fuente principal; interpretalo literalmente):
${description || '(sin pedido libre; usá los datos estructurados de abajo)'}

RESTRICCIONES DEL PEDIDO (obligatorias; mandan sobre cualquier valor por defecto):
${hardRules}

DATOS DE ENTRENAMIENTO DEL USUARIO (solo lo relevante; sin nombre, email ni identificadores):
${buildAiTrainingContext(p)}
Objetivo del pedido: ${wants.goal}
Nivel aplicado: ${level}
Tiempo por sesión: ${time} min (máx. ${maxPerDay} ejercicios)
Equipamiento permitido: ${equipment}
Modalidad: ${wants.modality || p.trainingModality || 'gym'}
Estilo coaching: ${ctx.methodName} (${s?.tone || 'ABUELITOS'}, riesgo ${s ? Math.round(s.riskLevel * 100) : 50}%)
Historial: ${ctx.history || 'sin historial'}
${corrections.length ? `\nCORRECCIONES OBLIGATORIAS (la propuesta anterior fue rechazada):\n${corrections.map(c => `- ${c}`).join('\n')}` : ''}

CÓMO INTERPRETAR EL PEDIDO LIBRE:
- Un músculo "poco desarrollado" o "débil" es una PRIORIDAD: más volumen semanal y mejor frecuencia, sin abandonar el resto.
- Respetá los ejercicios que pidió incluir y NO incluyas los que rechazó (ni variantes equivalentes).
- Adaptá el volumen a nivel, duración e historial. Principiante 2-3 series por ejercicio, intermedio 3-4, avanzado 4-5.
- Contá el trabajo indirecto: no sumes volumen de un músculo como si cada ejercicio solo lo trabajara él.
- Progresión gradual y RIR 2-3 en la mayoría de las series.
- Si hay dolor o lesión, evitá los movimientos que puedan agravarlo y dejá la consulta profesional en la explicación.
- Podés agrupar 2 o 3 ejercicios en superserie SOLO si tiene sentido: mismo "supersetId" (ej. "ss1") y "supersetOrder" 0,1,2. El resto sin supersetId.

EJERCICIOS DISPONIBLES (usá exclusivamente estos IDs exactos):
${exLines}

INSTRUCCIONES:
1. Elegí ejercicios SOLO de la lista anterior. Usá el ID exacto. Nunca inventes IDs.
2. Respetá equipo, lesiones, exclusiones e inclusiones del pedido.
3. Calculá cargas según historial. Si no hay historial, poné 0.
4. Generá exactamente ${days} días de entrenamiento. Si el pedido pide un split, respetalo.
5. No repitas el mismo ejercicio dentro del día. Entre días, evitá repetir el mismo ID si hay alternativa del mismo grupo muscular.
6. Distribuí el volumen según las prioridades y el tiempo disponible.
7. weekMap: 7 valores (Dom=0,Lun=1,Mar=2,Mié=3,Jue=4,Vie=5,Sáb=6). null=descanso, N=número de día. Cada día debe aparecer una vez.
8. gifUrl: ${GYM_BASE}/api/es/exercises/{muscle}/{slug}.gif
9. "priorities": lista breve de las prioridades que interpretaste (ej. ["piernas","brazos"]).
10. No hagas preguntas en la respuesta: las restricciones de arriba ya resuelven el pedido.

Responde SOLO con este JSON (sin explicaciones, sin markdown):
{
  "name": "Nombre de la rutina",
  "cycle": {
    "startDate": "${today}",
    "trainingDays": [
      {"n": 1, "name": "Empuje"},
      {"n": 2, "name": "Tirón"}
    ],
    "weekMap": [null, 1, 2, null, 3, null, null],
    "methodId": "hypertrophy",
    "methodJustification": "Por qué este método"
  },
  "dayExercises": {
    "1": [
      {
        "exId": "chest/barbell-bench-press",
        "name": "Press de banca",
        "muscle": "pectorals",
        "sets": 4,
        "reps": 10,
        "weight": 0,
        "gifUrl": "${GYM_BASE}/api/es/exercises/pectorals/barbell-bench-press.gif"
      }
    ],
    "2": []
  },
  "explanation": {
    "goal": "Objetivo de la rutina",
    "method": "Método elegido y por qué",
    "distribution": "Distribución semanal",
    "intensity": "Nivel de intensidad",
    "progression": "Cómo progresar",
    "priorities": ["piernas"],
    "keyFeatures": ["Característica 1", "Característica 2"]
  }
}`
}

function extractJSON(text: string): string {
  // Try direct parse
  try { JSON.parse(text); return text } catch { /* continue */ }

  // Try extracting from markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    const inner = codeBlock[1].trim()
    try { JSON.parse(inner); return inner } catch { /* continue */ }
  }

  // Try finding first { to last }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1)
    try { JSON.parse(candidate); return candidate } catch { /* continue */ }
  }

  // Try replacing common issues
  const cleaned = text
    .replace(/```/g, '')
    .replace(/^[^{]*/, '')
    .replace(/[^}]*$/, '')
    .trim()
  try { JSON.parse(cleaned); return cleaned } catch { /* continue */ }

  throw new Error('No se pudo extraer JSON válido de la respuesta.')
}

async function callAi(prompt: string): Promise<string> {
  const res = await fetch(getGroqUrl(), {
    method: 'POST',
    headers: { ...getGroqHeaders(), ...(await getAiAuthHeaders()) },
    body: JSON.stringify({
      task: 'routine',
      messages: [
        { role: 'system', content: 'Eres un entrenador personal. Respondes SOLO con JSON valido, nada de texto explicativo.' },
        { role: 'user', content: prompt }
      ],
      // Parámetros legacy: el Worker fija el modelo y el formato JSON.
      model: MODEL,
      max_tokens: 8192,
      temperature: 0.7,
      stream: false
    })
  })

  if (!res.ok) {
    let code: string | undefined
    try { code = (await res.clone().json())?.error } catch { /* status */ }
    const limit = aiLimitMessage(res.status, code)
    if (limit) {throw new Error(limit)}
    throw new Error(`Error del servicio de IA ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export interface RoutineValidationResult {
  ok: boolean
  issues: string[]
  warnings: string[]
  estimatedMinutes: number[]
  suggestion?: string
}

/** Estimación determinista: calentamiento fijo + series × (reps × 3s + descanso) + transiciones. */
export function estimateRoutineMinutes(routine: GeneratedRoutine): number[] {
  return Object.values(routine.dayExercises).map(list => {
    const seconds = list.reduce((sum, ex) => {
      const reps = Math.max(1, Number(ex.reps) || 10)
      const sets = Math.max(1, Number(ex.sets) || 3)
      const rest = Math.max(30, Number(ex.restSec) || 60)
      const transition = Number(ex.transitionRestSec) || 15
      return sum + sets * (reps * 3 + rest) + transition
    }, 0)
    return Math.round(8 + seconds / 60)
  })
}

type CatalogEntry = { id: string; name?: string; eq?: string }

/** Rechaza propuestas inválidas; la duración incompatible se informa con alternativa. */
export function validateGeneratedRoutine(
  routine: GeneratedRoutine,
  wants: UserWants,
  instructions: RoutineInstructions,
  catalog: Map<string, CatalogEntry>,
): RoutineValidationResult {
  const issues: string[] = []
  const warnings: string[] = []
  const days = clampDays(instructions.days ?? wants.daysPerWeek)
  const allowed = instructions.equipment || wants.allowedEquipment || []
  const banned = [...(wants.excludedMovements || []), ...instructions.excludes]
  const bannedIds = new Set(wants.excludedExerciseIds || [])

  if (routine.cycle?.trainingDays?.length !== days) {issues.push(`Estructura: se esperaban ${days} días y vinieron ${routine.cycle?.trainingDays?.length ?? 0}.`)}
  const week = routine.cycle?.weekMap || []
  const planned = week.filter((n): n is number => n !== null && n !== undefined)
  if (week.length !== 7 || planned.length !== days || new Set(planned).size !== days || planned.some(n => n < 1 || n > days)) {
    issues.push('weekMap: cada día debe aparecer una vez y los descansos deben ser null.')
  }
  for (let n = 1; n <= days; n++) {
    const list = routine.dayExercises?.[n]
    if (!Array.isArray(list) || list.length === 0) {issues.push(`Día ${n} sin ejercicios.`)}
  }

  for (const [n, list] of Object.entries(routine.dayExercises || {})) {
    for (const ex of list) {
      const entry = catalog.get(ex.exId)
      if (!entry) {issues.push(`Día ${n}: ejercicio inexistente en el catálogo (${ex.exId}).`); continue}
      if (allowed.length && entry.eq && !allowed.includes(entry.eq)) {
        issues.push(`Día ${n}: ${entry.name || ex.exId} usa ${entry.eq}, equipamiento no disponible.`)
      }
      if (bannedIds.has(ex.exId)) {issues.push(`Día ${n}: ejercicio excluido (${ex.exId}).`)}
      const hit = banned.find(term => matchesAny(ex.name || entry.name || '', [term]))
      if (hit) {issues.push(`Día ${n}: movimiento excluido (${hit}).`)}
      if (!Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 6) {issues.push(`Día ${n}: series inválidas (${ex.sets}).`)}
      if (!Number.isInteger(ex.reps) || ex.reps < 1 || ex.reps > 30) {issues.push(`Día ${n}: repeticiones inválidas (${ex.reps}).`)}
    }
  }

  if (wants.modality === 'crossfit') {
    const names = (routine.cycle?.trainingDays || []).map(d => d.name).join(' ')
    const text = `${routine.name || ''} ${(routine.explanation?.keyFeatures || []).join(' ')}`.toLowerCase()
    if (!/crossfit|wod|metcon|funcional/.test(text)) {issues.push('Modalidad CrossFit: faltan sesiones WOD/metcon/funcional.')}
    if (/pecho|espalda|b[ií]ceps|tr[ií]ceps/.test(names)) {issues.push('CrossFit no debe usar split por músculo aislado.')}
  }

  const estimatedMinutes = estimateRoutineMinutes(routine)
  const target = instructions.sessionMinutes ?? wants.durationMin ?? 60
  const low = Math.max(15, target * 0.65)
  const high = target * 1.35
  const bad = estimatedMinutes.map((m, i) => ({ m, i })).filter(x => x.m < low || x.m > high)
  if (bad.length) {
    const x = bad[0]
    const short = x.m < low
    warnings.push(`Sesión ${x.i + 1}: ${x.m} min estimados para ${target} min disponibles.`)
    const spare = Math.max(1, Math.min(3, Math.round((target - x.m) / 12)))
    // La alternativa es accionable y no inventa datos del usuario.
    const alt = short
      ? `Sumá ${spare} ejercicio${spare === 1 ? '' : 's'} o una serie por ejercicio para llegar a ${target} min.`
      : `Reducí ejercicios o series para llegar a ${target} min.`
    return { ok: issues.length === 0, issues, warnings, estimatedMinutes, suggestion: alt }
  }

  return { ok: issues.length === 0, issues, warnings, estimatedMinutes }
}

class RoutineValidationError extends Error {}

function catalogOf(exercises: Record<string, CatalogEntry[]>): Map<string, CatalogEntry> {
  return new Map(Object.values(exercises).flat().map(e => [e.id, e]))
}

function withProfilePreferences(wants: UserWants, profile: any): UserWants {
  const p = getTrainingPreferences(profile)
  const allowed = p.equipment.length ? p.equipment : undefined
  return {
    ...wants,
    level: wants.level || p.level,
    durationMin: wants.durationMin || p.sessionDurationMin,
    modality: wants.modality || p.modality,
    allowedEquipment: wants.allowedEquipment || allowed,
    excludedMovements: wants.excludedMovements || p.excludedMovements,
    excludedExerciseIds: wants.excludedExerciseIds || p.excludedExercises,
    trainingIntensity: wants.trainingIntensity || p.trainingIntensity,
  }
}

async function fallbackWithDurationNotice(wants: UserWants, instructions: RoutineInstructions, reason: string): Promise<GeneratedRoutine> {
  const routine = await generateRoutineFallback(wants, instructions, reason)
  const estimates = estimateRoutineMinutes(routine)
  const target = instructions.sessionMinutes || wants.durationMin || 60
  if (estimates.some(m => m < target * 0.65 || m > target * 1.35)) {
    routine.explanation.keyFeatures.push(
      `Sesión estimada en ${estimates[0]} min para ${target} min disponibles: ajustá ejercicios o series en la rutina.`,
    )
  }
  return routine
}

export async function generateRoutineWithAI(wants: UserWants): Promise<GeneratedRoutine> {
  const profile = await db.userProfile.get('me').catch(() => null) as any || {}
  const effective = withProfilePreferences(wants, profile)
  const instructions = parseRoutineInstructions(effective.description || '')
  if (!instructions.equipment && effective.allowedEquipment?.length) {instructions.equipment = effective.allowedEquipment}
  if (!instructions.sessionMinutes && effective.durationMin) {instructions.sessionMinutes = effective.durationMin}
  if (!instructions.level && effective.level) {instructions.level = effective.level}
  if (effective.excludedMovements?.length) {
    instructions.excludes = [...new Set([...instructions.excludes, ...effective.excludedMovements])]
  }
  const seed = hashStr([effective.description || '', effective.goal, effective.focus, effective.daysPerWeek].join('|'))

  // Sin proxy/key → fallback local inmediato (seleccionar siempre funciona)
  if (!isAvailable()) {
    return fallbackWithDurationNotice(effective, instructions, 'Generada localmente: no hay IA externa configurada.')
  }

  const cooldown = canRequestNow()
  if (!cooldown.ok) {
    throw new Error(`Rate limit: esperá ${cooldown.waitSec}s antes de generar otra rutina.`)
  }

  const ctx = await collectContext(instructions, seed)
  const catalog = catalogOf(ctx.exercises)
  let corrections: string[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt = buildPrompt(ctx, effective, instructions, corrections)
      markRequested()
      const content = await callAi(prompt)
      if (!content) {throw new Error('Respuesta vacía del servicio de IA.')}

      let parsed: any
      try { parsed = JSON.parse(extractJSON(content)) }
      catch { throw new Error('La IA no devolvió JSON válido. Reintentá.') }

      if (parsed.cycle) {
        parsed.cycle.methodId = (parsed.cycle.methodId || 'hypertrophy') as TrainingMethodId
        if (!parsed.cycle.startDate) {parsed.cycle.startDate = todayKey()}
      }
      if (!parsed.cycle?.trainingDays?.length || !parsed.dayExercises) {
        throw new Error('La rutina generada no tiene la estructura correcta.')
      }

      const routine = normalizeRoutine(parsed, effective, instructions, ctx)
      const totalExercises = Object.values(routine.dayExercises)
        .reduce((acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0)
      if (totalExercises === 0) {throw new Error('La IA no devolvió ejercicios del catálogo.')}

      const validation = validateGeneratedRoutine(routine, effective, instructions, catalog)
      if (!validation.ok) {
        if (attempt === 0) {corrections = validation.issues; continue}
        throw new RoutineValidationError(`La propuesta de IA no es válida: ${validation.issues.join(' ')}`)
      }
      if (validation.suggestion) {
        routine.explanation.keyFeatures = routine.explanation.keyFeatures || []
        routine.explanation.keyFeatures.push(validation.suggestion)
      }
      return routine
    } catch (e: any) {
      if (e instanceof RoutineValidationError) {throw new Error(e.message)}
      if (isLimitError(String(e?.message || ''))) {throw new Error(stripLimitPrefix(String(e.message)))}
      console.warn('IA no disponible, usando fallback local:', e)
      return fallbackWithDurationNotice(effective, instructions, 'La IA no respondió; rutina armada localmente con las reglas del pedido.')
    }
  }
  return fallbackWithDurationNotice(effective, instructions, 'La IA no devolvió una propuesta válida; rutina armada localmente.')
}

export function isRoutineAIAvailable(): boolean {
  return true // Fallback local garantiza que "Crear con IA" siempre esté disponible, con o sin proxy
}
