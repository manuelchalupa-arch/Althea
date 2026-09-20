import { db } from './db'

/** Claves de UI que NUNCA se borran (preferencias, no datos de usuario). */
export const PRESERVED_KEYS = [
  'althea:theme',
  'althea:textscale',
  'althea:nav-collapsed',
] as const

/** Prefijos exactos de claves que pertenecen a datos de usuario y se eliminan. */
export const USER_DATA_PREFIXES = [
  'onboard:',
  'coachMemory',
  'coachQA',
  'coachPrefs',
  'coachIntensity',
  'coachTrainingMethod',
  'rutinas:list',
  'rutina:activeId',
  'rutina:meta',
  'rutina:ex',
  'rutinas:',
  'rutina:',
  'session:',
  'althea:session',
  'althea:migration',
  'althea:result:',
  'exstate:',
  'neg:',
  'obs:',
  'observation:',
  'post:',
  'rec:',
  'recovery:',
  'nutri:diario',
  'nutri:diario_v2',
  'nutrition:adherence',
  'hydration:',
  'seed:',
  'exgym:',
  'gym:partmap',
  'syncQueue',
  'notifLog',
  'althea:notifLog:v1',
  'althea:notifs:v1',
  'althea:notifs:fired',
  'session:todayCompleted',
  'codulia_api_key',
  'althea:offlineMode',
  'althea:fcmToken',
  'althea:lastSync',
  'trainpwa-profile',
] as const

function isUserDataKey(key: string): boolean {
  if ((PRESERVED_KEYS as readonly string[]).includes(key)) {
    return false
  }
  return (USER_DATA_PREFIXES as readonly string[]).some(p => key === p || key.startsWith(p))
}

/**
 * Borrado selectivo de datos de usuario (eliminación de cuenta).
 * - Solo elimina claves explícitas de datos de usuario.
 * - Preserva preferencias UI, claves Firebase SDK y cualquier clave ajena.
 * - Vacía Dexie (base 'trainPWA') vía API oficial.
 */
export async function clearUserDataOnAccountDelete(
  storage: Storage = globalThis.localStorage
): Promise<{ removedKeys: string[]; dexieDeleted: boolean }> {
  const removedKeys: string[] = []
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k) {
      keys.push(k)
    }
  }
  for (const k of keys) {
    if (isUserDataKey(k)) {
      storage.removeItem(k)
      removedKeys.push(k)
    }
  }
  let dexieDeleted = false
  try {
    await db.delete()
    dexieDeleted = true
  } catch {
    dexieDeleted = false
  }
  return { removedKeys, dexieDeleted }
}
