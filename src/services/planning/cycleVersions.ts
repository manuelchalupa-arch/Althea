import { db } from '@/services/storage/db'
import type { CycleConfig } from '@/utils/cycle'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'

// Versionado de planificación (FASE 3): el pasado no se modifica cuando
// cambia la planificación futura. Cada versión conserva la configuración
// vigente en su momento; las sesiones apuntan a su versión vía
// TrainingSession.cycleId. La planificación global del perfil usa scope 'profile'.
export interface CycleVersion {
  id: string
  scope: string
  version: number
  previousVersionId?: string
  status: 'active' | 'historic'
  createdAt: string
  effectiveFrom: string
  methodId?: TrainingMethodId
  cycle: CycleConfig
  note?: string
}

export const PROFILE_SCOPE = 'profile'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `cv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  }
}

function sameCycle(a: CycleConfig, b: CycleConfig, methodIdA?: TrainingMethodId, methodIdB?: TrainingMethodId): boolean {
  return JSON.stringify(a) === JSON.stringify(b) && (methodIdA ?? null) === (methodIdB ?? null)
}

export async function listVersions(scope = PROFILE_SCOPE): Promise<CycleVersion[]> {
  const all = await db.cycleVersions.where('scope').equals(scope).toArray().catch(() => [])
  return all.sort((a, b) => a.version - b.version)
}

export async function getActiveVersion(scope = PROFILE_SCOPE): Promise<CycleVersion | null> {
  const all = await db.cycleVersions.where('scope').equals(scope).toArray().catch(() => [])
  return all.find(v => v.status === 'active') ?? null
}

export async function getVersion(id: string): Promise<CycleVersion | null> {
  return (await db.cycleVersions.get(id).catch(() => null)) ?? null
}

// ¿La planificación ya fue utilizada por sesiones reales?
export async function isPlanningUsed(scope = PROFILE_SCOPE): Promise<boolean> {
  if (scope === PROFILE_SCOPE) {
    return (await db.trainingSessions.count().catch(() => 0)) > 0
  }
  return (await db.trainingSessions.where('routineId').equals(scope).count().catch(() => 0)) > 0
}

export interface SavePlanningInput {
  scope?: string
  cycle: CycleConfig
  methodId?: TrainingMethodId
  effectiveFrom?: string
  note?: string
}

// Guarda planificación con regla de versionado:
// - sin versión previa → crea v1 activa;
// - cambio idéntico → no-op (sin versión innecesaria);
// - planificación usada → congela activa como histórica y crea nueva versión;
// - planificación no usada → actualiza la activa en su lugar.
export async function savePlanning(input: SavePlanningInput): Promise<{ version: CycleVersion; created: boolean }> {
  const scope = input.scope ?? PROFILE_SCOPE
  const now = new Date().toISOString()
  const active = await getActiveVersion(scope)
  if (!active) {
    const version: CycleVersion = {
      id: newId(),
      scope,
      version: 1,
      status: 'active',
      createdAt: now,
      effectiveFrom: input.effectiveFrom ?? input.cycle.startDate ?? now.slice(0, 10),
      methodId: input.methodId ?? input.cycle.methodId,
      cycle: input.cycle,
      note: input.note,
    }
    await db.cycleVersions.put(version)
    return { version, created: true }
  }
  if (sameCycle(active.cycle, input.cycle, active.methodId, input.methodId ?? input.cycle.methodId)) {
    return { version: active, created: false }
  }
  if (await isPlanningUsed(scope)) {
    await db.cycleVersions.update(active.id, { status: 'historic' })
    const version: CycleVersion = {
      id: newId(),
      scope,
      version: active.version + 1,
      previousVersionId: active.id,
      status: 'active',
      createdAt: now,
      effectiveFrom: input.effectiveFrom ?? now.slice(0, 10),
      methodId: input.methodId ?? input.cycle.methodId,
      cycle: input.cycle,
      note: input.note,
    }
    await db.cycleVersions.put(version)
    return { version, created: true }
  }
  const updated: CycleVersion = {
    ...active,
    cycle: input.cycle,
    methodId: input.methodId ?? input.cycle.methodId,
    note: input.note ?? active.note,
  }
  await db.cycleVersions.put(updated)
  return { version: updated, created: false }
}

// Versión vigente al momento de una sesión (para analytics).
export async function getVersionForSession(session: { cycleId?: string }): Promise<CycleVersion | null> {
  if (!session.cycleId) { return null }
  return getVersion(session.cycleId)
}

// Agrupa sesiones por versión de planificación vigente al ejecutarlas.
// Las sesiones sin versión (pre-versionado) van al grupo 'legacy'.
// Nunca modifica ni recalcula las sesiones: solo las clasifica.
export async function groupSessionsByVersion<T extends { cycleId?: string }>(
  sessions: T[],
): Promise<{ version: CycleVersion | null; sessions: T[] }[]> {
  const groups = new Map<string, { version: CycleVersion | null; sessions: T[] }>()
  for (const s of sessions) {
    const key = s.cycleId || 'legacy'
    let g = groups.get(key)
    if (!g) {
      g = { version: null, sessions: [] }
      groups.set(key, g)
    }
    g.sessions.push(s)
  }
  for (const [key, g] of groups) {
    if (key !== 'legacy') {
      g.version = await getVersion(key)
    }
  }
  return [...groups.values()].sort((a, b) => (a.version?.version ?? 0) - (b.version?.version ?? 0))
}
