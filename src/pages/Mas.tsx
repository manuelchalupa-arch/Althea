import { Link } from 'react-router-dom'
import { DailyRemindersConfig } from '@/components/notifications/DailyRemindersConfig'
import { useState, useEffect } from 'react'
import { db } from '@/services/storage/db'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { unifiedAllCompletedSets } from '@/services/history'
import { calculateExercisePRs } from '@/services/training/prs'
import { prettyExId } from '@/utils/format'
import { calcTMB, calcTDEE, calorieGoal, proteinRange, calcIMC } from '@/utils/nutrition'
import { resolveTrainingGoal } from '@/utils/trainingGoal'
import { AltheaCard, AltheaCardHeader, AltheaKPICard, AltheaBadge, AltheaLoading } from '@/components/althea'
import { todayKey, dayKeyOffset, toDateKey, parseLocalDateKey } from '@/utils/dates'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'

interface MasStats {
  sessions90d: number
  tonnage90d: number
  sets7d: number
  top: { name: string; orm: number }[]
  routineName?: string
  daysPerWeek?: number
  chatCount: number
  weightKg?: number
  heightCm?: number
  tdee?: number
  protein?: number
  carbs?: number
  fat?: number
  imc?: string
  weightDiff?: number
  weekNumber?: number
  exerciseCount: number
}

