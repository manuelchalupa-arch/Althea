// Biblioteca compartida entre todos los usuarios (top-level collection).
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { firebaseDb } from '@/services/firebase/config'
import { getAuth } from 'firebase/auth'
import { db } from '@/services/storage/db'
import type { CustomExercise } from './customExercises'
import { newCustomId } from './customExercises'

function norm(s: string) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

export async function listSharedExercises(): Promise<CustomExercise[]> {
  try {
    const fsdb = firebaseDb()
    const snap = await getDocs(collection(fsdb, 'sharedExercises'))
    const out: CustomExercise[] = []
    snap.forEach((d) => {
      const data = d.data() as CustomExercise
      if (data && data.id) {out.push(data)}
    })
    // cache
    try { await db.sharedExercises.clear(); await db.sharedExercises.bulkPut(out as any) } catch {}
    return out
  } catch {
    try { return await db.sharedExercises.toArray() as CustomExercise[] } catch { return [] }
  }
}

export async function publishSharedExercise(ex: CustomExercise): Promise<CustomExercise> {
  try {
    const auth = getAuth()
    const uid = auth.currentUser?.uid
    if (!uid) {throw new Error('Debes iniciar sesión para compartir')}
  } catch {}
  const id = ex.id && ex.id.startsWith('custom/') ? ex.id : newCustomId()
  const rec: CustomExercise = {
    ...ex,
    id,
    origin: 'USER_CREATED',
    updatedAt: new Date().toISOString(),
    createdAt: ex.createdAt || new Date().toISOString(),
  } as CustomExercise
  // avoid duplicates by name+muscle
  try {
    const existing = await listSharedExercises()
    const key = norm(rec.name) + '|' + norm(rec.muscle)
    const dup = existing.find(e => norm(e.name) + '|' + norm(e.muscle) === key)
    if (dup) {
      return dup
    }
  } catch {}
  const fsdb = firebaseDb()
  await setDoc(doc(fsdb, 'sharedExercises', rec.id), JSON.parse(JSON.stringify(rec)), { merge: true })
  try { await db.sharedExercises.put(rec as any) } catch {}
  return rec
}

export async function ensureInShared(ex: CustomExercise): Promise<CustomExercise> {
  try {
    const existing = await listSharedExercises()
    const key = norm(ex.name) + '|' + norm(ex.muscle)
    const dup = existing.find(e => norm(e.name) + '|' + norm(e.muscle) === key)
    if (dup) {return dup}
  } catch {}
  try {
    return await publishSharedExercise(ex)
  } catch {
    return ex
  }
}
