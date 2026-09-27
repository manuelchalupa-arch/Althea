// FASE 2 S6 · Preferencias persistentes del Coach.
//
// El Coach NO tiene una tabla `coachPrefs`: la fuente canónica de sus
// preferencias es `db.userProfile` (id 'me'), igual que el resto del perfil.
// Este módulo expone la única escritura de la *vista de método* del Coach para
// que quede fuera de los componentes y sea verificable en tests.

import { db } from '@/services/storage/db'
import type { UserProfile } from '@/types'
import type { TrainingMethodId } from './trainingMethods'

/**
 * Guardar qué método quiere ver la persona en la pantalla del Coach.
 *
 * NO escribe `coachTone`: el tono es una preferencia explícita y canónica
 * (editorada en Perfil). Antes este mismo handler también pisaba `coachTone`
 * con el tono del método elegido, destruyendo esa elección; el tono efectivo
 * se deriva ahora con `resolveCoachTone()`.
 */
export async function setCoachMethodView(id: TrainingMethodId): Promise<void> {
  await db.userProfile.update('me', { coachMethodView: id } as Partial<UserProfile>)
}
