import { Link } from 'react-router-dom'
import SemanticIcon from '../components/ui/SemanticIcon';
import { DailyRemindersConfig } from '@/components/notifications/DailyRemindersConfig'
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { db } from '@/services/storage/db'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { useVisibleSections } from '@/hooks/useVisibleSections'
import { MAS_GROUPS } from '@/components/brand/icons'
import { unifiedAllCompletedSets } from '@/services/history'
import { AltheaCard, AltheaCardHeader, AltheaKPICard, AltheaBadge } from '@/components/althea'
import InstallAppButton from '@/components/install/InstallAppButton'
import { todayKey, dayKeyOffset, toDateKey, parseLocalDateKey } from '@/utils/dates'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { accentSectionForPath } from '@/components/navigation/sections'

interface MasStats {
  sessions90d: number
  sets7d: number
  routineName?: string
  daysPerWeek?: number
  weekNumber?: number
}

// Icono Material por clave de icono de MAS_GROUPS (la clave Althea ≠ nombre semántico).
const GROUP_SEMANTIC_ICON: Record<string, string> = {
  library: 'menu_book', routines: 'fitness_center', energy: 'fitness_center',
  calendar: 'calendar_month', nutrition: 'restaurant_menu', progress: 'auto_graph',
  recovery: 'bedtime', coach: 'forum', profile: 'badge', crossfit: 'local_fire_department',
}

