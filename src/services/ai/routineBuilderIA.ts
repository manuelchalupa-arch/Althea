import { db } from '@/services/storage/db'
import { METHOD_COACHING_STYLES } from '@/services/ai/coachPersonality'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { fetchByMuscle, type Exercise } from '@/services/exerciseGym'
import { GROUP_MAP } from '@/utils/muscleMap'
import { todayKey } from '@/utils/dates'
import { getGroqUrl, getGroqHeaders } from './groqConfig'

const MODEL = 'openai/gpt-oss-20b'
const RATE_LIMIT_KEY = 'groq:lastRequestAt'
const MIN_GAP_MS = 12_000

export interface UserWants {
  goal: string
  daysPerWeek: number
  focus: string
  injuryNote: string
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
  }[]>
  explanation: {
    goal: string; method: string; distribution: string; intensity: string;
    progression: string; keyFeatures: string[];
  }
}

function isAvailable(): boolean {
  try {
    return !!import.meta.env.VITE_GROQ_PROXY_URL
  } catch { return false }
}

function goalToMethodId(goal: string): TrainingMethodId {
  const g = goal.toLowerCase()
  if (g.includes('fuerza')) return 'strength'
  if (g.includes('perdida_grasa') || g.includes('grasa')) return 'hiit'
  if (g.includes('resistencia')) return 'strength_endurance'
  if (g.includes('hipertrofia')) return 'hypertrophy'
  return 'hypertrophy'
}

