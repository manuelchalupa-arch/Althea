import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getPendingActions, completeRecoveryCheck, ensurePendingForDue } from '@/services/notifications/requiredActionService'
import type { UnifiedNotifConfig } from '@/services/notifications/unifiedNotifications'
import { AltheaCard } from '@/components/althea'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'

export function RequiredActionGate({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Array<{ configId: string; config: UnifiedNotifConfig }>>([])
  const [checking, setChecking] = useState(true)

  const refresh = async () => {
    await ensurePendingForDue()
    const list = await getPendingActions()
    setPending(list.map(l => ({ configId: l.configId, config: l.config })))
    setChecking(false)
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 60_000)
    const onRec = () => refresh()
    window.addEventListener('recoveryChange', onRec)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(iv)
      window.removeEventListener('recoveryChange', onRec)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  if (checking) return <>{children}</>

  const needsRecovery = pending.some(p => p.config.type === 'recuperacion')
  if (!needsRecovery || pending.length === 0) return <>{children}</>

  const cfg = pending.find(p => p.config.type === 'recuperacion')!.config
  const times = cfg.times?.length ? cfg.times.join(' · ') : cfg.time

  return (
    <div className="min-h-screen bg-transparent">
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <AltheaCard level={2} className="w-full max-w-lg max-h-[90vh] overflow-auto space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-full bg-tertiary/15 border border-tertiary/40 p-2 text-tertiary">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-caps text-[10px] uppercase tracking-widest text-tertiary font-semibold">Acción obligatoria</div>
              <div className="font-body-sm text-sm text-on-surface mt-1">{cfg.title || 'Completá tu check-in de recuperación'} — debés completarlo para continuar.</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-1">Configurado como obligatorio{times ? ` · ${times}` : ''} · bloquea la navegación hasta completar.</div>
            </div>
          </div>
          <RecoveryCheckForm onSaved={async () => {
            await completeRecoveryCheck()
            await refresh()
          }} />
          <p className="font-body-sm text-xs text-on-surface-variant text-center border-t border-outline-variant/30 pt-3">Solo se habilita “Guardar recuperación” — al guardar se desbloquea automáticamente.</p>
        </AltheaCard>
      </div>
      {/* bloqueo: no renderizar children debajo */}
      <div className="pointer-events-none opacity-30">{children}</div>
    </div>
  )
}