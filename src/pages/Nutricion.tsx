import { useState, useEffect, useMemo, useCallback } from 'react'
import SemanticIcon from '../components/ui/SemanticIcon';
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
} from '@/services/storage/diaryStore'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import type { CycleConfig } from '@/utils/cycle'
import { calcIMC, calcTMB, calcTDEE } from '@/utils/nutrition'
import { macroStatus, computeTotals, filterEntriesByDay, getMacroGoals, type MacroGoals, type MacroStatus, type MacroTotals } from '@/services/nutrition/macroService'
import { loadNutritionPlan, macroGoalsFromPlan } from '@/services/nutrition/nutritionPlanStore'
import NutritionGoalsPanel from '@/components/nutrition/NutritionGoalsPanel'
import { getNutritionMethod } from '@/services/ai/nutritionMethodsDB'
import type { NutritionMethodId } from '@/services/ai/nutritionMethods'
import type { UserProfile, BodyMeasurement } from '@/types'
import { checkNutritionSafety, type NutritionSafetyAlert } from '@/services/ai/nutritionSafety'
import { buildMacroSuggestions, type MacroSuggestion } from '@/services/ai/nutritionEngine'
import { recordAdherence, getAdherenceTrend, type AdherenceRecord } from '@/services/ai/adherenceTracker'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaProgress, AltheaButton, AltheaSection, AltheaEmpty, AltheaLoading } from '@/components/althea'
  import { HydrationBottle, HydrationQuickAdd } from '@/components/nutrition/HydrationBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { MacroPlate } from '@/components/nutrition/MacroPlate'
import { getBottleDailySummary, getCalculatedHydrationGoal, getBottleConfigs, completeBottle, addHydrationMl, type BottleConfig } from '@/services/recovery/hydrationBottles'
import { loadCustomFoods } from '@/services/storage/customFoodStore'
import { todayKey, weekdayOfKey } from '@/utils/dates'
import { useIsMobile } from '@/hooks/useIsMobile'

type PageStatus = 'loading' | 'ready' | 'error'

/** Metas de referencia: solo se usan si el usuario no cargó peso y altura.
 *  No son datos del usuario, la pantalla lo aclara. */
const FALLBACK_GOALS: MacroGoals = { calories: 2200, protein: 150, carbs: 250, fat: 70 }

/** Carga directa: una entrada por macro y día, id determinístico para
 *  sobrescribirla al editar. No se lista como comida real. */
const DIRECT_MACRO_MEAL = 'Carga directa'
type DirectMacroKey = 'proteins' | 'carbs' | 'fats'
const DIRECT_MACRO_KEYS: DirectMacroKey[] = ['proteins', 'carbs', 'fats']
const directMacroId = (key: DirectMacroKey, date: string) => `macro-${key}-${date}`
const isDirectMacroEntry = (e: DiaryEntry) => e.mealType === DIRECT_MACRO_MEAL
const MACRO_KCAL_PER_GRAM: Record<DirectMacroKey, number> = { proteins: 4, carbs: 4, fats: 9 }

const DIRECT_MACRO_FIELDS: { key: DirectMacroKey; label: string; color: string }[] = [
  { key: 'proteins', label: 'Proteínas', color: 'var(--althea-protein)' },
  { key: 'carbs', label: 'Carbohidratos', color: 'var(--althea-primary)' },
  { key: 'fats', label: 'Grasas', color: 'var(--althea-fat)' },
]

