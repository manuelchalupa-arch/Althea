import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/services/storage/db'
import { firebaseDb } from './config'
import type { RemoteAdapter } from '@/services/sync/opQueue'

// Adaptador Firestore para el motor de cola: solo transporte (set por id
// estable con merge). La lógica de dominio vive en Dexie + servicios.
export function firestoreRemote(uid: string): RemoteAdapter {
  const fsdb = firebaseDb()
  return {
    async upload(table: string, docId: string, data: Record<string, unknown>): Promise<void> {
      const col = collection(fsdb, 'users', uid, table)
      await setDoc(doc(col, docId), JSON.parse(JSON.stringify(data)), { merge: true })
    },
  }
}

// Sincronización Dexie (offline-first, fuente local) <-> Firestore (backup multi-dispositivo).
// Modelo: users/{uid}/{coleccion}/{docId}. Upload con merge por id (sin demo).
// Download por política de entidad (FASE 8): el historial es append-only y
// NUNCA se sobrescribe en silencio; editables usan last-write-wins estricto
// (empate → se conserva local y se registra conflicto).
const TABLES = [
  'sessions',
  'setLogs',
  'routineDays',
  'routineExercises',
  'recoveryChecks',
  'hydrationLogs',
  'userProfile',
  'bodyMeasurements',
  'coachMemory',
  'weeklySequences',
  'trainingSessions',
  'exerciseRecords',
  'customExercises',
  'sessionExercises',
  'setRecords',
  'sessionEvents',
  'postWorkoutSurveys',
  'negativeSets',
  'exerciseObservations',
  'nutritionDiary',
  'nutritionAdherence',
  'decisionLog',
  'cycleVersions',
  'chatMessages',
  'chatConversations',
  'painLogs',
] as const

// Tablas append-only / históricas: solo se agregan ids faltantes, jamás se pisan.
const ADD_ONLY = new Set([
  'sessions', 'setLogs', 'trainingSessions', 'sessionExercises', 'setRecords',
  'sessionEvents', 'postWorkoutSurveys', 'negativeSets', 'exerciseObservations',
  'exerciseRecords', 'nutritionDiary', 'nutritionAdherence', 'hydrationLogs',
  'bodyMeasurements', 'chatMessages', 'chatConversations', 'coachMemory',
  'decisionLog', 'painLogs', 'customExercises', 'cycleVersions',
])

export interface SyncConflict { table: string; id: string; reason: 'remote-older' | 'tie-keep-local' | 'history-preserved' }

const LAST_SYNC_KEY = 'althea:lastSync'

export function lastSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY)
  } catch {
    return null
  }
}

function stampOf(r: any): number {
  const t = r?.updatedAt || r?.createdAt || 0
  const n = typeof t === 'string' ? Date.parse(t) : Number(t) || 0
  return isNaN(n) ? 0 : n
}

function docIdOf(table: string, row: any, i: number): string {
  const id = row?.id || row?.sessionId || row?.setRecordId || row?.sessionExerciseId
  return String(id ?? `${table}-${i}`)
}

// Id estable de documento remoto (compartido con el motor de cola).
export function remoteDocId(table: string, row: any, i: number): string {
  return docIdOf(table, row, i)
}

// Aplica la política de descarga por entidad. Devuelve filas a guardar y
// conflictos registrados (sin sobrescritura silenciosa del historial).
export function applyDownloadPolicy(
  table: string,
  incoming: any[],
  localById: Map<string, any>,
): { toPut: any[]; conflicts: SyncConflict[] } {
  const toPut: any[] = []
  const conflicts: SyncConflict[] = []
  incoming.forEach((r, idx) => {
    const id = docIdOf(table, r, idx)
    const cur = localById.get(id)
    if (!cur) {
      toPut.push(r)
      return
    }
    if (ADD_ONLY.has(table)) {
      conflicts.push({ table, id, reason: 'history-preserved' })
      return
    }
    const rs = stampOf(r)
    const ls = stampOf(cur)
    if (rs > ls) {
      toPut.push(r)
    } else if (rs === ls) {
      conflicts.push({ table, id, reason: 'tie-keep-local' })
    } else {
      conflicts.push({ table, id, reason: 'remote-older' })
    }
  })
  return { toPut, conflicts }
}

async function tableExists(table: string): Promise<boolean> {
  try {
    await db.table(table).toCollection().limit(1).toArray()
    return true
  } catch {
    return false
  }
}

export interface SyncResult {
  uploaded: number
  downloaded: number
  tables: string[]
  at: string
  conflicts: SyncConflict[]
}

export async function syncAll(
  uid: string,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  const fsdb = firebaseDb()
  let uploaded = 0
  let downloaded = 0
  const tables: string[] = []
  const conflicts: SyncConflict[] = []

  for (const table of TABLES) {
    if (!(await tableExists(table))) {continue}
    onProgress?.(`Sincronizando ${table}…`)
    const col = collection(fsdb, 'users', uid, table)
    // --- download: nube -> local (last-write-wins) ---
    try {
      const snap = await getDocs(col)
      const incoming: any[] = []
      snap.forEach((d) => incoming.push({ ...d.data() }))
      if (incoming.length) {
        const local = await db.table(table).toArray()
        const localById = new Map(local.map((r: any, i: number) => [docIdOf(table, r, i), r]))
        const { toPut, conflicts: tableConflicts } = applyDownloadPolicy(table, incoming, localById)
        for (const c of tableConflicts.slice(0, 50 - conflicts.length)) { conflicts.push(c) }
        if (toPut.length) {
          await db.table(table).bulkPut(toPut)
          downloaded += toPut.length
        }
      }
    } catch {
      // sin conexión o sin permiso: se sigue con upload local igual
    }
    // --- upload: local -> nube (merge por id, sin datos demo) ---
    try {
      const rows = (await db.table(table).toArray()).filter((r: any) => r?.isDemo !== true)
      // Firestore limita batch a 500
      for (let i = 0; i < rows.length; i += 450) {
        const batch = writeBatch(fsdb)
        for (const r of rows.slice(i, i + 450)) {
          batch.set(doc(col, docIdOf(table, r, i)), JSON.parse(JSON.stringify(r)), { merge: true })
        }
        await batch.commit()
        uploaded += Math.min(450, rows.length - i)
      }
      tables.push(table)
    } catch (e) {
      throw new Error(`Falló la subida de ${table}. Revisá conexión y reglas de Firestore.`)
    }
  }

  // Rutinas (viven en routineStore) -> meta/routines
  try {
    onProgress?.('Sincronizando rutinas…')
    const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
    const list = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    if (list.length > 0) {
      const ref = doc(fsdb, 'users', uid, 'meta', 'routines')
      await setDoc(ref, { list, activeId, updatedAt: new Date().toISOString() }, { merge: true })
      uploaded += 1
      tables.push('meta/routines')
    }
  } catch {}

  const at = new Date().toISOString()
  try {
    localStorage.setItem(LAST_SYNC_KEY, at)
  } catch {}
  return { uploaded, downloaded, tables, at, conflicts: conflicts.slice(0, 50) }
}
