import { useEffect, useState } from 'react'
import { onUser } from '@/services/firebase/auth'
import { isFirebaseConfigured } from '@/services/firebase/config'
import { fetchIsFeedbackAdmin } from '@/services/feedback/feedbackService'
import type { FeedbackActor } from '@/services/feedback/feedbackAuthz'

export interface FeedbackActorState {
  actor: FeedbackActor | null
  loading: boolean
  /** Sin cuenta conectada (Firebase no configurado o sesión ausente). */
  needsAccount: boolean
}

/**
 * UID autenticado + rol administrativo. El rol NO viene de ninguna variable de
 * frontend: se resuelve leyendo `admins/uids` en Firestore, que las reglas solo
 * permiten leer a un UID ya listado (permission-denied ⇒ no admin).
 */
export function useFeedbackActor(): FeedbackActorState {
  const [state, setState] = useState<FeedbackActorState>({ actor: null, loading: true, needsAccount: false })

  useEffect(() => {
    let alive = true
    if (!isFirebaseConfigured()) {
      setState({ actor: null, loading: false, needsAccount: true })
      return () => { alive = false }
    }
    const unsub = onUser((u) => {
      if (!alive) { return }
      if (!u) {
        setState({ actor: null, loading: false, needsAccount: true })
        return
      }
      setState((s) => ({ ...s, loading: true }))
      fetchIsFeedbackAdmin()
        .then((isAdmin) => {
          if (!alive) { return }
          setState({ actor: { uid: u.uid, isAdmin }, loading: false, needsAccount: false })
        })
        .catch(() => {
          if (!alive) { return }
          setState({ actor: { uid: u.uid, isAdmin: false }, loading: false, needsAccount: false })
        })
    })
    return () => { alive = false; unsub() }
  }, [])

  return state
}