export default function Mas(){
  const [routineCount, setRoutineCount] = useState(0)
  const [stats, setStats] = useState<MasStats | null>(null)
  // (D) Misma fuente de verdad que Inicio/AppNav: sesión activa no finalizada.
  const { hasActiveSession } = useActiveTrainingSession()
  useEffect(() => {
    import('@/services/storage/routineStore').then(({ getAllRoutines }) =>
      getAllRoutines().then(list => setRoutineCount(list.length))
    )
  }, [])

  // Métricas reales desde Dexie; sin datos → "Sin datos" (nunca ficticios).
  useEffect(() => {
    (async () => {
      try {
        const p = await db.userProfile.get('me').catch(() => null)
        const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
        const sets = await unifiedAllCompletedSets().catch(() => [])
        const cut90Str = dayKeyOffset(todayKey(), -90)
        const cut7Str = dayKeyOffset(todayKey(), -7)
        const recent = sets.filter(s => toDateKey(s.createdAt) >= cut90Str)
        const tonnage90d = recent.reduce((a, s) => a + s.weight * s.reps, 0)
        const sets7d = sets.filter(s => toDateKey(s.createdAt) >= cut7Str).length
        const sessions90d = await db.trainingSessions.where('calendarDate').aboveOrEqual(cut90Str).count().catch(() => 0)

        // Top-2 1RM por ejercicio (solo grupos con peso > 0)
        const byEx = new Map<string, { weight: number; reps: number; date: string; setRecordId: string }[]>()
        for (const s of sets) {
          if (s.weight <= 0 || s.reps <= 0) { continue }
          const arr = byEx.get(s.exerciseId) || []
          arr.push({ weight: s.weight, reps: s.reps, date: toDateKey(s.createdAt), setRecordId: '' })
          byEx.set(s.exerciseId, arr)
        }
        const scored: { id: string; orm: number }[] = []
        for (const [id, arr] of byEx) {
          const pr = calculateExercisePRs(arr)
          if (pr.maxEstimated1RM) { scored.push({ id, orm: pr.maxEstimated1RM.estimated1RM }) }
        }
        scored.sort((a, b) => b.orm - a.orm)
        const [exRows, customs] = await Promise.all([
          db.exercises.toArray().catch(() => [] as { id: string; name: string }[]),
          import('@/services/training/customExercises').then(m => m.listCustomExercises().catch(() => [] as { id: string; name: string }[])),
        ])
        const nameOf = (id: string) =>
          exRows.find(e => e.id === id)?.name || customs.find(c => c.id === id)?.name || prettyExId(id)
        const top = scored.slice(0, 2).map(s => ({ name: nameOf(s.id), orm: Math.round(s.orm) }))

        const prof = p
        const w = prof?.weightKg, h = prof?.heightCm
        let tdee: number | undefined, protein: number | undefined, carbs: number | undefined, fat: number | undefined, imc: string | undefined
        if (w && h && prof) {
          const tmb = calcTMB(w, h, prof.age, prof.sex)
          const tdeeRaw = tmb !== null ? calcTDEE(tmb, prof.activityLevel || 'moderado', prof.schedule?.availableDays?.length || 3) : null
          if (tdeeRaw !== null) {
            tdee = Math.round(tdeeRaw)
            const tgResolved = resolveTrainingGoal(prof)
            const calGoal = calorieGoal(tdee, tgResolved || prof.goalPrimary) || tdee
            const prot = proteinRange(w, tgResolved || prof.goalPrimary)
            protein = prot?.low || Math.round(w * 1.8)
            fat = Math.round(calGoal * 0.25 / 9)
            carbs = Math.round((calGoal - protein * 4 - fat * 9) / 4)
          }
          imc = calcIMC(w, h).bmi
        }
        const bodies = await db.bodyMeasurements.toArray().catch(() => [])
        const ws = bodies.map(b => Number(b.weightKg)).filter(n => !isNaN(n))
        const weightDiff = ws.length >= 2 ? Math.round((ws[ws.length - 1] - ws[0]) * 10) / 10 : undefined

        let weekNumber: number | undefined
        try {
          const start = ((pv?.cycle ?? p?.cycle) as { startDate?: string } | undefined)?.startDate
          if (start) {
            weekNumber = Math.max(1, Math.floor((Date.now() - parseLocalDateKey(start).getTime()) / (7 * 86400000)) + 1)
          }
        } catch { /* noop */ }
        const exerciseCount = exRows.length + customs.length
        const chatCount = await db.chatMessages.where('role').equals('user').count().catch(() => 0)
        const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
        const [rawRoutines, activeRoutineId] = await Promise.all([
          getAllRoutines().catch(() => []),
          getActiveRoutineId().catch(() => null),
        ])
        const activeRoutine = rawRoutines.find(r => r.id === activeRoutineId) || rawRoutines[0]
        const weekMap = ((pv?.cycle ?? p?.cycle) as { weekMap?: (number | null)[] } | undefined)?.weekMap
        const daysPerWeek = weekMap ? weekMap.filter(d => d !== null).length : undefined

        setStats({
          sessions90d, tonnage90d: Math.round(tonnage90d * 10) / 10, sets7d, top,
          routineName: activeRoutine?.name, daysPerWeek, chatCount,
          weightKg: w, heightCm: h, tdee, protein, carbs, fat, imc, weightDiff,
          weekNumber, exerciseCount,
        })
      } catch { /* noop: las tarjetas muestran "Sin datos" */ }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-transparent pb-24 max-w-[720px] w-full mx-auto px-0 pt-2 md:px-4 md:py-6 space-y-5">

      {/* ═══ HEADER ═══ */}
      <header className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[22px] text-primary">apps</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-headline-lg text-lg text-on-surface font-semibold">Más</h1>
          <p className="font-body-md text-xs text-on-surface-variant truncate">Centro de acceso y resumen de tu actividad.</p>
        </div>
      </header>

      {!stats ? (
        <AltheaLoading lines={4} />
      ) : (
        <>
          {/* ═══ RESUMEN ═══ */}
          <section aria-label="Resumen de actividad">
            <AltheaCardHeader title="Resumen" subtitle="Datos reales de tu registro local" icon="monitoring" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <AltheaKPICard icon="fitness_center" label="Ejercicios" value={stats.exerciseCount} subtitle="En biblioteca" />
              <AltheaKPICard icon="menu_book" label="Rutinas" value={routineCount} subtitle="Registradas" />
              <AltheaKPICard icon="auto_graph" label="Sesiones · 90 días" value={stats.sessions90d} subtitle={stats.sets7d ? `${stats.sets7d} series últimos 7 días` : 'Sin series recientes'} color="success" />
              <AltheaKPICard icon="forum" label="Consultas al Coach" value={stats.chatCount} subtitle="Mensajes tuyos" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <AltheaCard level={2} padding="sm">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-aux">Rutina activa</span>
                  <AltheaBadge variant="primary">{stats.weekNumber ? `Semana ${stats.weekNumber}` : 'Sin ciclo'}</AltheaBadge>
                </div>
                <p className="font-headline-md text-lg text-on-surface font-semibold truncate">{stats.routineName ?? 'Sin rutina activa'}</p>
                <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                  {stats.daysPerWeek !== undefined ? `${stats.daysPerWeek}× por semana` : 'Sin datos de frecuencia'}
                </p>
              </AltheaCard>

              <AltheaCard level={2} padding="sm">
                <div className="text-aux mb-1.5">Cuerpo</div>
                <p className="font-headline-md text-lg text-on-surface font-semibold truncate">
                  {stats.heightCm !== undefined && stats.weightKg !== undefined ? `${stats.heightCm} cm · ${stats.weightKg} kg` : 'Sin datos corporales'}
                </p>
                <p className="font-body-md text-xs text-on-surface-variant mt-0.5 capitalize">
                  {stats.imc !== undefined ? `IMC ${stats.imc}` : ''}
                  {stats.weightDiff !== undefined ? ` · ${stats.weightDiff > 0 ? '+' : ''}${stats.weightDiff} kg` : ''}
                </p>
              </AltheaCard>

              <AltheaCard level={2} padding="sm">
                <div className="text-aux mb-1.5">Nutrición estimada</div>
                <p className="font-headline-md text-lg text-on-surface font-semibold truncate">
                  {stats.tdee !== undefined ? `${stats.tdee.toLocaleString('es-ES')} kcal` : 'Sin datos'}
                </p>
                <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                  {stats.protein !== undefined ? `Proteína ${stats.protein}g · Carbos ${stats.carbs ?? '—'}g · Lípidos ${stats.fat ?? '—'}g` : 'Calculá tu perfil para estimar macros'}
                </p>
              </AltheaCard>

              <AltheaCard level={2} padding="sm">
                <div className="text-aux mb-1.5">Récords</div>
                {stats.top.length > 0 ? (
                  <div className="space-y-1">
                    {stats.top.map(t => (
                      <div key={t.name} className="flex items-center justify-between gap-2">
                        <span className="font-body-md text-sm text-on-surface truncate capitalize">{t.name}</span>
                        <span className="font-mono text-sm text-secondary font-semibold shrink-0">{t.orm} kg</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-headline-md text-lg text-on-surface font-semibold">Sin datos</p>
                )}
                <p className="font-body-md text-xs text-on-surface-variant mt-1">
                  {stats.tonnage90d > 0 ? `${(stats.tonnage90d / 1000).toFixed(1)} t movidas en 90 días` : 'Sin tonelaje registrado'}
                </p>
              </AltheaCard>
            </div>
          </section>

          {/* ═══ ACCESOS ═══ */}
          <section aria-label="Accesos a secciones">
            <AltheaCardHeader title="Accesos" subtitle="Todas las secciones de tu entrenamiento" icon="tune" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                ...(hasActiveSession ? [{ to: '/entrenar', icon: 'tactic', name: 'Entrenar', desc: stats.routineName ? `Sesión de ${stats.routineName}` : 'Sesión de entrenamiento' }] : []),
                { to: '/rutina', icon: 'fitness_center', name: 'Rutinas', desc: `${routineCount} rutinas registradas` },
                { to: '/calendario', icon: 'calendar_month', name: 'Calendario', desc: `${stats.sessions90d} sesiones en 90 días` },
                { to: '/biblioteca', icon: 'menu_book', name: 'Biblioteca', desc: `${stats.exerciseCount} ejercicios disponibles` },
                { to: '/nutricion', icon: 'restaurant', name: 'Nutrición', desc: stats.tdee !== undefined ? `Meta ~${stats.tdee.toLocaleString('es-ES')} kcal` : 'Metas y macros' },
                { to: '/recuperacion', icon: 'bedtime', name: 'Recuperación', desc: 'Sueño, energía y fatiga' },
                { to: '/progreso', icon: 'monitoring', name: 'Progreso', desc: stats.top.length > 0 ? `${stats.top[0].name}: ${stats.top[0].orm} kg 1RM` : 'Récords y tendencias' },
                { to: '/coach', icon: 'forum', name: 'Coach', desc: stats.chatCount > 0 ? `${stats.chatCount} consultas realizadas` : 'Asistente de entrenamiento' },
                { to: '/perfil', icon: 'badge', name: 'Perfil', desc: 'Datos, preferencias y cuenta' },
              ].map(l => (
                <Link key={l.to} to={l.to} className="min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl">
                  <AltheaCard level={2} padding="sm" hover className="h-full">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px] text-primary">{l.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-headline-md text-sm text-on-surface font-semibold truncate">{l.name}</p>
                        <p className="font-body-md text-xs text-on-surface-variant truncate">{l.desc}</p>
                      </div>
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">chevron_right</span>
                    </div>
                  </AltheaCard>
                </Link>
              ))}
            </div>
          </section>

          {/* ═══ CONFIGURACIÓN GENERAL ═══ */}
          <section aria-label="Configuración general">
            <AltheaCardHeader title="Configuración" subtitle="Recordatorios y avisos" icon="notifications_active" />
            <AltheaCard level={2} padding="md">
              <DailyRemindersConfig />
            </AltheaCard>
          </section>
        </>
      )}
    </div>
  )
}