import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/services/storage/db'
import { firebaseDb } from './config'

// Sincronización Dexie (offline-first, fuente local) <-> Firestore (backup multi-dispositivo).
// Modelo: users/{uid}/{coleccion}/{docId}. Upload con merge por id; download con
// last-write-wins por updatedAt/createdAt cuando existe, sino pisa por id.
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
] as const

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
}

export async function syncAll(
  uid: string,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  const fsdb = firebaseDb()
  let uploaded = 0
  let downloaded = 0
  const tables: string[] = []

  for (const table of TABLES) {
    if (!(await tableExists(table))) continue
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
        const toPut = incoming.filter((r) => {
          const id = docIdOf(table, r, incoming.indexOf(r))
          const cur = localById.get(id)
          return !cur || stampOf(r) >= stampOf(cur)
        })
        if (toPut.length) {
          await db.table(table).bulkPut(toPut)
          downloaded += toPut.length
        }
      }
    } catch {
      // sin conexión o sin permiso: se sigue con upload local igual
    }
    // --- upload: local -> nube (merge por id) ---
    try {
      const rows = await db.table(table).toArray()
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

  // Rutinas (viven en localStorage) -> meta/routines
  try {
    onProgress?.('Sincronizando rutinas…')
    const raw = localStorage.getItem('rutinas:list')
    const activeId = localStorage.getItem('rutina:activeId')
    if (raw) {
      const ref = doc(fsdb, 'users', uid, 'meta', 'routines')
      await setDoc(ref, { list: JSON.parse(raw), activeId, updatedAt: new Date().toISOString() }, { merge: true })
      uploaded += 1
      tables.push('meta/routines')
    }
  } catch {}

  const at = new Date().toISOString()
  try {
    localStorage.setItem(LAST_SYNC_KEY, at)
  } catch {}
  return { uploaded, downloaded, tables, at }
}
