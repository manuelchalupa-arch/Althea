// DECISION LOGGER — Log estructurado de cada decisión con trazabilidad
import { db } from '@/services/storage/db'

export interface DecisionRecord {
  id: string
  timestamp: string
  type: 'training' | 'nutrition' | 'recovery' | 'substitution' | 'safety'
  context: Record<string, unknown>
  decision: {
    what: string
    why: string
    factors: string[]
    alternatives?: string[]
    confidence: number
    evidenceUsed?: string[]
  }
  outcome?: {
    accepted: boolean
    feedback?: string
    modification?: string
  }
  safetyFlags?: string[]
}

/** Registrar una decisión del coach */
export async function logDecision(record: Omit<DecisionRecord, 'id' | 'timestamp'>): Promise<DecisionRecord> {
  const entry: DecisionRecord = {
    ...record,
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  }
  await db.decisionLog.put(entry as never)
  return entry
}

/** Obtener decisiones recientes */
export async function getRecentDecisions(type?: string, limit = 20): Promise<DecisionRecord[]> {
  const all: DecisionRecord[] = await db.decisionLog.toArray().catch(() => [])
  let filtered = all
  if (type) {filtered = all.filter(d => d.type === type)}
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit)
}