// Fallback local 100% offline — usa misma estructura que IA pero sin API, garantiza selección funciona
async function generateRoutineFallback(wants: UserWants): Promise<GeneratedRoutine> {
  const methodId = goalToMethodId(wants.goal)
  const { buildCycleFromMethod } = await import('@/utils/cycle')
  const cycle = buildCycleFromMethod(methodId, undefined, todayKey())
  // Ajusta cantidad de días según lo seleccionado
  const desiredDays = Math.max(2, Math.min(6, wants.daysPerWeek))
  const { GROUP_MAP, PIERNA_FAMILY } = await import('@/utils/muscleMap')
  // Mapea focus a split
  const focusMap: Record<string, string[]> = {
    general: cycle.trainingDays.map(d => d.name),
    tren_superior: ['Pecho + Tríceps', 'Espalda + Bíceps', 'Hombros + Abdomen'],
    tren_inferior: ['Piernas', 'Glúteos + Gemelos', 'Cuádriceps + Isquios'],
    empuje_tirón: ['Empuje', 'Tirón', 'Piernas'],
    cuerpo_completo: Array.from({ length: desiredDays }, (_, i) => `Cuerpo completo ${i + 1}`),
  }
  const dayNames = focusMap[wants.focus] ?? cycle.trainingDays.map(d => d.name)
  const trainingDays = Array.from({ length: desiredDays }, (_, i) => ({ n: i + 1, name: dayNames[i % dayNames.length] }))
  const weekMap: (number | null)[] = [null, null, null, null, null, null, null]
  const preferred = [1, 2, 3, 4, 5].slice(0, desiredDays)
  preferred.forEach((dow, i) => { weekMap[dow] = i + 1 })
  const finalCycle = { ...cycle, trainingDays, weekMap, methodId, methodJustification: `Método ${methodId} seleccionado localmente por objetivo ${wants.goal} y foco ${wants.focus}. Sin IA externa — rutina válida offline.` }
  // Recolecta ejercicios por día (mínimo 3 por día, respeta lesiones/excluidos)
  const profile: any = await db.userProfile.get('me').catch(() => null) || {}
  const excluded: string[] = profile.excludedExercises || []
  const painAreas: string[] = profile.painAreas || []
  const shouldExclude = (ex: Exercise) => {
    if (excluded.includes(ex.id)) return true
    if (wants.injuryNote && ex.name.toLowerCase().includes(wants.injuryNote.toLowerCase())) return true
    if (painAreas.some((p: string) => ex.muscle.toLowerCase().includes(p.toLowerCase()))) return false // no bloquea, solo prioriza
    return false
  }
  const dayExercises: GeneratedRoutine['dayExercises'] = {}
  for (const d of trainingDays) {
    const { parseDayMuscles } = await import('@/utils/muscleMap')
    const muscles = parseDayMuscles(d.name)
    const fetches = await Promise.allSettled((muscles.length ? muscles : ['quads']).map(m => fetchByMuscle(m)))
    let pool: Exercise[] = []
    fetches.forEach(r => { if (r.status === 'fulfilled' && r.value?.exercises) pool.push(...r.value.exercises) })
    // Fallback si familia vacía: trae todo y filtra
    if (pool.length === 0) {
      const all = await fetchByMuscle('quads').then(r => r.exercises).catch(() => [])
      pool = all as Exercise[]
    }
    const filtered = pool.filter(e => !shouldExclude(e))
    const chosen = filtered.slice(0, 4)
    dayExercises[d.n] = chosen.map(e => ({
      id: uid(), exId: e.id, name: e.name, muscle: e.muscle, sets: 3, reps: 10, weight: 0, gifUrl: e.gifUrl,
    }))
  }
  return {
    name: `Rutina ${wants.goal} — ${desiredDays} días (${wants.focus})`,
    cycle: finalCycle,
    dayExercises,
    explanation: {
      goal: wants.goal, method: methodId, distribution: `${desiredDays} días/semana — foco ${wants.focus}`, intensity: 'Moderada (ajustable en cada serie)', progression: 'Subí 2.5kg cuando completes todas las reps', keyFeatures: ['Generada localmente (sin IA externa)', 'Respeta lesiones/excluidos', 'Ejercicios verificados'],
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

type CompactEx = { id: string; name: string; eq: string }

async function collectContext(wants: UserWants): Promise<{
  profile: any; history: string; style: any; methodName: string; exercises: Record<string, CompactEx[]>
}> {
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

  const muscleEx: Record<string, CompactEx[]> = {}
  // Expande familia Piernas (__piernas__ placeholder) a músculos reales — evita fetch 404 que deja sin ejercicios a IA
  const { PIERNA_FAMILY } = await import('@/utils/muscleMap')
  const rawMuscles = [...new Set(Object.values(GROUP_MAP))]
  const muscles: string[] = rawMuscles.flatMap(m => (m === '__piernas__' ? PIERNA_FAMILY : [m])).filter(Boolean)
  const fetches = await Promise.allSettled(muscles.map(m => fetchByMuscle(m)))
  for (let i = 0; i < muscles.length; i++) {
    const r = fetches[i]
    if (r.status === 'fulfilled' && r.value?.exercises) {
      muscleEx[muscles[i]] = r.value.exercises.slice(0, 8).map((e: Exercise) => ({
        id: e.id, name: e.name, eq: e.equipment
      }))
    }
  }

  return { profile, history, style, methodName: method?.nameEs || coachingMethod, exercises: muscleEx }
}

function buildPrompt(ctx: {
  profile: any; history: string; style: any; methodName: string; exercises: Record<string, CompactEx[]>
}, wants: UserWants): string {
  const p = ctx.profile || {}
  const s = ctx.style
  const today = todayKey()
  const time = p.sessionDurationMin || p.schedule?.sessionDurationMin || 60

  const exLines = Object.entries(ctx.exercises)
    .map(([m, exs]) => `${m}:${exs.map(e => `${e.id}|${e.name}|${e.eq}`).join(';')}`)
    .join('\n')

  return `Eres un entrenador personal experto. Genera una rutina de entrenamiento en formato JSON.

DATOS DEL USUARIO:
Edad: ${p.age || '?'} años, Sexo: ${p.sex || '?'} ${p.weightKg || '?'}kg, ${p.heightCm || '?'}cm
Objetivo: ${wants.goal}
Días por semana: ${wants.daysPerWeek}
Enfoque: ${wants.focus}
${wants.injuryNote ? `Lesiones/limitaciones: ${wants.injuryNote}` : ''}
Nivel: ${p.experienceLevel || 'intermediate'}
Tiempo por sesión: ${time} min
Equipamiento: ${(p.equipment || ['gym']).join(', ')}
Zonas de dolor: ${(p.painAreas || []).join(', ') || 'ninguna'}
Ejercicios excluidos: ${(p.excludedExercises || []).join(', ') || 'ninguno'}
Estilo coaching: ${ctx.methodName} (${s?.tone || 'ABUELITOS'}, riesgo ${s ? Math.round(s.riskLevel * 100) : 50}%)
Historial: ${ctx.history || 'sin historial'}

EJERCICIOS DISPONIBLES (usa solo estos IDs):
${exLines}

INSTRUCCIONES:
1. Elige ejercicios SOLO de la lista anterior. Usa el ID exacto.
2. Respeta equipamiento, lesiones y ejercicios excluidos.
3. Calcula cargas según historial. Si no hay historial, pon 0.
4. Genera ${wants.daysPerWeek} días de entrenamiento.
5. weekMap: 7 valores (Dom=0,Lun=1,Mar=2,Mié=3,Jue=4,Vie=5,Sáb=6). null=descanso, N=número de día.
6. gifUrl siempre: https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/api/es/exercises/{muscle}/{slug}.gif

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
        "gifUrl": "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/api/es/exercises/pectorals/barbell-bench-press.gif"
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

async function callGroq(_apiKey: string, prompt: string, attempt = 0): Promise<string> {
  const res = await fetch(getGroqUrl(), {
    method: 'POST',
    headers: getGroqHeaders(),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Eres un entrenador personal. Respondes SOLO con JSON valido, nada de texto explicativo.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0.3
    })
  })

  if (res.status === 429 && attempt < 2) {
    const waitMs = (attempt + 1) * 15_000
    await new Promise(r => setTimeout(r, waitMs))
    return callGroq(_apiKey, prompt, attempt + 1)
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Error Groq ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function generateRoutineWithAI(wants: UserWants): Promise<GeneratedRoutine> {
  // Sin proxy/key → fallback local inmediato (seleccionar siempre funciona)
  if (!isAvailable()) {
    return generateRoutineFallback(wants)
  }

  const cooldown = canRequestNow()
  if (!cooldown.ok) {
    throw new Error(`Rate limit: esperá ${cooldown.waitSec}s antes de generar otra rutina.`)
  }

  try {
    const ctx = await collectContext(wants)
    const prompt = buildPrompt(ctx, wants)

    markRequested()
    const content = await callGroq('', prompt)

    if (!content) {throw new Error('Respuesta vacía de Groq.')}

    const jsonStr = extractJSON(content)

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      throw new Error('La IA no devolvió JSON válido. Reintentá.')
    }

  // Normalize methodId
  if (parsed.cycle) {
    parsed.cycle.methodId = (parsed.cycle.methodId || 'hypertrophy') as TrainingMethodId
    if (!parsed.cycle.startDate) {parsed.cycle.startDate = todayKey()}
  }

  // Validate structure
  if (!parsed.cycle?.trainingDays?.length || !parsed.dayExercises) {
    throw new Error('La rutina generada no tiene la estructura correcta.')
  }

  // Ensure all trainingDays have names
  for (const d of parsed.cycle.trainingDays) {
    if (!d.name) {d.name = `Día ${d.n}`}
  }

  // Assign local IDs and normalize exercises
  for (const dayN of Object.keys(parsed.dayExercises)) {
    parsed.dayExercises[Number(dayN)] = (parsed.dayExercises[Number(dayN)] || []).map((ex: any) => ({
      id: uid(),
      exId: ex.exId || ex.id || '',
      name: ex.name || ex.exId || '',
      muscle: ex.muscle || '',
      sets: Math.max(1, Math.min(10, Number(ex.sets) || 3)),
      reps: Math.max(1, Math.min(30, Number(ex.reps) || 10)),
      weight: Math.max(0, Number(ex.weight) || 0),
      gifUrl: ex.gifUrl || ''
    }))
  }

  // Fill missing explanation
  if (!parsed.explanation) {
    parsed.explanation = {
      goal: wants.goal,
      method: parsed.cycle.methodJustification || 'Método seleccionado por IA',
      distribution: `${parsed.cycle.trainingDays.length} días por semana`,
      intensity: 'Moderada a alta según nivel',
      progression: 'Aumentar carga o repeticiones cada semana',
      keyFeatures: ['Personalizada por IA', 'Basada en tu perfil', 'Ejercicios verificados']
    }
  }

    return parsed as GeneratedRoutine
  } catch (e) {
    console.warn('IA Groq falló, usando fallback local:', e)
    return generateRoutineFallback(wants)
  }
}

export function isRoutineAIAvailable(): boolean {
  return true // Fallback local garantiza que "Crear con IA" siempre esté disponible, con o sin proxy
}

export function getRateLimitInfo(): { waitSec: number } {
  const c = canRequestNow()
  return { waitSec: c.waitSec }
}
