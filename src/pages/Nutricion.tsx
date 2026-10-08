import { useState, useEffect, useMemo, useCallback } from 'react'
import { db } from '@/services/storage/db'
import {
  getDiaryEntries,
  addDiaryEntry,
  updateDiaryEntry,
  removeDiaryEntry,
  diaryEntryTime,
  nowLocalTime,
  migrateDiaryFromLocalStorage,
  migrateAdherenceFromLocalStorage,
  type DiaryEntry,
  type DiaryIngredientRecord,
} from '@/services/storage/diaryStore'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import type { CycleConfig } from '@/utils/cycle'
import { calcIMC, calcTMB, calcTDEE } from '@/utils/nutrition'
import { macroStatus, computeTotals, filterEntriesByDay, getMacroGoals, type MacroGoals, type MacroStatus, type MacroTotals } from '@/services/nutrition/macroService'
import { getNutritionMethod } from '@/services/ai/nutritionMethodsDB'
import type { NutritionMethodId } from '@/services/ai/nutritionMethods'
import type { UserProfile, BodyMeasurement } from '@/types'
import { checkNutritionSafety, type NutritionSafetyAlert } from '@/services/ai/nutritionSafety'
import { buildNutritionSuggestions } from '@/services/ai/nutritionEngine'
import { recordAdherence, getAdherenceTrend, type AdherenceRecord } from '@/services/ai/adherenceTracker'
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaProgress, AltheaButton, AltheaSection, AltheaEmpty, AltheaLoading } from '@/components/althea'
  import { HydrationBottle, HydrationQuickAdd } from '@/components/nutrition/HydrationBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { MacroPlate } from '@/components/nutrition/MacroPlate'
import { getBottleDailySummary, getCalculatedHydrationGoal, getBottleConfigs, completeBottle, addHydrationMl, type BottleConfig } from '@/services/recovery/hydrationBottles'
import { DishComposer, type DishSavePayload } from '@/components/nutrition/DishComposer'
import { dishFromEntry, type DishDraft } from '@/services/nutrition/recipeInterpreter'
import { todayKey, dayKeyOffset, weekdayOfKey } from '@/utils/dates'

type PageStatus = 'loading' | 'ready' | 'error'
type FrequentFood = DiaryEntry & { count: number }

/** Metas de referencia: solo se usan si el usuario no cargó peso y altura.
 *  No son datos del usuario, la pantalla lo aclara. */
const FALLBACK_GOALS: MacroGoals = { calories: 2200, protein: 150, carbs: 250, fat: 70 }

