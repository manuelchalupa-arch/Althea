// Ejercicios personalizados (§USER_CREATED) — MISMO modelo lógico que Gym.Exercise.
// Tabla propia (customExercises) porque db.exercises conserva el seed español legacy;
// el shape es Gym-compatible para integrarse sin ramas especiales en Biblioteca,
// Rutinas, Entrenamiento, Historial, Progreso y Similitud (todo clave por exerciseId).
import { db } from '@/services/storage/db'
import type { Exercise, MuscleShare } from '@/services/exerciseGym'

export type CustomExercise = Exercise & {
  origin: 'USER_CREATED'
  description: string
  machine?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomInput {
  name: string
  description?: string
  bodyPart: string
  muscle: string
  secondaryMuscles: string[]
  /** Porcentajes: principal + secundarios. Deben sumar exactamente 100. */
  primaryPct: number
  secondaryPcts: number[]
  category: string
  equipment: string
  machine?: string
  imageDataUrl?: string
  gifUrl?: string
}

export function newCustomId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0')
  return `custom/${hex().slice(0, 8)}`
}

/** Breakdown estructurado (no texto): principal + secundarios con roles. */
export function buildBreakdown(input: Pick<CustomInput, 'muscle' | 'secondaryMuscles' | 'primaryPct' | 'secondaryPcts'>): MuscleShare[] {
  const out: MuscleShare[] = [{ name: input.muscle, pct: input.primaryPct, role: 'Principal' }]
  input.secondaryMuscles.forEach((m, i) => {
    out.push({ name: m, pct: input.secondaryPcts[i] ?? 0, role: 'Secundario' })
  })
  return out
}

/** Breakdown efectivo: el guardado si existe, si no la heurística histórica 70/30. */
export function effectiveBreakdown(ex: Pick<Exercise, 'muscle' | 'secondaryMuscles'> & { muscleBreakdown?: MuscleShare[] }): MuscleShare[] {
  if (ex.muscleBreakdown && ex.muscleBreakdown.length > 0) return ex.muscleBreakdown
  const secs = ex.secondaryMuscles || []
  if (secs.length === 0) return [{ name: ex.muscle, pct: 100, role: 'Principal' }]
  const secPct = Math.round(30 / secs.length)
  return [
    { name: ex.muscle, pct: 100 - secPct * secs.length, role: 'Principal' },
    ...secs.map((s) => ({ name: s, pct: secPct, role: 'Secundario' as const })),
  ]
}

export function validateCustomInput(input: CustomInput): string[] {
  const errs: string[] = []
  if (!input.name || !input.name.trim()) errs.push('Nombre obligatorio')
  if (!input.bodyPart) errs.push('Parte obligatoria')
  if (!input.muscle) errs.push('Grupo muscular principal obligatorio')
  const all = [input.primaryPct, ...input.secondaryPcts]
  if (all.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) errs.push('Porcentajes entre 0 y 100')
  if (input.secondaryMuscles.length !== input.secondaryPcts.length) errs.push('Cada secundario necesita su porcentaje')
  const sum = all.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 0.001) errs.push(`Los porcentajes deben sumar 100 (actual: ${Math.round(sum * 10) / 10})`)
  if (input.primaryPct <= 0) errs.push('El músculo principal debe tener activación mayor a 0')
  return errs
}

export function matchesCustomFilter(
  c: Pick<CustomExercise, 'muscle' | 'equipment' | 'bodyPart' | 'category' | 'name'>,
  tab: 'muscle' | 'equipment' | 'bodypart' | 'category',
  key: string,
): boolean {
  if (key === '__all__') return true
  if (tab === 'muscle') return c.muscle === key
  if (tab === 'equipment') return c.equipment === key
  if (tab === 'bodypart') return c.bodyPart === key
  return c.category === key
}

