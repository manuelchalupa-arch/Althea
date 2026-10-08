import { useState, useEffect, useCallback } from 'react'
import {
  getHealthInfo,
  formatLastSyncTime,
  resetHealthStatus,
  type WgerHealthInfo,
} from '@/services/integrations/wger/wgerHealth'
import { getQueueStats, getFailedOperations, type QueueStats } from '@/services/integrations/wger/wgerSyncQueue'
import { getPendingConflicts, type SyncConflict } from '@/services/integrations/wger/wgerConflictResolver'
import { syncWgerToAlthea, retryFailedSync, type SyncEntityType } from '@/services/integrations/wger/wgerSyncEngine'
import { getWgerAuthState, checkWgerLinkStatus, deauthenticateWger, resetWgerAuth, type WgerAuthState } from '@/services/integrations/wger/wgerAuth'
import { db } from '@/services/storage/db'

interface WgerSyncPanelProps {
  onViewConflicts?: () => void
}

export function WgerSyncPanel({ onViewConflicts }: WgerSyncPanelProps) {
  const [health, setHealth] = useState<WgerHealthInfo | null>(null)
  const [, setQueueStats] = useState<QueueStats | null>(null)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [failedOps, setFailedOps] = useState<number>(0)
  const [syncing, setSyncing] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [authState, setAuthState] = useState<WgerAuthState>(() => getWgerAuthState())
  const [entityCounts, setEntityCounts] = useState({
    exercises: 0,
    ingredients: 0,
    routines: 0,
    trainingSessions: 0,
    nutritionPlans: 0,
    measurements: 0,
  })

  const refresh = useCallback(async () => {
    try {
      const [h, qs, c, fo] = await Promise.all([
        getHealthInfo(),
        getQueueStats(),
        getPendingConflicts(),
        getFailedOperations(),
      ])
      setHealth(h)
      setQueueStats(qs)
      setConflicts(c)
      setFailedOps(fo.length)
      // El estado de autenticación puede cambiar fuera del panel: se revalida
      // contra el servidor; si no hay conexión se conserva el último conocido.
      await checkWgerLinkStatus().catch(() => null)
      setAuthState(getWgerAuthState())
    } catch { /* noop */ }
  }, [])

  const refreshEntityCounts = useCallback(async () => {
    try {
      const [exercises, ingredients, routines, trainingSessions, nutritionPlans, measurements] = await Promise.all([
        db.exercises.count().catch(() => 0),
        db.table('ingredients').count().catch(() => 0),
        db.table('routines').count().catch(() => 0),
        db.trainingSessions.count().catch(() => 0),
        db.table('nutritionPlans').count().catch(() => 0),
        db.bodyMeasurements.count().catch(() => 0),
      ])
      setEntityCounts({
        exercises,
        ingredients,
        routines,
        trainingSessions,
        nutritionPlans,
        measurements,
      })
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    refresh()
    refreshEntityCounts()
  }, [refresh, refreshEntityCounts])

  const handleSyncNow = async () => {
    setMessage(null)
    setSyncing(true)
    try {
      // Sincronización completa: las 6 entidades que muestra el panel.
      const entityTypes: SyncEntityType[] = ['exercise', 'routine', 'ingredient', 'trainingSession', 'nutritionPlan', 'measurement']
      const result = await syncWgerToAlthea({ entityTypes })
      await refresh()
      await refreshEntityCounts()
      if (result.success) {
        setMessage(`Sincronización completada: ${result.synced} entidades procesadas.`)
      } else {
        setMessage(`Sincronización con errores: ${result.failed} fallaron.`)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error durante la sincronización.')
    } finally {
      setSyncing(false)
    }
  }

  const handleRetryErrors = async () => {
    setMessage(null)
    // Los reintentos escriben en WGER: sin cuenta vinculada siempre fallarían.
    if (!getWgerAuthState().canWrite) {
      setMessage('Los reintentos de escritura requieren vincular la cuenta WGER primero.')
      return
    }
    setRetrying(true)
    try {
      const result = await retryFailedSync()
      await refresh()
      if (result.success) {
        setMessage(`Reintentos completados: ${result.synced} operaciones recuperadas.`)
      } else {
        setMessage(`Reintentos con errores: ${result.failed} siguen fallando.`)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al reintentar.')
    } finally {
      setRetrying(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await deauthenticateWger()
      resetHealthStatus()
      await refresh()
      setAuthState(getWgerAuthState())
      setShowDisconnect(false)
      setMessage('WGER desconectado. Los datos locales se conservan.')
    } catch {
      // Sin conexión al Worker: se limpia solo el estado local. La cookie
      // remota expira sola; los datos locales se conservan igual.
      resetWgerAuth()
      resetHealthStatus()
      await refresh()
      setAuthState(getWgerAuthState())
      setShowDisconnect(false)
      setMessage('Desconectado localmente (sin conexión al servidor). Los datos locales se conservan.')
    }
  }

  const isConnected = authState.isAuthenticated || health?.status === 'SYNCED' || health?.status === 'SYNCING'

  const statusLabel = isConnected ? 'Conectado' : 'No conectado'
  const statusColor = isConnected ? 'bg-primary' : 'bg-outline'

  return (
    <div className="rounded-xl bg-surface-container-low/80 border border-outline-variant/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">WGER</div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="font-body-sm text-[12px] text-on-surface-variant">{statusLabel}</span>
        </div>
      </div>

      {/* CONEXIÓN */}
      <div className="space-y-1.5">
        <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Conexión</div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Estado</span>
          <span className="text-on-surface font-medium">{authState.isAuthenticated ? 'Autenticado' : 'Público'}</span>
        </div>
        {authState.wgerUsername && (
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Usuario</span>
            <span className="text-on-surface font-medium">{authState.wgerUsername}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Vinculación</span>
          <span className="text-on-surface font-medium">{authState.isLinked ? 'Vinculada' : 'No vinculada'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Escritura</span>
          <span className="text-on-surface font-medium">{authState.canWrite ? 'Permitida' : 'Solo lectura'}</span>
        </div>
      </div>

      {/* SINCRONIZACIÓN */}
      <div className="space-y-1.5">
        <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Sincronización</div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Última sync</span>
          <span className="text-on-surface font-medium">{formatLastSyncTime(health?.lastRemoteSyncAt ?? null)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Última sync exitosa</span>
          <span className="text-on-surface font-medium">{formatLastSyncTime(health?.lastSuccessfulSyncAt ?? null)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Estado actual</span>
          <span className="text-on-surface font-medium">{health?.message ?? 'Desconocido'}</span>
        </div>
      </div>

      {/* ENTIDADES */}
      <div className="space-y-1.5">
        <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Entidades</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Ejercicios', entityCounts.exercises],
            ['Ingredientes', entityCounts.ingredients],
            ['Rutinas', entityCounts.routines],
            ['Entrenamientos', entityCounts.trainingSessions],
            ['Nutrición', entityCounts.nutritionPlans],
            ['Mediciones', entityCounts.measurements],
          ].map(([label, count]) => (
            <div key={label as string} className="rounded-lg bg-surface-container/50 border border-outline-variant/30 p-2.5">
              <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">{label as string}</div>
              <div className="font-headline-md text-lg text-on-surface font-semibold">{count as number}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CONFLICTOS Y ERRORES */}
      <div className="flex gap-2 text-sm">
        <div className="flex-1 rounded-lg bg-surface-container/50 border border-outline-variant/30 p-2.5 text-center">
          <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Conflictos</div>
          <div className={`font-headline-md text-lg font-semibold ${conflicts.length > 0 ? 'text-secondary' : 'text-on-surface'}`}>
            {conflicts.length}
          </div>
        </div>
        <div className="flex-1 rounded-lg bg-surface-container/50 border border-outline-variant/30 p-2.5 text-center">
          <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Errores</div>
          <div className={`font-headline-md text-lg font-semibold ${failedOps > 0 ? 'text-error' : 'text-on-surface'}`}>
            {failedOps}
          </div>
        </div>
      </div>

      {/* ACCIONES */}
      <div className="space-y-2">
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="w-full py-2.5 min-h-[48px] rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold disabled:opacity-50"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onViewConflicts}
            disabled={conflicts.length === 0}
            className="py-2.5 min-h-[48px] rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant disabled:opacity-50"
          >
            Ver conflictos
          </button>
          <button
            onClick={handleRetryErrors}
            disabled={retrying || failedOps === 0}
            className="py-2.5 min-h-[48px] rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant disabled:opacity-50"
          >
            {retrying ? 'Reintentando…' : 'Reintentar errores'}
          </button>
        </div>

        <button
          onClick={() => setShowDisconnect(true)}
          className="w-full py-2.5 min-h-[48px] rounded-lg bg-red-950/30 border border-red-900/40 font-label-caps text-[10px] uppercase text-red-400 hover:bg-red-950/50 transition-colors"
        >
          Desconectar WGER
        </button>
      </div>

      {message && (
        <p className="font-body-sm text-[12px] text-on-surface-variant">{message}</p>
      )}

      {showDisconnect && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDisconnect(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-red-900/50 rounded-2xl w-full max-w-xs p-5 space-y-4">
            <h3 className="font-headline-lg text-base font-semibold text-red-400 text-center">¿Desconectar WGER?</h3>
            <p className="text-sm text-on-surface-variant text-center">Se revocará la conexión con WGER. Tus datos locales se conservan.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDisconnect(false)} className="flex-1 py-2.5 min-h-[48px] rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
              <button onClick={handleDisconnect} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-label-caps text-[10px] uppercase font-bold">Desconectar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
