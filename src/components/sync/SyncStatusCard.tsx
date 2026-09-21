import { useState, useEffect, useCallback } from 'react'
import { pendingCount, errorCount } from '@/services/sync/opQueue'
import { lastSyncAt } from '@/services/firebase/sync'

export type SyncUiState = 'offline' | 'pending' | 'syncing' | 'error' | 'synced'

// Estados honestos: nunca "sincronizado" con pendientes o errores.
export function useSyncStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pending, setPending] = useState(0)
  const [errors, setErrors] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([pendingCount(), errorCount()])
      setPending(p)
      setErrors(e)
      setLastSync(lastSyncAt())
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    refresh()
    const on = () => { setOnline(true); refresh() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const id = setInterval(refresh, 15000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(id)
    }
  }, [refresh])

  const state: SyncUiState = !online
    ? 'offline'
    : syncing
      ? 'syncing'
      : errors > 0
        ? 'error'
        : pending > 0
          ? 'pending'
          : 'synced'
  return { state, online, pending, errors, syncing, setSyncing, lastSync, refresh }
}

const STATE_LABEL: Record<SyncUiState, string> = {
  offline: 'Offline — todo funciona localmente',
  pending: 'Pendiente de sincronización',
  syncing: 'Sincronizando…',
  error: 'Error de sincronización (reintentable)',
  synced: 'Sincronizado',
}

export function SyncStatusCard() {
  const { state, pending, errors, syncing, setSyncing, lastSync, refresh } = useSyncStatus()
  const [message, setMessage] = useState<string | null>(null)

  const syncNow = async () => {
    setMessage(null)
    try {
      const { currentUser } = await import('@/services/firebase/auth')
      const u = currentUser()
      if (!u) {
        setMessage('Iniciá sesión para sincronizar con la nube.')
        return
      }
      if (!navigator.onLine) {
        setMessage('Sin conexión: lo pendiente se conserva localmente.')
        return
      }
      setSyncing(true)
      const { processQueue } = await import('@/services/sync/engine')
      const { firestoreRemote, syncAll } = await import('@/services/firebase/sync')
      const summary = await processQueue(u.uid, firestoreRemote(u.uid))
      const full = await syncAll(u.uid)
      await refresh()
      const conflicts = full.conflicts.length
      setMessage(
        `Listo: ${summary.done.length + full.uploaded} subidos, ${full.downloaded} bajados` +
        (conflicts > 0 ? `, ${conflicts} conflicto(s) preservados sin sobrescribir` : '') +
        (summary.failed.length > 0 ? `, ${summary.failed.length} con error (reintentables)` : '') +
        '.'
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falló la sincronización. Lo local está intacto.')
    } finally {
      setSyncing(false)
      await refresh()
    }
  }

  return (
    <div className="rounded-xl bg-surface-container-low/80 border border-outline-variant/50 p-4 space-y-2">
      <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Sincronización</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${state === 'synced' ? 'bg-green-400' : state === 'offline' ? 'bg-slate-400' : state === 'syncing' ? 'bg-amber-400 animate-pulse' : state === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
        <span className="font-body-md text-[15px] text-on-surface font-medium">{STATE_LABEL[state]}</span>
      </div>
      <div className="font-body-sm text-[12px] text-on-surface-variant">
        {pending > 0 && <span>{pending} operación(es) pendiente(s). </span>}
        {errors > 0 && <span>{errors} con error. </span>}
        {lastSync ? <span>Última sync: {new Date(lastSync).toLocaleString('es')}.</span> : <span>Sin sincronizaciones aún.</span>}
      </div>
      <button
        onClick={syncNow}
        disabled={syncing}
        className="w-full py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface disabled:opacity-50 min-h-[44px]"
      >
        {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>
      {message && <p className="font-body-sm text-[12px] text-on-surface-variant">{message}</p>}
      <p className="font-body-sm text-[11px] text-on-surface-variant opacity-70">Dexie es la fuente local. La nube es solo respaldo: nunca bloquea el uso offline.</p>
    </div>
  )
}