export async function createCustomExercise(input: CustomInput): Promise<CustomExercise> {
  const errs = validateCustomInput(input)
  if (errs.length > 0) throw new Error(errs.join(' · '))
  const now = new Date().toISOString()
  const slug = input.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ejercicio'
  const rec: CustomExercise = {
    id: newCustomId(),
    slug,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    muscle: input.muscle,
    bodyPart: input.bodyPart,
    equipment: input.equipment,
    category: input.category,
    secondaryMuscles: [...input.secondaryMuscles],
    instructions: [],
    file: '',
    gifUrl: input.gifUrl || '',
    imageDataUrl: input.imageDataUrl,
    origin: 'USER_CREATED',
    muscleBreakdown: buildBreakdown(input),
    machine: input.machine?.trim() || undefined,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.table('customExercises').put(rec as never)
  return rec
}

export async function updateCustomExercise(id: string, patch: Partial<CustomInput>): Promise<CustomExercise> {
  const prev = (await db.table('customExercises').get(id).catch(() => null)) as CustomExercise | null
  if (!prev) throw new Error('Ejercicio inexistente')
  if (prev.archived) throw new Error('El ejercicio está archivado')
  const merged: CustomInput = {
    name: patch.name ?? prev.name,
    description: patch.description ?? prev.description,
    bodyPart: patch.bodyPart ?? prev.bodyPart,
    muscle: patch.muscle ?? prev.muscle,
    secondaryMuscles: patch.secondaryMuscles ?? prev.secondaryMuscles,
    primaryPct: patch.primaryPct ?? prev.muscleBreakdown?.[0]?.pct ?? 100,
    secondaryPcts: patch.secondaryPcts ?? (prev.muscleBreakdown?.slice(1).map((s) => s.pct) ?? []),
    category: patch.category ?? prev.category,
    equipment: patch.equipment ?? prev.equipment,
    machine: patch.machine ?? prev.machine,
    imageDataUrl: patch.imageDataUrl ?? prev.imageDataUrl,
    gifUrl: patch.gifUrl ?? prev.gifUrl,
  }
  const errs = validateCustomInput(merged)
  if (errs.length > 0) throw new Error(errs.join(' · '))
  const nx: CustomExercise = {
    ...prev,
    name: merged.name.trim(),
    description: (merged.description || '').trim(),
    bodyPart: merged.bodyPart,
    muscle: merged.muscle,
    secondaryMuscles: [...merged.secondaryMuscles],
    category: merged.category,
    equipment: merged.equipment,
    machine: merged.machine?.trim() || undefined,
    imageDataUrl: merged.imageDataUrl,
    gifUrl: merged.gifUrl || '',
    muscleBreakdown: buildBreakdown(merged),
    updatedAt: new Date().toISOString(),
  }
  await db.table('customExercises').put(nx as never)
  return nx
}

export async function getCustomExercise(id: string): Promise<CustomExercise | null> {
  const row = (await db.table('customExercises').get(id).catch(() => null)) as CustomExercise | null | undefined
  return row ?? null
}

/** Lista customs vigentes (no archivados), opcionalmente filtrados por tab/key. */
export async function listCustomExercises(tab?: 'muscle' | 'equipment' | 'bodypart' | 'category', key?: string): Promise<CustomExercise[]> {
  const rows = (await db.table('customExercises').toArray().catch(() => [])) as CustomExercise[]
  return rows
    .filter((c) => !c.archived)
    .filter((c) => (!tab || !key ? true : matchesCustomFilter(c, tab, key)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Aplica customs al mapa parte←ejercicio (misma taxonomía Biblioteca→Partes, §12). */
export async function overlayCustomParts(map: Record<string, string>): Promise<Record<string, string>> {
  const customs = await listCustomExercises().catch(() => [])
  for (const c of customs) {
    if (c?.id && c?.bodyPart && !map[c.id]) map[c.id] = c.bodyPart
  }
  return map
}

/** ¿Tiene historial en sesiones/series? */
export async function hasHistory(id: string): Promise<boolean> {
  const [recs, logs] = await Promise.all([
    db.table('setRecords').where('exerciseId').equals(id).toArray().catch(() => []),
    db.setLogs.where('exerciseId').equals(id).toArray().catch(() => []),
  ])
  return recs.length > 0 || logs.length > 0
}

/** ¿Tiene historial? Si sí → soft delete (archived), si no → borrado físico. */
export async function deleteCustomExercise(id: string): Promise<'archived' | 'deleted'> {
  const [recs, logs] = await Promise.all([
    db.table('setRecords').where('exerciseId').equals(id).toArray().catch(() => []),
    db.setLogs.where('exerciseId').equals(id).toArray().catch(() => []),
  ])
  if (recs.length > 0 || logs.length > 0) {
    const prev = await getCustomExercise(id)
    if (!prev) throw new Error('Ejercicio inexistente')
    await db.table('customExercises').put({ ...prev, archived: true, updatedAt: new Date().toISOString() } as never)
    return 'archived'
  }
  await db.table('customExercises').delete(id).catch(() => null)
  return 'deleted'
}

/** Reduce imagen a dataURL JPEG (máx 640px) para persistir en Dexie. */
export function fileToExerciseImage(file: File, maxSide = 640, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Sin canvas 2d')
        ctx.drawImage(img, 0, 0, w, h)
        const out = canvas.toDataURL('image/jpeg', quality)
        URL.revokeObjectURL(url)
        resolve(out)
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}