export default function Nutricion() {
  const [activeDate, setActiveDate] = useState(todayKey())
  const [perfil, setPerfil] = useState<UserProfile | null>(null)
  const [, setPesoEvo] = useState<BodyMeasurement[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [safetyAlerts, setSafetyAlerts] = useState<NutritionSafetyAlert[]>([])
  const [adherenceRecord, setAdherenceRecord] = useState<AdherenceRecord | null>(null)
  const [goals, setGoals] = useState<MacroGoals>(FALLBACK_GOALS)
  const [goalsPersonalized, setGoalsPersonalized] = useState(false)
  const [todayTraining, setTodayTraining] = useState<{ name: string; exercises: string[] } | null>(null)
  const [status, setStatus] = useState<PageStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  // Hidratación: consumo real, objetivo y botellas configuradas
  const [hydrationTotalMl, setHydrationTotalMl] = useState(0)
  const [hydrationGoalMl, setHydrationGoalMl] = useState(0)
  const [bottleConfigs, setBottleConfigs] = useState<BottleConfig[]>([])
  const [hydrationBusy, setHydrationBusy] = useState(false)
  const [hydrationError, setHydrationError] = useState<string | null>(null)

  // Carga directa de macros (gramos): una entrada por macro y día.
  const [macroDraft, setMacroDraft] = useState<Record<DirectMacroKey, string>>({ proteins: '', carbs: '', fats: '' })
  const [macroNotice, setMacroNotice] = useState<string | null>(null)

  const isMobile = useIsMobile()

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
  }, [])

  const loadData = useCallback(async (date: string) => {
    setStatus('loading')
    setLoadError(null)
    try {
      await migrateDiaryFromLocalStorage()
      await migrateAdherenceFromLocalStorage()
      // Inyecta los alimentos personalizados del usuario en el intérprete para
      // que la búsqueda y el reconocimiento de texto los incluyan.
      await loadCustomFoods().catch(() => {})
      const p = await db.userProfile.get('me')
      setPerfil(p ?? null)
      const bodies = await db.bodyMeasurements.toArray().catch(() => [])
      setPesoEvo(bodies.sort((a, b) => a.localDate.localeCompare(b.localDate)).slice(-30))

      await loadDay(date)

      // Objetivos: el plan calculado manda; si no existe, motor previo sin inventar valores
      const planRecord = await loadNutritionPlan().catch(() => null)
      if (planRecord) {
        setGoalsPersonalized(true)
        setGoals(macroGoalsFromPlan(planRecord.current))
      } else {
        const personalized = Boolean(p?.weightKg && p?.heightCm)
        setGoalsPersonalized(personalized)
        setGoals(personalized ? await getMacroGoals() : FALLBACK_GOALS)
      }

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
    setHydrationError(null)
    try {
      await completeBottle(bottle.id, activeDate)
      await loadHydration(activeDate)
    } catch (e) {
      setHydrationError(e instanceof Error ? e.message : 'No se pudo registrar el agua')
    } finally {
      setHydrationBusy(false)
    }
  }

  const handleAddMl = async (ml: number) => {
    setHydrationBusy(true)
    setHydrationError(null)
    try {
      await addHydrationMl(ml, activeDate)
      await loadHydration(activeDate)
    } catch (e) {
      setHydrationError(e instanceof Error ? e.message : 'No se pudieron guardar los ml')
    } finally {
      setHydrationBusy(false)
    }
  }

  // --- Totales del día: solo las comidas del día local actual ---
  const dayEntries = useMemo(() => filterEntriesByDay(diaryEntries, activeDate), [diaryEntries, activeDate])
  // Los registros de carga directa suman a los totales, pero no son comidas.
  const mealEntries = useMemo(() => dayEntries.filter(e => !isDirectMacroEntry(e)), [dayEntries])
  const totals = useMemo<MacroTotals>(() => computeTotals(dayEntries), [dayEntries])

  const calPct = goals.calories > 0 ? Math.min(100, (totals.calories / goals.calories) * 100) : 0
  const calStatus = macroStatus(totals.calories, goals.calories)
  const protStatus = macroStatus(totals.protein, goals.protein)
  const carbStatus = macroStatus(totals.carbs, goals.carbs)
  const fatStatus = macroStatus(totals.fat, goals.fat)
  const remainingCalories = Math.max(0, goals.calories - totals.calories)

  // Refleja lo ya guardado del día en los inputs (sin pisar lo que se escribe:
  // dayEntries solo cambia al guardar o cambiar de día).
  useEffect(() => {
    const next: Record<DirectMacroKey, string> = { proteins: '', carbs: '', fats: '' }
    for (const key of DIRECT_MACRO_KEYS) {
      const e = dayEntries.find(x => x.id === directMacroId(key, activeDate))
      if (e) { next[key] = String(Math.round(Number(e.macros[key]) || 0)) }
    }
    setMacroDraft(next)
  }, [dayEntries, activeDate])

  const saveDirectMacro = async (key: DirectMacroKey) => {
    const raw = macroDraft[key].trim()
    const grams = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(grams) || grams < 0) {
      setMacroNotice('Ingresá gramos válidos (0 o más).')
      setMacroDraft(prev => ({ ...prev, [key]: '' }))
      return
    }
    setMacroNotice(null)
    const id = directMacroId(key, activeDate)
    const existing = dayEntries.find(e => e.id === id)
    if (grams === 0) {
      if (existing) { removeEntry(id) }
      return
    }
    const entry: DiaryEntry = {
      id,
      date: activeDate,
      name: `Carga directa · ${key === 'proteins' ? 'proteínas' : key === 'carbs' ? 'carbohidratos' : 'grasas'}`,
      mealType: DIRECT_MACRO_MEAL,
      servingLabel: `${grams} g`,
      amount: grams,
      unit: 'g',
      time: nowLocalTime(),
      macros: {
        calories: grams * MACRO_KCAL_PER_GRAM[key],
        proteins: key === 'proteins' ? grams : 0,
        carbs: key === 'carbs' ? grams : 0,
        fats: key === 'fats' ? grams : 0,
      },
      addedAt: new Date().toISOString(),
    }
    setDiaryEntries(list => [...list.filter(e => e.id !== id), entry])
    await (existing ? updateDiaryEntry(entry) : addDiaryEntry(entry))
  }

  const removeEntry = (id: string) => {
    setDiaryEntries(prev => prev.filter(e => e.id !== id))
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
  const imcResult = perfil?.weightKg && perfil?.heightCm ? calcIMC(perfil.weightKg, perfil.heightCm) : null
  const tmbVal = perfil?.weightKg && perfil?.heightCm ? calcTMB(perfil.weightKg, perfil.heightCm, perfil.age, perfil.sex) : null
  const tdeeVal = tmbVal ? calcTDEE(tmbVal, perfil?.activityLevel || 'moderado', perfil?.schedule?.availableDays?.length || 3) : null
  const macroSuggestions = buildMacroSuggestions({
    goals: goalsPersonalized ? goals : null,
    totals: { protein: totals.protein, carbs: totals.carbs, fat: totals.fat },
    allergies: perfil?.nutritionPrefs?.allergies ?? [],
    dislikedFoods: perfil?.nutritionPrefs?.dislikedFoods ?? [],
  })

  const dateText = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Compartido por móvil y escritorio (misma lógica, un solo markup).
  const directMacroCard = (
    <AltheaSection title="Carga directa de macros" subtitle="Gramos independientes de cada macro" icon="edit_note">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {DIRECT_MACRO_FIELDS.map(f => (
          <label key={f.key} className="rounded-lg border border-outline-variant/40 bg-surface-container p-2.5">
            <span className="font-label-caps text-[10px] uppercase tracking-wider block font-semibold" style={{ color: f.color }}>{f.label}</span>
            <span className="flex items-center gap-1.5 mt-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={macroDraft[f.key]}
                onChange={e => setMacroDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                onBlur={() => { void saveDirectMacro(f.key) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                placeholder="0"
                aria-label={`${f.label} en gramos`}
                className="w-full min-h-[44px] bg-surface-container-lowest border border-outline-variant rounded px-2 text-[15px] text-on-surface font-mono"
              />
              <span className="font-label-caps text-[10px] text-on-surface-variant">g</span>
            </span>
          </label>
        ))}
      </div>
      {macroNotice && <p role="alert" className="font-body-sm text-xs text-error mt-2">{macroNotice}</p>}
      <p className="font-body-sm text-[11px] text-on-surface-variant mt-2">Se guarda al salir del campo. 0 o vacío borra ese macro del día.</p>
    </AltheaSection>
  )

  const macroSuggestionList = macroSuggestions === null ? (
    <AltheaEmpty icon="info" title="Sin datos suficientes" description="Cargá peso, altura y objetivos en Perfil." />
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {macroSuggestions.map((s: MacroSuggestion) => (
        <div key={s.key} className="rounded-lg border border-outline-variant/40 bg-surface-container p-3" style={{ borderLeft: `3px solid ${s.color}` }} data-testid={`macro-suggestion-${s.key}`}>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="font-body-sm text-sm font-semibold text-on-surface">{s.title}</span>
          </div>
          <p className="text-[12px] text-on-surface-variant mt-1">{s.detail}</p>
        </div>
      ))}
    </div>
  )


  if (status === 'loading') {
    return (
      <div className="w-full max-w-[1260px] mx-auto px-4 md:px-8 py-4 md:py-6 space-y-6" aria-busy="true">
        <AltheaLoading lines={4} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-[1260px] mx-auto px-4 md:px-8 py-4 md:py-6">
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <SemanticIcon name="error_outline" size={40} className="text-[40px] text-error" />
          <h2 className="font-headline-lg text-headline-lg text-on-surface">No se pudieron cargar tus datos</h2>
          <p className="font-body-sm text-sm text-on-surface-variant max-w-sm">{loadError}</p>
          <AltheaButton variant="secondary" size="lg" className="min-h-[48px]" icon="refresh" onClick={() => loadData(activeDate)}>Reintentar</AltheaButton>
        </div>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="space-y-2">
        {safetyAlerts.length > 0 && (
          <div className="space-y-2">
            {safetyAlerts.map(alert => (
              <div key={alert.id} className={`rounded-lg border p-2.5 ${
                alert.severity === 'critical' ? 'bg-error/10 border-error/40' : 'bg-secondary/10 border-secondary/40'
              }`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className={alert.severity === 'critical' ? 'text-error' : 'text-secondary'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-on-surface font-medium">{alert.message}</div>
                    {alert.professionalReferral && (
                      <div className="font-label-caps text-[10px] text-on-surface-variant mt-0.5">Derivar a: {alert.professionalReferral}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cabecera compacta */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
            <SemanticIcon name="restaurant" size={20} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="font-headline-lg text-xl font-semibold text-on-surface tracking-tight">Nutrición</h1>
            <p className="font-body-sm text-[11px] text-on-surface-variant truncate">{dateText}</p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            {todayTraining && <AltheaBadge variant="primary" dot>{todayTraining.name}</AltheaBadge>}
            {perfil?.activeNutritionMethod && (
              <AltheaBadge variant="secondary" icon="auto_awesome">{activeMethod?.nameEs || perfil.activeNutritionMethod}</AltheaBadge>
            )}
          </div>
        </div>

        {/* Objetivo nutricional calculado (cuestionario + historial) */}
        <NutritionGoalsPanel profile={perfil} date={activeDate} onSaved={() => { loadData(activeDate).catch(() => {}) }} />

        {/* Hero calórico del día */}
        <section className="domain-nutrition rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Consumido hoy</p>
              <p className="font-metric-mobile text-3xl font-bold text-on-surface leading-none">
                {Math.round(totals.calories).toLocaleString('es-AR')}
                <span className="text-sm text-on-surface-variant font-normal"> / {goals.calories.toLocaleString('es-AR')} kcal</span>
              </p>
            </div>
            <span className="text-[11px] font-mono text-on-surface-variant">{Math.round(calPct)}%</span>
          </div>
          <AltheaProgress value={totals.calories} max={goals.calories} size="md" color="primary" aria-label={`${Math.round(calPct)}% de la meta calórica`} />
          <p className="text-[11px] text-on-surface-variant">
            {remainingCalories > 0 ? `Faltan ${remainingCalories.toLocaleString('es-AR')} kcal` : 'Meta diaria alcanzada'}
            {!goalsPersonalized && ' · metas de referencia'}
          </p>
        <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Proteínas', value: totals.protein, goal: goals.protein, status: protStatus, tone: 'text-primary' },
              { label: 'Carbos', value: totals.carbs, goal: goals.carbs, status: carbStatus, tone: 'text-tertiary' },
              { label: 'Grasas', value: totals.fat, goal: goals.fat, status: fatStatus, tone: 'text-secondary' },
            ].map(m => (
              <div key={m.label} className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-center shadow-al-sm">
                <p className="font-label-caps text-[9px] uppercase tracking-wide text-on-surface-variant font-bold">{m.label}</p>
                <p className={`font-headline-lg text-[20px] font-bold ${m.tone}`}>
                  {Math.round(m.value)}<span className="text-[12px] text-on-surface-variant font-normal">/{m.goal}g</span>
                </p>
                <MacroStatusChip status={m.status} />
              </div>
            ))}
          </div>
        </section>

        {/* Hidratación */}
        <section className="domain-hydration rounded-2xl border border-outline-variant/40 bg-surface-container p-5 sm:p-6 shadow-al-sm" aria-label="Hidratación del día">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/40 flex items-center justify-center shrink-0">
              <SemanticIcon name="water_drop" size={24} className="text-accent" />
            </div>
            <h2 className="font-label-caps text-[11px] uppercase text-on-surface font-semibold">Hidratación de hoy</h2>
          </div>
          <div className="flex justify-center">
            <HydrationBottle current={hydrationTotalMl} goal={hydrationGoalMl} width={140} />
          </div>
          <div className="mt-3">
            <HydrationQuickAdd
              bottles={bottleConfigs.filter(c => c.active).map(c => ({ id: c.id, name: c.name, capacityMl: c.capacityMl }))}
              onAddBottle={handleAddBottle}
              onAddMl={handleAddMl}
              disabled={hydrationBusy}
            />
            {hydrationError && <p role="alert" className="font-body-sm text-xs text-error mt-1">{hydrationError}</p>}
          </div>
          <div className="mt-3">
            <BottleConfigEditor />
          </div>
        </section>

        {directMacroCard}

        {/* Comidas del día */}
        <AltheaSection
          title="Comidas del día"
          subtitle="Registros de hoy"
          icon="restaurant_menu"
          action={<span className="font-mono text-[10px] text-on-surface-variant">{mealEntries.length} · {Math.round(totals.calories).toLocaleString('es-AR')} kcal</span>}
        >
          {mealEntries.length === 0 ? (
            <AltheaEmpty
              icon="lunch_dining"
              title="Sin comidas registradas"
              description="Cargá los macros del día arriba."
            />
          ) : (
            <div className="space-y-1.5" data-testid="day-meals">
              {mealEntries.map(e => (
                <div key={e.id} className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-2" data-testid="meal-row">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-on-surface font-semibold truncate">{e.name}</span>
                        {e.mealType && (
                          <span className="font-label-caps text-[9px] uppercase text-primary border border-primary/30 rounded px-1.5 py-0.5">{e.mealType}</span>
                        )}
                        <span className="font-mono text-[10px] text-on-surface-variant">{diaryEntryTime(e)}</span>
                      </div>
                      <div className="flex items-baseline gap-x-2 font-mono text-[11px] text-on-surface-variant mt-0.5 min-w-0">
                        <span className="shrink-0">
                          <span data-testid="meal-kcal">{Math.round(Number(e.macros?.calories || 0))} kcal</span>
                          {' · '}{Math.round(Number(e.macros?.proteins || 0))}P
                          {' · '}{Math.round(Number(e.macros?.carbs || 0))}C
                          {' · '}{Math.round(Number(e.macros?.fats || 0))}G
                        </span>
                        {e.ingredients && e.ingredients.length > 0 && (
                          <span
                            className="truncate min-w-0 flex-1 text-on-surface-variant/70"
                            title={e.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · ')}
                          >
                            {e.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => removeEntry(e.id)}
                        aria-label={`Eliminar ${e.name}`}
                        className="w-11 h-11 rounded-lg border border-outline-variant/40 text-on-surface-variant flex items-center justify-center"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AltheaSection>

        {/* Plato de macros + contexto */}
        <AltheaCard level={2} className="domain-nutrition flex flex-col items-center py-5">
          <MacroPlate totals={totals} goals={goals} size={230} />
          <p className="font-body-sm text-[11px] text-on-surface-variant mt-3 text-center px-2">
            {goalsPersonalized
              ? 'Progreso sobre tu objetivo del día.'
              : 'Metas de referencia: cargá peso y altura en Perfil.'}
          </p>
          <div className="grid grid-cols-2 gap-2 w-full mt-3" data-testid="nutricion-context">
            {[
              { label: 'TDEE diario', value: tdeeVal?.toLocaleString('es-AR') || '—', sub: 'gasto estimado' },
              { label: 'TMB basal', value: tmbVal?.toLocaleString('es-AR') || '—', sub: 'Mifflin-St Jeor' },
              { label: 'IMC', value: imcResult?.bmi || '—', sub: imcResult?.bmiCat || 'sin datos' },
              { label: 'Peso actual', value: perfil?.weightKg !== undefined ? `${perfil.weightKg} kg` : '—', sub: perfil?.targetWeightKg !== undefined ? `objetivo ${perfil.targetWeightKg} kg` : 'sin objetivo' },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2">
                <span className="font-label-caps text-[9px] uppercase text-on-surface-variant block">{k.label}</span>
                <span className="font-headline-sm text-on-surface font-semibold">{k.value}</span>
                <span className="text-[10px] text-on-surface-variant block">{k.sub}</span>
              </div>
            ))}
          </div>
        </AltheaCard>

        <AltheaSection title="Sugerencias del día" subtitle="Una por macro, con tus datos" icon="lightbulb">
          {macroSuggestionList}
        </AltheaSection>

        {perfil?.activeNutritionMethod && (
          <AltheaCard level={2} className="domain-nutrition">
            <div className="flex items-center gap-2 pb-2.5 border-b border-outline-variant/30 mb-3">
              <div className="w-8 h-8 rounded-full bg-secondary-container/50 border border-secondary/50 flex items-center justify-center text-secondary">
                <SemanticIcon name="psychology_alt" size={16} />
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
                        className={`flex-1 min-h-[44px] rounded border font-label-caps text-xs font-semibold uppercase tracking-wider ${
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

        </div>
    )
  }

  return (
    <div className="w-full max-w-[1260px] mx-auto px-4 md:px-8 py-4 md:py-6 space-y-6">
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
          <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
            <SemanticIcon name="restaurant" size={24} className="text-[24px] text-accent" />
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Nutrición</h1>
            <p className="font-body-sm text-xs text-on-surface-variant">{dateText} · ¿Qué vas a comer y cuánto representa?</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {todayTraining && <AltheaBadge variant="primary" dot>Día de entreno · {todayTraining.name}</AltheaBadge>}
          {perfil?.activeNutritionMethod && (
            <AltheaBadge variant="secondary" icon="auto_awesome">{activeMethod?.nameEs || perfil.activeNutritionMethod}</AltheaBadge>
          )}
        </div>
      </div>

      {/* 2 — OBJETIVO NUTRICIONAL CALCULADO */}
      <NutritionGoalsPanel profile={perfil} date={activeDate} onSaved={() => { loadData(activeDate).catch(() => {}) }} />

      {/* 2 — TABLA: objetivo diario vs consumo diario */}
      <AltheaCard level={2} className="domain-nutrition overflow-hidden">
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

      {directMacroCard}

      {/* 4 — COMIDAS DEL DÍA */}
      <AltheaSection
        title="Comidas del día"
        subtitle="Tus registros reales de hoy"
        icon="restaurant_menu"
        action={<span className="font-mono text-[10px] text-on-surface-variant">{mealEntries.length} · {Math.round(totals.calories).toLocaleString('es-AR')} kcal</span>}
      >
        {mealEntries.length === 0 ? (
          <AltheaEmpty
            icon="lunch_dining"
            title="Todavía no registraste comidas hoy"
            description="Cargá los macros del día arriba."
          />
        ) : (
          <div className="space-y-1.5" data-testid="day-meals">
            {mealEntries.map(e => (
              <div key={e.id} className="althea-level-2 px-3 py-2" data-testid="meal-row">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-body-md text-sm text-on-surface font-semibold truncate">{e.name}</span>
                      {e.mealType && (
                        <span className="font-label-caps text-[9px] uppercase text-primary border border-primary/30 rounded px-1.5 py-0.5">
                          {e.mealType}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-on-surface-variant">{diaryEntryTime(e)}</span>
                    </div>
                    <div className="flex items-baseline gap-x-2 font-mono text-[11px] text-on-surface-variant mt-0.5 min-w-0">
                      <span className="shrink-0">
                        <span data-testid="meal-kcal">{Math.round(Number(e.macros?.calories || 0))} kcal</span>
                        {' · '}{Math.round(Number(e.macros?.proteins || 0))}P
                        {' · '}{Math.round(Number(e.macros?.carbs || 0))}C
                        {' · '}{Math.round(Number(e.macros?.fats || 0))}G
                      </span>
                      {e.ingredients && e.ingredients.length > 0 && (
                        <span
                          className="truncate min-w-0 flex-1 text-on-surface-variant/70"
                          title={e.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · ')}
                        >
                          {e.ingredients.map(i => `${i.label} ${i.grams}g`).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => removeEntry(e.id)}
                      aria-label={`Eliminar ${e.name}`}
                      className="w-11 h-11 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error flex items-center justify-center transition-colors"
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
        <AltheaCard level={2} className="domain-nutrition flex flex-col items-center py-8" data-testid="macro-ring-card">
          <MacroPlate totals={totals} goals={goals} size={340} />
          <p className="font-body-sm text-[11px] text-on-surface-variant mt-3 text-center">
            {goalsPersonalized
              ? 'Progreso sobre tu objetivo del día.'
              : 'Metas de referencia: cargá peso y altura en Perfil.'}
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
                <span className="text-[10px] text-on-surface-variant block">{k.sub}</span>
              </div>
            ))}
          </div>
        </AltheaCard>
        {/* Columna derecha: botella de hidratación */}
        <section className="marble-panel domain-hydration p-4" aria-label="Hidratación del día">
          <div className="flex items-center gap-2 shrink-0 mb-2">
            <SemanticIcon name="water_drop" size={18} className="text-secondary text-[18px]" />
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
            {hydrationError && <p role="alert" className="font-body-sm text-xs text-error mt-1">{hydrationError}</p>}
          </div>
          {/* (G) Las botellas se configuran acá mismo: nombre, capacidad y activa */}
          <div className="mt-3">
            <BottleConfigEditor />
          </div>
        </section>
      </div>

      <AltheaSection title="Sugerencias del día" subtitle="Una por macro, con tus datos" icon="lightbulb">
        {macroSuggestionList}
      </AltheaSection>

      {perfil?.activeNutritionMethod && (
        <AltheaCard level={2} className="domain-nutrition">
          <div className="flex items-center gap-2 pb-2.5 border-b border-outline-variant/30 mb-3">
            <div className="w-8 h-8 rounded-full bg-secondary-container/50 border border-secondary/50 flex items-center justify-center text-secondary">
              <SemanticIcon name="psychology_alt" size={16} className="text-[16px]" />
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