export default function Mas(){
  const [routineCount, setRoutineCount] = useState(0)
  const [showNotifModal, setShowNotifModal] = useState(false)
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null)
  const notificationCloseRef = useRef<HTMLButtonElement | null>(null)
  const [stats, setStats] = useState<MasStats | null>(null)
  // (D) Misma fuente de verdad que Inicio/AppNav: sesión activa no finalizada.
  const { hasActiveSession } = useActiveTrainingSession()
  const { isVisible } = useVisibleSections()
  useEffect(() => {
    import('@/services/storage/routineStore').then(({ getAllRoutines }) =>
      getAllRoutines().then(list => setRoutineCount(list.length))
    )
  }, [])

  // El modal tiene semántica de diálogo, cierre por Escape y bloquea el scroll
  // de fondo. Al cerrarlo devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!showNotifModal) { return }
    const previousOverflow = document.body.style.overflow
    const notificationButton = notificationButtonRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setShowNotifModal(false) }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    notificationCloseRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      notificationButton?.focus()
    }
  }, [showNotifModal])

  const handleNotificationDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') { return }
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable.length) { return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Métricas reales desde Dexie; sin datos → "Sin datos" (nunca ficticios).
  // Solo lo que ESTA pantalla muestra: Más es centro de accesos, no tablero.
  // El detalle (récords, macros, IMC) vive en Progreso / Nutrición / Perfil.
  useEffect(() => {
    (async () => {
      try {
        const sets = await unifiedAllCompletedSets().catch(() => [])
        const cut90Str = dayKeyOffset(todayKey(), -90)
        const cut7Str = dayKeyOffset(todayKey(), -7)
        const sets7d = sets.filter(s => toDateKey(s.createdAt) >= cut7Str).length
        const sessions90d = await db.trainingSessions.where('calendarDate').aboveOrEqual(cut90Str).count().catch(() => 0)

        let weekNumber: number | undefined
        let routineName: string | undefined
        let daysPerWeek: number | undefined
        try {
          const p = await db.userProfile.get('me').catch(() => null)
          const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
          const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
          const [rawRoutines, activeRoutineId] = await Promise.all([
            getAllRoutines().catch(() => []),
            getActiveRoutineId().catch(() => null),
          ])
          routineName = (rawRoutines.find(r => r.id === activeRoutineId) || rawRoutines[0])?.name
          const start = ((pv?.cycle ?? p?.cycle) as { startDate?: string } | undefined)?.startDate
          if (start) {
            weekNumber = Math.max(1, Math.floor((Date.now() - parseLocalDateKey(start).getTime()) / (7 * 86400000)) + 1)
          }
          const weekMap = ((pv?.cycle ?? p?.cycle) as { weekMap?: (number | null)[] } | undefined)?.weekMap
          daysPerWeek = weekMap ? weekMap.filter(d => d !== null).length : undefined
        } catch { /* noop */ }

        setStats({ sessions90d, sets7d, routineName, weekNumber, daysPerWeek })
      } catch { /* noop: las tarjetas muestran "Sin datos" */ }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-transparent pb-24 sm:px-5 lg:px-8 xl:px-10 w-full mx-auto pt-2 md:py-6 space-y-5">

      {/* ═══ HEADER ═══ */}
      <header className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <SemanticIcon name="apps" size={22} className="text-[22px] text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="font-headline-lg text-lg text-on-surface font-semibold">Más</h1>
          <p className="font-body-md text-xs text-on-surface-variant">Centro de acceso y resumen de tu actividad.</p>
        </div>
        <InstallAppButton />
      </header>

      {stats ? (
          <section aria-label="Resumen de actividad">
            <AltheaCardHeader title="Resumen" subtitle="Tu actividad en un vistazo" icon="monitoring" />
            <div className="grid grid-cols-2 gap-3">
              <AltheaKPICard icon="calendar_month" label="Sesiones · 90 días" value={stats.sessions90d} subtitle={stats.sets7d ? `${stats.sets7d} series en 7 días` : 'Sin series recientes'} color="success" />
              <AltheaKPICard icon="menu_book" label="Rutinas" value={routineCount} subtitle="Registradas" />
            </div>

            <div className="mt-3">
              <AltheaCard level={2} padding="sm">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-aux text-[11px]">Rutina activa</span>
                  <AltheaBadge variant="primary">{stats.weekNumber ? `Semana ${stats.weekNumber}` : 'Sin ciclo'}</AltheaBadge>
                </div>
                <p className="font-headline-md text-lg text-on-surface font-semibold whitespace-normal break-words">{stats.routineName ?? 'Sin rutina activa'}</p>
                <p className="font-body-md text-sm text-on-surface-variant mt-0.5">
                  {stats.daysPerWeek !== undefined ? `${stats.daysPerWeek}× por semana` : 'Sin datos de frecuencia'}
                </p>
              </AltheaCard>
            </div>
          </section>
      ) : null}

      {/* ═══ SECCIONES (fuente única MAS_GROUPS: mismos destinos que la barra lateral) ═══ */}
          <section aria-label="Accesos a secciones">
            <AltheaCardHeader title="Secciones" subtitle="Todo el contenido de Althea, ordenado" icon="tune" />
            {hasActiveSession && (
              <Link to="/entrenar" data-section={accentSectionForPath('/entrenar')} className="block min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl mb-3">
                <AltheaCard level={2} padding="sm" hover className="h-full border-primary/40">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                      <SemanticIcon name="tactic" size={20} className="text-[20px] text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-headline-md text-base text-on-surface font-semibold truncate">Entrenar</p>
                      <p className="font-body-md text-sm text-on-surface-variant truncate">Sesión en curso — continuar</p>
                    </div>
                    <SemanticIcon name="chevron_right" size={20} className="text-[20px] text-on-surface-variant shrink-0" />
                  </div>
                </AltheaCard>
              </Link>
            )}
            {MAS_GROUPS.map(g => {
              const items = g.items.filter(it => isVisible(it.icon as string))
              if (!items.length) { return null }
              return (
                <div key={g.title} className="mb-3 last:mb-0">
                  <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider mb-1.5">{g.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map(l => (
                      <Link key={l.to} to={l.to} data-section={accentSectionForPath(l.to)} className="min-h-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl">
                        <AltheaCard level={2} padding="sm" hover className="h-full">
                          <div className="flex items-center gap-3">
                            <SemanticIcon name={GROUP_SEMANTIC_ICON[l.icon] ?? 'apps'} size={20} className="text-[20px] text-accent shrink-0" />
                            <p className="font-body-md text-[15px] leading-snug text-on-surface font-medium flex-1 min-w-0 whitespace-normal break-words">{l.label}</p>
                            <SemanticIcon name="chevron_right" size={20} className="text-[20px] text-on-surface-variant shrink-0" />
                          </div>
                        </AltheaCard>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>

      {/* ═══ CONFIGURACIÓN GENERAL ═══ */}
      <section aria-label="Configuración general">
            <AltheaCardHeader title="Configuración" subtitle="Recordatorios y avisos" icon="notifications_active" />
            <AltheaCard level={2} padding="md">
              <button
                type="button"
                ref={notificationButtonRef}
                onClick={() => setShowNotifModal(true)}
                className="w-full min-h-[48px] flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant hover:border-primary/50 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <SemanticIcon name="notifications_active" size={20} className="text-primary" />
                  <span className="font-body-md text-[15px] text-on-surface font-medium">Notificaciones y recordatorios</span>
                </span>
                <SemanticIcon name="chevron_right" size={20} className="text-on-surface-variant shrink-0" />
              </button>
              <p className="font-body-sm text-xs text-on-surface-variant mt-2">Configurá horarios, títulos y activación de recordatorios diarios.</p>
            </AltheaCard>
      </section>

      {showNotifModal && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
          onClick={() => setShowNotifModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mas-notif-title"
            onKeyDown={handleNotificationDialogKeyDown}
            tabIndex={-1}
            className="althea-modal w-full max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain rounded-2xl bg-surface-container border border-outline-variant p-3 sm:p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="mas-notif-title" className="min-w-0 font-headline-lg text-lg text-on-surface font-semibold">Notificaciones y recordatorios</h2>
              <button
                type="button"
                ref={notificationCloseRef}
                onClick={() => setShowNotifModal(false)}
                aria-label="Cerrar notificaciones y recordatorios"
                className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
              >
                <SemanticIcon name="close" size={18} />
              </button>
            </div>
            <DailyRemindersConfig />
          </div>
        </div>
      )}
    </div>
  )
}