export default function Nutricion() {
  const [activeDate, setActiveDate] = useState(todayKey())
  const [perfil, setPerfil] = useState<UserProfile | null>(null)
  const [pesoEvo, setPesoEvo] = useState<BodyMeasurement[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([])
  const [safetyAlerts, setSafetyAlerts] = useState<NutritionSafetyAlert[]>([])
  const [adherenceRecord, setAdherenceRecord] = useState<AdherenceRecord | null>(null)
  const [goals, setGoals] = useState<MacroGoals>(FALLBACK_GOALS)
  const [goalsPersonalized, setGoalsPersonalized] = useState(false)
  const [todayTraining, setTodayTraining] = useState<{ name: string; exercises: string[] } | null>(null)
  const [suggHydration, setSuggHydration] = useState<number | null>(null)
  const [suggRecovery, setSuggRecovery] = useState<number | null>(null)
  const [todayVolume, setTodayVolume] = useState(0)
  const [status, setStatus] = useState<PageStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  // Hidratación: consumo real, objetivo y botellas configuradas
  const [hydrationTotalMl, setHydrationTotalMl] = useState(0)
  const [hydrationGoalMl, setHydrationGoalMl] = useState(0)
  const [bottleConfigs, setBottleConfigs] = useState<BottleConfig[]>([])
  const [hydrationBusy, setHydrationBusy] = useState(false)

  // Flujo de comida
  const [draft, setDraft] = useState<DishDraft | null>(null)
  const [editing, setEditing] = useState<{ id: string; draft: DishDraft; mealLabel: string } | null>(null)
  const [saving, setSaving] = useState(false)
  /** cambia al guardar para que el compositor vuelva a su estado inicial */
  const [composerVersion, setComposerVersion] = useState(0)

  const [composerNotice, setComposerNotice] = useState<string | null>(null)


  // El día va de 00:00:00 a 00:00:00 local. Si la app queda abierta y cambia el
  // día, los totales arrancan de cero para el día nuevo.
  useEffect(() => {
    const check = () => setActiveDate(prev => (prev === todayKey() ? prev : todayKey()))
    const id = window.setInterval(check, 30000)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', check) }
  }, [])

  const loadDay = useCallback(async (date: string) => {
    const entries = await getDiaryEntries(date)
    setDiaryEntries(entries)
    const week = await db.nutritionDiary
      .where('date').between(dayKeyOffset(date, -6), date).toArray().catch(() => [] as DiaryEntry[])
    const recent = await db.nutritionDiary
      .where('date').between(dayKeyOffset(date, -30), date).toArray().catch(() => [] as DiaryEntry[])
    const byName = new Map<string, FrequentFood>()
    for (const e of recent) {
      const k = e.name.trim().toLowerCase()
      const cur = byName.get(k)
      if (!cur) { byName.set(k, { ...e, count: 1 }) }
      else if (e.addedAt > cur.addedAt) { byName.set(k, { ...e, count: cur.count + 1 }) }
      else { cur.count += 1 }
    }
    setFrequentFoods([...byName.values()].sort((a, b) => b.count - a.count).slice(0, 5))
  }, [])

  const loadData = useCallback(async (date: string) => {
    setStatus('loading')
    setLoadError(null)
    try {
      await migrateDiaryFromLocalStorage()
      await migrateAdherenceFromLocalStorage()
      const p = await db.userProfile.get('me')
      setPerfil(p ?? null)
      const bodies = await db.bodyMeasurements.toArray().catch(() => [])
      setPesoEvo(bodies.sort((a, b) => a.localDate.localeCompare(b.localDate)).slice(-30))

      await loadDay(date)

      // Señales para sugerencias (solo lectura; nunca se registran como consumo)
      const hydLogs = await db.hydrationLogs.where('localDate').equals(date).toArray().catch(() => [])
      setSuggHydration(hydLogs.length ? hydLogs.reduce((a, b) => a + Number(b.amountMl || 0), 0) : null)
      const rec = await db.recoveryChecks.get(date).catch(() => null)
      setSuggRecovery(typeof rec?.score === 'number' ? rec.score : null)
      const daySessions = await db.trainingSessions.where('calendarDate').equals(date).toArray().catch(() => [])
      setTodayVolume(daySessions.reduce((a, s) => a + Number(s.totalVolume || 0), 0))

      // Objetivos: motor nutricional existente, sin valores inventados
      const personalized = Boolean(p?.weightKg && p?.heightCm)
      setGoalsPersonalized(personalized)
      setGoals(personalized ? await getMacroGoals() : FALLBACK_GOALS)

      if (p) {
        const activeMethod = p.activeNutritionMethod as NutritionMethodId | undefined
        if (activeMethod) {
          const safetyResult = checkNutritionSafety({
            trainingGoal: p.trainingGoal || 'health',
            experienceLevel: p.experienceLevel || 'beginner',
            weightKg: p.weightKg,
            healthConditions: p.healthConditions || [],
            nutritionPrefs: p.nutritionPrefs || {},
            age: p.age,
          }, activeMethod)
          setSafetyAlerts(safetyResult.alerts.filter(a => a.severity !== 'info'))
        }
        const trend = await getAdherenceTrend(activeMethod || 'mediterranean')
        setAdherenceRecord(trend.records.find(r => r.date === date) || null)
      }
      const cycle = ((await getActiveVersion(PROFILE_SCOPE))?.cycle ?? p?.cycle) as CycleConfig | null | undefined
      if (cycle?.trainingDays) {
        const n = cycle.weekMap?.[weekdayOfKey(date)] ?? null
        const todayName = n ? cycle.trainingDays.find((d: any) => d.n === n) : null
        if (todayName) { setTodayTraining({ name: todayName.name, exercises: [] }) }
      }
      setStatus('ready')
    } catch (e) {
      setStatus('error')
      setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
    }
  }, [loadDay])

  useEffect(() => { loadData(activeDate) }, [loadData, activeDate])

  // --- Hidratación: cargar consumo real, objetivo y botellas ---
  const loadHydration = useCallback(async (date: string) => {
    const [summary, goal, configs] = await Promise.all([
      getBottleDailySummary(date),
      getCalculatedHydrationGoal().catch(() => 0),
      getBottleConfigs().catch(() => [] as BottleConfig[]),
    ])
    setHydrationTotalMl(summary.totalMl)
    setHydrationGoalMl(goal)
    setBottleConfigs(configs)
  }, [])

  useEffect(() => {
    if (status === 'ready') { loadHydration(activeDate).catch(() => { /* noop */ }) }
  }, [status, activeDate, loadHydration])

  // Recargar hidratación cuando BottleConfigEditor guarda cambios
  useEffect(() => {
    const onConfigChange = () => { loadHydration(activeDate).catch(() => { /* noop */ }) }
    window.addEventListener('bottleConfigChange', onConfigChange)
    return () => window.removeEventListener('bottleConfigChange', onConfigChange)
  }, [activeDate, loadHydration])

  const handleAddBottle = async (bottle: { id: string; name?: string; capacityMl: number }) => {
    setHydrationBusy(true)
    try {
      await completeBottle(bottle.id, activeDate)
      await loadHydration(activeDate)
    } catch {
      // noop
    } finally {
      setHydrationBusy(false)
    }
  }

  const handleAddMl = async (ml: number) => {
    setHydrationBusy(true)
    try {
      await addHydrationMl(ml, activeDate)
      await loadHydration(activeDate)
    } catch {
      // noop
    } finally {
      setHydrationBusy(false)
    }
  }

  // --- Totales del día: solo las comidas del día local actual ---
  const dayEntries = useMemo(() => filterEntriesByDay(diaryEntries, activeDate), [diaryEntries, activeDate])
  const totals = useMemo<MacroTotals>(() => computeTotals(dayEntries), [dayEntries])

  const calPct = goals.calories > 0 ? Math.min(100, (totals.calories / goals.calories) * 100) : 0
  const calStatus = macroStatus(totals.calories, goals.calories)
  const protStatus = macroStatus(totals.protein, goals.protein)
  const carbStatus = macroStatus(totals.carbs, goals.carbs)
  const fatStatus = macroStatus(totals.fat, goals.fat)
  const remainingCalories = Math.max(0, goals.calories - totals.calories)

  const toRecords = (ingredients: DishSavePayload['ingredients']): DiaryIngredientRecord[] =>
    ingredients.map(i => ({
      foodId: i.foodId,
      label: i.label,
      grams: i.grams,
      calories: i.macros.calories,
      proteins: i.macros.proteins,
      carbs: i.macros.carbs,
      fats: i.macros.fats,
    }))

  const saveDish = async (payload: DishSavePayload) => {
    setSaving(true)
    try {
      if (editing) {
        const prev = dayEntries.find(e => e.id === editing.id)
        if (prev) {
          const next: DiaryEntry = {
            ...prev,
            name: payload.name,
            mealType: payload.mealLabel,
            servingLabel: payload.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · '),
            amount: payload.ingredients.reduce((a, i) => a + i.grams, 0),
            ingredients: toRecords(payload.ingredients),
            macros: { ...payload.totals },
          }
          setDiaryEntries(list => list.map(e => (e.id === next.id ? next : e)))
          await updateDiaryEntry(next)
        }
        setEditing(null)
      } else {
        const entry: DiaryEntry = {
          id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: activeDate,
          name: payload.name,
          mealType: payload.mealLabel,
          servingLabel: payload.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · '),
          amount: payload.ingredients.reduce((a, i) => a + i.grams, 0),
          unit: 'g',
          macros: { ...payload.totals },
          time: nowLocalTime(),
          ingredients: toRecords(payload.ingredients),
          addedAt: new Date().toISOString(),
        }
        setDiaryEntries(list => [...list, entry])
        await addDiaryEntry(entry)
      }
      setDraft(null)
      setEditing(null)
      setComposerVersion(v => v + 1)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (entry: DiaryEntry) => {
    const d = dishFromEntry(entry)
    if (!d) {
      setComposerNotice('Esta comida se guardó sin desglose de ingredientes. Buscala por nombre para editarla.')
      return
    }
    setEditing({ id: entry.id, draft: d, mealLabel: entry.mealType || 'Comida' })
    setDraft(d)
  }

  const removeEntry = (id: string) => {
    setDiaryEntries(prev => prev.filter(e => e.id !== id))
    if (editing?.id === id) { setEditing(null); setDraft(null) }
    removeDiaryEntry(id)
  }

  const recordDailyAdherence = async (score: number) => {
    if (!perfil?.activeNutritionMethod) { return }
    const record = await recordAdherence({
      methodId: perfil.activeNutritionMethod as NutritionMethodId, score,
      mealsLogged: dayEntries.length, mealsExpected: 4,
      calorieAdherence: calPct,
      proteinAdherence: goals.protein > 0 ? Math.min(100, (totals.protein / goals.protein) * 100) : 0,
    })
    setAdherenceRecord(record)
  }


  const activeMethod = perfil?.activeNutritionMethod
    ? getNutritionMethod(perfil.activeNutritionMethod as NutritionMethodId) : null
  const weightData = pesoEvo.map(m => ({ date: m.localDate.slice(5), weight: m.weightKg })).filter(d => d.weight)
  const imcResult = perfil?.weightKg && perfil?.heightCm ? calcIMC(perfil.weightKg, perfil.heightCm) : null
  const tmbVal = perfil?.weightKg && perfil?.heightCm ? calcTMB(perfil.weightKg, perfil.heightCm, perfil.age, perfil.sex) : null
  const tdeeVal = tmbVal ? calcTDEE(tmbVal, perfil?.activityLevel || 'moderado', perfil?.schedule?.availableDays?.length || 3) : null
  const suggestions = buildNutritionSuggestions({
    goals: goalsPersonalized ? goals : null,
    dayTotals: { calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fat: totals.fat },
    mealsLogged: dayEntries.length,
    trainingTodayName: todayTraining?.name ?? null,
    todayVolumeKg: todayVolume,
    lastRecoveryScore: suggRecovery,
    hydrationMl: suggHydration,
    hydrationGoalMl: perfil?.hydrationGoalMl ?? null,
    allergies: perfil?.nutritionPrefs?.allergies ?? [],
    dislikedFoods: perfil?.nutritionPrefs?.dislikedFoods ?? [],
    methodName: activeMethod?.nameEs ?? null,
  })

  const dateText = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  if (status === 'loading') {
    return (
      <div className="w-full max-w-[1260px] mx-auto px-8 py-6 space-y-6" aria-busy="true">
        <AltheaLoading lines={4} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-[1260px] mx-auto px-8 py-6">
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <span className="material-symbols-outlined text-[40px] text-error">error_outline</span>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">No se pudieron cargar tus datos</h2>
          <p className="font-body-sm text-sm text-on-surface-variant max-w-sm">{loadError}</p>
          <AltheaButton variant="secondary" size="lg" className="min-h-[48px]" icon="refresh" onClick={() => loadData(activeDate)}>Reintentar</AltheaButton>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[1260px] mx-auto px-8 py-6 space-y-6">
      {safetyAlerts.length > 0 && (
        <div className="space-y-2">
          {safetyAlerts.map(alert => (
            <div key={alert.id} className={`rounded border p-3 ${
              alert.severity === 'critical' ? 'bg-error/10 border-error/40' : 'bg-secondary/10 border-secondary/40'
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className={alert.severity === 'critical' ? 'text-error' : 'text-secondary'} />
                <div className="flex-1">
                  <div className="font-body-md text-sm text-on-surface font-medium">{alert.message}</div>
                  {alert.professionalReferral && (
                    <div className="font-label-caps text-[10px] text-on-surface-variant mt-0.5">Derivar a: {alert.professionalReferral}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px] text-primary">restaurant</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Nutrición</h1>
            <p className="font-body-sm text-xs text-on-surface-variant capitalize">{dateText} · ¿qué vas a comer y cuánto representa?</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {todayTraining && <AltheaBadge variant="primary" dot>Día de entreno · {todayTraining.name}</AltheaBadge>}
          {perfil?.activeNutritionMethod && (
            <AltheaBadge variant="secondary" icon="auto_awesome">{activeMethod?.nameEs || perfil.activeNutritionMethod}</AltheaBadge>
          )}
        </div>
      </div>

      {/* 2 — TABLA: objetivo diario vs consumo diario */}
      <AltheaCard level={2} className="overflow-hidden">
        <div className="overflow-x-auto" role="region" aria-label="Resumen de objetivo y consumo diario" tabIndex={0}>
          <table className="althea-table" data-testid="summary-table">
            <thead>
              <tr>
                <th scope="col" className="text-left text-aux"> </th>
                <th scope="col" className="text-right text-aux">CALORÍAS</th>
                <th scope="col" className="text-right text-aux">GRASAS</th>
                <th scope="col" className="text-right text-aux">CARBOHIDRATOS</th>
                <th scope="col" className="text-right text-aux">PROTEÍNAS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left text-aux whitespace-nowrap">OBJETIVO DIARIO</th>
                <td className="text-right font-mono font-semibold">
                  <span data-testid="goal-calories">{goals.calories.toLocaleString('es-AR')} kcal</span>
                </td>
                <td className="text-right font-mono">
                  <span data-testid="goal-fat">{goals.fat} g</span>
                </td>
                <td className="text-right font-mono">
                  <span data-testid="goal-carbs">{goals.carbs} g</span>
                </td>
                <td className="text-right font-mono">
                  <span data-testid="goal-protein">{goals.protein} g</span>
                </td>
              </tr>
              <tr className="bg-surface-container/40">
                <th scope="row" className="text-left text-aux whitespace-nowrap">CONSUMO DIARIO</th>
                <td className="text-right font-mono font-bold">
                  <span data-testid="consumed-calories">
                    {Math.round(totals.calories).toLocaleString('es-AR')} kcal
                  </span>
                  {calStatus !== 'normal' && (
                    <span className={`block font-label-caps text-[9px] ${calStatus === 'superado' ? 'text-error' : calStatus === 'alcanzado' ? 'text-primary' : 'text-secondary'}`}>
                      {calStatus === 'superado' ? 'excedida' : calStatus === 'alcanzado' ? 'meta alcanzada' : 'cerca'}
                    </span>
                  )}
                </td>
                <td className="text-right font-mono font-bold">
                  <span data-testid="consumed-fat">{Math.round(totals.fat)} g</span>
                  <MacroStatusChip status={fatStatus} />
                </td>
                <td className="text-right font-mono font-bold">
                  <span data-testid="consumed-carbs">{Math.round(totals.carbs)} g</span>
                  <MacroStatusChip status={carbStatus} />
                </td>
                <td className="text-right font-mono font-bold">
                  <span data-testid="consumed-protein">{Math.round(totals.protein)} g</span>
                  <MacroStatusChip status={protStatus} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="pt-3 mt-1 border-t border-outline-variant/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-label-caps text-[10px] uppercase text-secondary">
              Ingesta vs meta
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">{Math.round(calPct)}%</span>
          </div>
          <p className="font-body-sm text-sm text-on-surface mb-2">
            <span className="font-headline-sm font-bold font-mono">{Math.round(totals.calories).toLocaleString('es-AR')}</span>
            <span className="font-body-sm text-on-surface-variant"> / {goals.calories.toLocaleString('es-AR')} kcal</span>
            <span className="block font-body-sm text-xs text-on-surface-variant">
              {remainingCalories > 0 ? `Faltan ${remainingCalories.toLocaleString('es-AR')} kcal` : 'Meta diaria alcanzada'}
            </span>
          </p>
          <AltheaProgress value={totals.calories} max={goals.calories} size="md" color="primary" aria-label={`${Math.round(calPct)}% de la meta calórica`} />
        </div>
      </AltheaCard>

      {/* 3 — ENTRADA DE COMIDA */}
      <AltheaCard level={2} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-title-md text-on-surface font-semibold">
              {editing ? 'Editar comida' : 'Registrar una comida'}
            </h2>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Escribí el plato: Althea estima los ingredientes, las cantidades y los macros.
            </p>
          </div>
        </div>
        {composerNotice && (
          <p
            role="status"
            className="font-label-caps text-[10px] bg-secondary/10 border border-secondary/30 rounded p-2 text-sm text-on-surface"
          >
            {composerNotice}
          </p>
        )}
        <DishComposer
          key={`${editing?.id ?? 'new'}-${composerVersion}`}
          onSave={saveDish}
          onCancel={() => { setDraft(null); setEditing(null) }}
          initial={draft}
          initialMealLabel={editing?.mealLabel}
          isEditing={!!editing}
          saving={saving}
        />
      </AltheaCard>

      {/* 4 — COMIDAS DEL DÍA */}
      <AltheaSection
        title="Comidas del día"
        subtitle="Tus registros reales de hoy"
        icon="restaurant_menu"
        action={<span className="font-mono text-[10px] text-on-surface-variant">{dayEntries.length} · {Math.round(totals.calories).toLocaleString('es-AR')} kcal</span>}
      >
        {dayEntries.length === 0 ? (
          <AltheaEmpty
            icon="lunch_dining"
            title="Todavía no registraste comidas hoy"
            description="Escribí arriba qué vas a comer y revisá la estimación antes de agregarla."
          />
        ) : (
          <div className="space-y-2" data-testid="day-meals">
            {dayEntries.map(e => (
              <div key={e.id} className="althea-level-2 p-4" data-testid="meal-row">
                <div className="space-y-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body-md text-sm text-on-surface font-semibold truncate">{e.name}</span>
                      {e.mealType && (
                        <span className="font-label-caps text-[9px] uppercase text-primary border border-primary/30 rounded px-1.5 py-0.5">
                          {e.mealType}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-on-surface-variant">{diaryEntryTime(e)}</span>
                    </div>
                    <div className="font-mono text-xs text-on-surface-variant mt-1">
                      <span data-testid="meal-kcal">{Math.round(Number(e.macros?.calories || 0))} kcal</span>
                      {' · '}{Math.round(Number(e.macros?.proteins || 0))} g proteína
                      {' · '}{Math.round(Number(e.macros?.carbs || 0))} g carbohidratos
                      {' · '}{Math.round(Number(e.macros?.fats || 0))} g grasas
                    </div>
                    {e.ingredients && e.ingredients.length > 0 && (
                      <div className="font-body-sm text-[11px] text-on-surface-variant mt-1">
                        {e.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => startEdit(e)}
                      aria-label={`Editar ${e.name}`}
                      className="w-12 h-12 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-primary hover:border-primary flex items-center justify-center transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => removeEntry(e.id)}
                      aria-label={`Eliminar ${e.name}`}
                      className="w-12 h-12 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AltheaSection>

      {/* F — Dos columnas desktop (1 en mobile): MACRO RING a la izquierda,
          BOTELLA DE HIDRATACIÓN a la derecha. En mobile quedan apiladas. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start" data-testid="nutricion-top-grid">
        {/* Columna izquierda: plato de macros + contexto */}
        <AltheaCard level={2} className="flex flex-col items-center py-8" data-testid="macro-ring-card">
          <MacroPlate totals={totals} goals={goals} size={340} />
          <p className="font-body-sm text-[11px] text-on-surface-variant mt-3 text-center">
            {goalsPersonalized
              ? 'Cada segmento muestra tu progreso sobre tu objetivo real del día.'
              : 'Metas de referencia — completá peso y altura en Perfil para usar tus objetivos reales.'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full mt-4" data-testid="nutricion-context">
            {[
              { label: 'TDEE diario', value: tdeeVal?.toLocaleString('es-AR') || '—', sub: 'gasto estimado' },
              { label: 'TMB basal', value: tmbVal?.toLocaleString('es-AR') || '—', sub: 'Mifflin-St Jeor' },
              { label: 'IMC', value: imcResult?.bmi || '—', sub: imcResult?.bmiCat || 'sin datos' },
              { label: 'Peso actual', value: perfil?.weightKg !== undefined ? `${perfil.weightKg} kg` : '—', sub: perfil?.targetWeightKg !== undefined ? `objetivo ${perfil.targetWeightKg} kg` : 'sin objetivo' },
            ].map(k => (
              <div key={k.label} className="althea-level-3 px-3 py-2">
                <span className="font-label-caps text-[9px] uppercase text-on-surface-variant block">{k.label}</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{k.value}</span>
                <span className="text-[10px] text-on-surface-variant block truncate">{k.sub}</span>
              </div>
            ))}
          </div>
        </AltheaCard>
        {/* Columna derecha: botella de hidratación */}
        <section className="marble-panel p-4" aria-label="Hidratación del día">
          <div className="flex items-center gap-2 shrink-0 mb-2">
            <span className="material-symbols-outlined text-secondary text-[18px]">water_drop</span>
            <h2 className="font-label-caps text-[11px] uppercase text-on-surface font-semibold">Hidratación de hoy</h2>
          </div>
          <div className="flex justify-center">
            <HydrationBottle current={hydrationTotalMl} goal={hydrationGoalMl} width={120} />
          </div>
          <div className="mt-3">
            <HydrationQuickAdd
              bottles={bottleConfigs.filter(c => c.active).map(c => ({ id: c.id, name: c.name, capacityMl: c.capacityMl }))}
              onAddBottle={handleAddBottle}
              onAddMl={handleAddMl}
              disabled={hydrationBusy}
            />
          </div>
          {/* (G) Las botellas se configuran acá mismo: nombre, capacidad y activa */}
          <div className="mt-3">
            <BottleConfigEditor />
          </div>
        </section>
      </div>

      <AltheaSection title="Sugerencias del día" subtitle="Basadas solo en tus datos registrados" icon="lightbulb">
        {suggestions === null ? (
          <AltheaEmpty icon="info" title="Sin datos suficientes" description="Completá peso, altura y objetivos en Perfil para recibir recomendaciones personalizadas." />
        ) : suggestions.length === 0 ? (
          <p className="font-body-sm text-sm text-on-surface-variant">Vas bien: sin brechas importantes hoy. Mantené la constancia.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {suggestions.map((s, i) => (
              <div key={i} className="althea-level-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body-sm text-sm font-semibold text-on-surface">{s.title}</span>
                  <span className="text-[9px] font-mono text-outline uppercase">{s.origin === 'dato' ? 'dato' : 'cálculo'}</span>
                </div>
                <p className="text-[12px] text-on-surface-variant mt-1">{s.detail}</p>
              </div>
            ))}
          </div>
        )}
      </AltheaSection>

      {perfil?.activeNutritionMethod && (
        <AltheaCard level={2}>
          <div className="flex items-center gap-2 pb-2.5 border-b border-outline-variant/30 mb-3">
            <div className="w-8 h-8 rounded-full bg-secondary-container/50 border border-secondary/50 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[16px]">psychology_alt</span>
            </div>
            <div>
              <h4 className="text-title-md text-secondary font-semibold">Adherencia nutricional</h4>
              <span className="font-label-caps text-[10px] text-outline block">{activeMethod?.nameEs || 'Método activo'}</span>
            </div>
          </div>
          <div className="text-body-sm text-on-surface-variant leading-relaxed">
            {adherenceRecord ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-sm text-on-surface font-semibold">Puntaje: {adherenceRecord.score}/10</span>
                  <AltheaBadge variant={adherenceRecord.score >= 7 ? 'primary' : adherenceRecord.score >= 4 ? 'secondary' : 'danger'}>
                    {adherenceRecord.score >= 7 ? 'Bien' : adherenceRecord.score >= 4 ? 'Regular' : 'Bajo'}
                  </AltheaBadge>
                </div>
                <p className="text-[11px] text-on-surface-variant">{Math.round(adherenceRecord.calorieAdherence)}% calorías · {Math.round(adherenceRecord.proteinAdherence)}% proteína</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-on-surface-variant">¿Cómo te fue hoy con tu estrategia nutricional?</p>
                <div className="flex gap-2">
                  {[3, 5, 7, 9].map(score => (
                    <button key={score} onClick={() => recordDailyAdherence(score)} aria-label={`Puntaje de adherencia ${score} de 10`}
                      className={`flex-1 min-h-[44px] rounded border font-label-caps text-xs font-semibold uppercase tracking-wider transition-colors ${
                        score >= 7 ? 'bg-primary/10 border-primary/30 text-primary' :
                        score >= 5 ? 'bg-secondary/10 border-secondary/30 text-secondary' : 'bg-error/10 border-error/30 text-error'
                      }`}>
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AltheaCard>
      )}

      {/* Alimentos frecuentes reales (historial) */}
      {frequentFoods.length > 0 && (
        <AltheaSection title="Alimentos frecuentes" subtitle="Los que más registraste en los últimos 30 días" icon="history">
          <div className="grid gap-2 sm:grid-cols-2">
            {frequentFoods.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  const entry: DiaryEntry = {
                    ...f,
                    id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    date: activeDate,
                    time: nowLocalTime(),
                    addedAt: new Date().toISOString(),
                  }
                  setDiaryEntries(prev => [...prev, entry])
                  addDiaryEntry(entry)
                }}
                className="flex items-center gap-3 min-h-[52px] px-3 rounded-lg border border-outline-variant/40 bg-surface-container text-left hover:border-primary transition-colors"
              >
                <span className="material-symbols-outlined text-secondary text-[18px]">restaurant_menu</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-body-sm text-sm text-on-surface font-medium truncate">{f.name}</span>
                  <span className="block font-body-sm text-[10px] text-on-surface-variant">
                    {Math.round(Number(f.macros?.calories || 0))} kcal · P{Number(f.macros?.proteins || 0)}g C{Number(f.macros?.carbs || 0)}g G{Number(f.macros?.fats || 0)}g
                  </span>
                </span>
                <span className="flex items-center gap-1 font-label-caps text-[10px] uppercase text-primary shrink-0">
                  <span className="material-symbols-outlined text-[14px]">add</span> Agregar
                </span>
              </button>
            ))}
          </div>
        </AltheaSection>
      )}

    </div>
  )
}

function MacroStatusChip({ status }: { status: MacroStatus }) {
  if (status === 'normal') { return null }
  const label = status === 'superado' ? 'excedido' : status === 'alcanzado' ? 'alcanzado' : 'cerca'
  const tone = status === 'superado' ? 'text-error' : status === 'alcanzado' ? 'text-primary' : 'text-secondary'
  return (
    <span className={`block font-label-caps text-[9px] ${tone}`} data-testid={`macro-status-${status}`}>
      {label}
    </span>
  )
}
