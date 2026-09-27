import { useCallback, useEffect, useState } from 'react'
import { getActiveSession, isActiveSessionStatus, SESSION_CHANGED_EVENT, FINAL_STATES } from '@/services/training/sessionStore'
import type { TrainingSession, SessionStatus } from '@/services/training/domain'

// FUENTE DE VERDAD de "hay sesión activa" (requisito D).
// Una sesión está activa si su estado es READY / IN_PROGRESS / PAUSED /
// COMPLETING (no finalizada). Cualquier estado final (COMPLETED, PARTIAL,
// CANCELLED, ABANDONED) la desactiva: Entrenar deja de estar disponible y
// Inicio vuelve a ser el punto de partida.
export type ActiveTrainingSession = {
  session: TrainingSession | null
  hasActiveSession: boolean
  status: SessionStatus | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useActiveTrainingSession(): ActiveTrainingSession {
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await getActiveSession()
      setSession(s && isActiveSessionStatus(s.sessionStatus) ? s : null)
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const s = await getActiveSession()
        if (!alive) {return}
        setSession(s && isActiveSessionStatus(s.sessionStatus) ? s : null)
      } catch {
        if (alive) {setSession(null)}
      } finally {
        if (alive) {setLoading(false)}
      }
    }
    run()
    const onChange = () => { run() }
    window.addEventListener(SESSION_CHANGED_EVENT, onChange)
    window.addEventListener('focus', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      alive = false
      window.removeEventListener(SESSION_CHANGED_EVENT, onChange)
      window.removeEventListener('focus', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  return {
    session,
    hasActiveSession: !!session,
    status: session?.sessionStatus ?? null,
    loading,
    refresh,
  }
}

export { FINAL_STATES }
