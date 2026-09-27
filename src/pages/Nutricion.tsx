import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Codulia from '@/services/codulia'
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
import { Search, X, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaProgress, AltheaButton, AltheaSection, AltheaEmpty, AltheaLoading } from '@/components/althea'
  import { WaterBottle } from '@/components/recovery/WaterBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { MacroRing } from '@/components/nutrition/MacroRing'
import { DishComposer, type DishSavePayload } from '@/components/nutrition/DishComposer'
import { dishFromEntry, type DishDraft } from '@/services/nutrition/recipeInterpreter'
import { coduliaProvider } from '@/services/nutrition/foodProvider'
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

  // Flujo de comida
  const [draft, setDraft] = useState<DishDraft | null>(null)
  const [editing, setEditing] = useState<{ id: string; draft: DishDraft; mealLabel: string } | null>(null)
  const [saving, setSaving] = useState(false)
  /** cambia al guardar para que el compositor vuelva a su estado inicial */
  const [composerVersion, setComposerVersion] = useState(0)

  // Búsqueda Codulia (opcional)
  const [showFoodSearch, setShowFoodSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Codulia.CoduliaFoodSummary[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedFood, setSelectedFood] = useState<Codulia.CoduliaFoodDetail | null>(null)
  const [foodDetailLoading, setFoodDetailLoading] = useState(false)
  const [showAddPortion, setShowAddPortion] = useState(false)

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
      setSearchError('Esta comida se guardó sin desglose de ingredientes. Buscala por nombre para editarla.')
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

  // Codulia: opcional, solo para identificar productos puntuales
  const doSearch = async () => {
    if (!searchQuery.trim()) { return }
    setSearchError(null); setSearchLoading(true); setSearchResults([]); setSelectedFood(null)
    try {
      const r = await Codulia.searchFoods(searchQuery, { limit: 20 })
      setSearchResults(r)
      if (r.length === 0) { setSearchError('Sin resultados para "' + searchQuery + '"') }
    } catch (e: any) { setSearchError(e.message) }
    finally { setSearchLoading(false) }
  }

  const openFoodDetail = async (id: string) => {
    setSearchError(null); setFoodDetailLoading(true)
    try {
      const d = await Codulia.getFoodDetail(id)
      setSelectedFood(d); setShowAddPortion(true)
    } catch (e: any) { setSearchError(e.message) }
    finally { setFoodDetailLoading(false) }
  }

  const addFoodToDiary = (food: Codulia.CoduliaFoodDetail, servingIdx: number, amount?: number) => {
    const serving = food.servings[servingIdx]
    const factor = amount ? amount / 100 : (serving?.amount || 100) / 100
    const entry: DiaryEntry = {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: food.name,
      date: activeDate,
      mealType: 'Comida',
      servingLabel: serving?.label || 'Porción personalizada',
      amount: amount || serving?.amount || 100,
      unit: food.baseUnit,
      macros: {
        calories: Math.round(food.macros.calories * factor),
        proteins: Math.round(food.macros.proteins * factor * 10) / 10,
        carbs: Math.round(food.macros.carbs * factor * 10) / 10,
        fats: Math.round(food.macros.fats * factor * 10) / 10,
      },
      time: nowLocalTime(),
      addedAt: new Date().toISOString(),
    }
    setDiaryEntries(prev => [...prev, entry])
    addDiaryEntry(entry)
    setShowAddPortion(false); setSelectedFood(null); setShowFoodSearch(false); setSearchError(null)
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

  const coduliaConfigured = coduliaProvider.isConfigured()
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
          <AltheaButton variant="ghost" size="sm" icon="search" onClick={() => { setSearchError(null); setShowFoodSearch(true) }}>
            Buscar alimento
          </AltheaButton>
        </div>
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
        {/* Columna izquierda: anillo de macros + contexto */}
        <AltheaCard level={2} className="flex flex-col items-center py-8" data-testid="macro-ring-card">
          <MacroRing totals={totals} goals={goals} size={340} />
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
        {/* Columna derecha: botella grande de hidratación */}
        <section className="marble-panel p-4" aria-label="Hidratación del día">
          <div className="flex items-center gap-2 shrink-0 mb-2">
            <span className="material-symbols-outlined text-secondary text-[18px]">water_drop</span>
            <h2 className="font-label-caps text-[11px] uppercase text-on-surface font-semibold">Hidratación de hoy</h2>
          </div>
          <div className="flex justify-center">
            <WaterBottle date={activeDate} size="lg" allowQuickAdd />
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

      {/* Buscador de alimentos (Codulia, opcional) */}
      {showFoodSearch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50" role="dialog" aria-modal="true" aria-label="Buscar alimento"
          onClick={() => { setShowFoodSearch(false); setSelectedFood(null); setShowAddPortion(false) }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Buscar alimento</h3>
              <button onClick={() => { setShowFoodSearch(false); setSelectedFood(null); setShowAddPortion(false) }} aria-label="Cerrar búsqueda"
                className="w-12 h-12 shrink-0 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-on-surface flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            {!coduliaConfigured ? (
              <ApiKeySetup
                title="Clave de alimentos (Codulia)"
                hint="Opcional. La estimación de platos funciona sin ella. Se guarda solo en este dispositivo."
                onSave={(k) => { Codulia.setCoduliaKey(k); setSearchError(null) }}
              />
            ) : !showAddPortion ? (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-4 text-on-surface-variant" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { doSearch() } }}
                      placeholder='Ej: "yerba", "yogur", "pan"'
                      aria-label="Buscar alimento"
                      className="w-full min-h-[48px] bg-surface-container-high border border-outline-variant rounded-lg pl-9 pr-3 font-body-md text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-colors" />
                  </div>
                  <AltheaButton variant="primary" className="min-h-[48px]" onClick={doSearch} disabled={searchLoading}>
                    {searchLoading ? 'Buscando…' : 'Buscar'}
                  </AltheaButton>
                </div>
                {searchError && <div className="font-label-caps text-[10px] bg-secondary/10 border border-secondary/30 rounded p-2 text-sm text-on-surface">{searchError}</div>}
                <div className="space-y-2">
                  {searchResults.map(r => (
                    <button key={r.id} onClick={() => openFoodDetail(r.id)}
                      className="w-full min-h-[64px] rounded-lg p-3 flex gap-3 cursor-pointer bg-surface-container-low active:bg-surface-container-high hover:border-primary border border-transparent transition-colors text-left">
                      {r.photoUrl ? (
                        <img src={r.photoUrl} alt={r.name} className="w-12 h-12 rounded-lg object-cover border border-outline-variant bg-surface-container-high shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center font-label-md text-xs text-on-surface-variant shrink-0">
                          <span className="material-symbols-outlined text-primary text-[18px]">restaurant_menu</span>
                        </div>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block font-body-md text-sm text-on-surface font-medium truncate">{r.name}</span>
                        <span className="block font-body-md text-xs text-on-surface-variant truncate">{r.brand || r.source} · {r.baseUnit}</span>
                        <span className="block font-body-md text-xs text-primary">{r.caloriesPer100g ?? r.calories ?? '—'} kcal/100{r.baseUnit}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : selectedFood && (
              <FoodPortionSelector food={selectedFood} loading={foodDetailLoading} onAdd={(servingIdx, amount) => addFoodToDiary(selectedFood, servingIdx, amount)}
                onCancel={() => { setShowAddPortion(false); setSelectedFood(null) }} />
            )}
          </div>
        </div>
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

function ApiKeySetup({ title, hint, onSave }: { title: string; hint: string; onSave: (key: string) => void }) {
  const [key, setKey] = useState('')
  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-secondary">key</span>
        <span className="font-body-md text-sm font-semibold text-on-surface">{title}</span>
      </div>
      <p className="font-body-sm text-xs text-on-surface-variant">{hint}</p>
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && key.trim()) { onSave(key.trim()); setKey('') } }}
          placeholder="API key"
          aria-label={title}
          className="flex-1 min-w-0 min-h-[48px] bg-surface-container-high border border-outline-variant rounded px-3 font-mono text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary"
        />
        <AltheaButton variant="secondary" className="min-h-[48px]" disabled={!key.trim()} onClick={() => { onSave(key.trim()); setKey('') }}>Guardar</AltheaButton>
      </div>
    </div>
  )
}

function FoodPortionSelector({ food, loading, onAdd, onCancel }: {
  food: Codulia.CoduliaFoodDetail; loading?: boolean; onAdd: (servingIdx: number, amount?: number) => void; onCancel: () => void
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [customGrams, setCustomGrams] = useState('')
  const per100 = food.macros; const servings = food.servings
  const getNutrients = (idx: number, customAmt?: number) => {
    const amount = customAmt ?? (servings[idx]?.amount ?? 100)
    const f = amount / 100
    return {
      calories: Math.round(per100.calories * f),
      proteins: Math.round(per100.proteins * f * 10) / 10,
      carbs: Math.round(per100.carbs * f * 10) / 10,
      fats: Math.round(per100.fats * f * 10) / 10,
    }
  }
  const customAmt = customGrams ? Number(customGrams) : undefined
  const preview = getNutrients(selectedIdx, customAmt)
  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3">
        <div className="font-body-md text-sm text-on-surface font-medium">{food.name}</div>
        {food.brand && <div className="font-body-md text-xs text-on-surface-variant">{food.brand}</div>}
      </div>
      <div className="rounded-lg p-3">
        <div className="font-label-caps text-[10px] text-on-surface-variant">Por 100{food.baseUnit}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1 font-body-md text-xs text-on-surface">
          <span>{per100.calories} kcal</span><span>{per100.proteins}g P</span><span>{per100.carbs}g C</span><span>{per100.fats}g G</span>
        </div>
      </div>
      {servings.length > 0 && (
        <div className="space-y-1">
          <div className="font-label-caps text-[10px] text-on-surface-variant">Porciones</div>
          {servings.map((s, i) => {
            const n = getNutrients(i)
            return (
              <button key={i} onClick={() => { setSelectedIdx(i); setCustomGrams('') }}
                aria-pressed={selectedIdx === i && !customGrams}
                className={`w-full text-left min-h-[48px] p-3 rounded border font-body-md text-sm transition-colors ${selectedIdx === i && !customGrams ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container-high border-outline-variant text-on-surface'}`}>
                <div className="font-medium">{s.label} · {s.amount}{s.unit}</div>
                <div className="text-xs text-on-surface-variant">{n.calories} kcal · P{n.proteins}g C{n.carbs}g G{n.fats}g</div>
              </button>
            )
          })}
        </div>
      )}
      <div className="space-y-1">
        <div className="font-label-caps text-[10px] text-on-surface-variant">Cantidad personalizada ({food.baseUnit})</div>
        <input type="number" value={customGrams} onChange={e => setCustomGrams(e.target.value)}
          placeholder={`Ej: 150 ${food.baseUnit}`} aria-label="Cantidad personalizada"
          className="w-full min-h-[48px] bg-surface-container-high backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface focus:outline-none focus:border-secondary" />
      </div>
      <div className="rounded bg-primary/15 border border-primary/30 p-3">
        <div className="font-label-caps text-[10px] text-primary">Vista previa</div>
        <div className="font-headline-lg text-base font-semibold text-on-surface">{preview.calories} kcal</div>
        <div className="font-body-md text-xs text-on-surface-variant">P{preview.proteins}g · C{preview.carbs}g · G{preview.fats}g</div>
      </div>
      {loading && <div className="font-body-sm text-xs text-on-surface-variant">Cargando información del alimento…</div>}
      <div className="flex gap-2">
        <AltheaButton variant="secondary" fullWidth className="min-h-[48px]" onClick={onCancel}>Cancelar</AltheaButton>
        <AltheaButton variant="primary" fullWidth className="min-h-[48px]" disabled={loading} onClick={() => onAdd(selectedIdx, customAmt)}>Agregar</AltheaButton>
      </div>
    </div>
  )
}
