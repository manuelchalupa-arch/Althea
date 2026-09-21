import { useState, useEffect, useCallback } from 'react'
import * as Codulia from '@/services/codulia'
import { db } from '@/services/storage/db'
import { getDiaryEntries, addDiaryEntry, removeDiaryEntry, migrateDiaryFromLocalStorage, migrateAdherenceFromLocalStorage, type DiaryEntry as StoredDiaryEntry } from '@/services/storage/diaryStore'
import { calcIMC, calcTMB, calcTDEE, calorieGoal, proteinRange } from '@/utils/nutrition'
import { getNutritionMethod } from '@/services/ai/nutritionMethodsDB'
import type { NutritionMethodId } from '@/services/ai/nutritionMethods'
import type { UserProfile, BodyMeasurement } from '@/types'
import { checkNutritionSafety, type NutritionSafetyAlert } from '@/services/ai/nutritionSafety'
import { buildNutritionSuggestions } from '@/services/ai/nutritionEngine'
import { recordAdherence, calculateAutomaticAdherence, getAdherenceTrend, type AdherenceRecord } from '@/services/ai/adherenceTracker'
import { Search, Plus, Droplets, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Target, Utensils, X } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { AltheaCard, AltheaCardHeader, AltheaBadge, AltheaKPICard, AltheaProgress, AltheaButton, AltheaSection } from '@/components/althea'
import { HydrationWidget } from '@/components/recovery/HydrationWidget'

type MealType = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'snack'
const MEAL_LABELS: Record<MealType, string> = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena', snack: 'Snack' }
const MEAL_ICONS: Record<MealType, string> = { desayuno: 'wb_twilight', almuerzo: 'wb_sunny', merienda: 'sports_martial_arts', cena: 'bedtime', snack: 'restaurant_menu' }
const MEAL_TIME_LABELS: Record<MealType, string> = { desayuno: '07:30 AM', almuerzo: '01:30 PM', merienda: '05:00 PM', cena: '09:00 PM', snack: '—' }
const MEAL_SUBTITLES: Record<MealType, string> = {
  desayuno: 'Apertura anabólica matutina · Fibra lenta e ignición proteica',
  almuerzo: 'Recarga glucogénica mayor y aminoácidos de roca',
  merienda: 'Disponibilidad rápida de glucógeno y óxido nítrico',
  cena: 'Regeneración nocturna miofibrilar · Caseína & Omega-3',
  snack: 'Snack complementario',
}

interface DiaryEntry {
  id: string
  name: string
  mealType: string
  servingLabel: string
  amount: number
  unit: string
  macros: { calories: number; proteins: number; carbs: number; fats: number }
  addedAt: string
}

interface NutritionGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export default function Nutricion() {
  const [perfil, setPerfil] = useState<UserProfile | null>(null)
  const [pesoEvo, setPesoEvo] = useState<BodyMeasurement[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [activeMealType, setActiveMealType] = useState<MealType>('desayuno')
  const [showSearch, setShowSearch] = useState(false)
  const [showBarcode, setShowBarcode] = useState(false)
  const [safetyAlerts, setSafetyAlerts] = useState<NutritionSafetyAlert[]>([])
  const [adherenceRecord, setAdherenceRecord] = useState<AdherenceRecord | null>(null)
  const [goals, setGoals] = useState<NutritionGoals>({ calories: 2200, protein: 150, carbs: 250, fat: 70 })
  const [showFoodSearch, setShowFoodSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Codulia.CoduliaFoodSummary[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedFood, setSelectedFood] = useState<Codulia.CoduliaFoodDetail | null>(null)
  const [foodDetailLoading, setFoodDetailLoading] = useState(false)
  const [showAddPortion, setShowAddPortion] = useState(false)
  const [selectedServing, setSelectedServing] = useState<number>(0)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [todayTraining, setTodayTraining] = useState<{ name: string; exercises: string[] } | null>(null)
  const [suggHydration, setSuggHydration] = useState<number | null>(null)
  const [suggRecovery, setSuggRecovery] = useState<number | null>(null)
  const [todayVolume, setTodayVolume] = useState(0)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      await migrateDiaryFromLocalStorage()
      await migrateAdherenceFromLocalStorage()
      const p = await db.userProfile.get('me')
      setPerfil(p ?? null)
      const bodies = await db.bodyMeasurements.toArray().catch(() => [])
      const sorted = bodies.sort((a, b) => a.localDate.localeCompare(b.localDate)).slice(-30)
      setPesoEvo(sorted)
      const today = new Date().toISOString().slice(0, 10)
      const diaryData: DiaryEntry[] = await getDiaryEntries(today)
      setDiaryEntries(diaryData)
      // Señales para sugerencias (solo lectura; nunca se registran como consumo)
      const hydLogs = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(() => [])
      setSuggHydration(hydLogs.length ? hydLogs.reduce((a, b) => a + Number(b.amountMl || 0), 0) : null)
      const rec = await db.recoveryChecks.get(today).catch(() => null)
      setSuggRecovery(typeof rec?.score === 'number' ? rec.score : null)
      const daySessions = await db.trainingSessions.where('calendarDate').equals(today).toArray().catch(() => [])
      setTodayVolume(daySessions.reduce((a, s) => a + Number(s.totalVolume || 0), 0))
      if (p) {
        const w = p.weightKg, h = p.heightCm, age = p.age, sex = p.sex
        const act = p.activityLevel || 'moderado'
        if (w && h) {
          const tmb = calcTMB(w, h, age, sex)
          const tdee = calcTDEE(tmb, act, p.schedule?.availableDays?.length || 3)
          const calGoal = calorieGoal(tdee, p.goalPrimary) || tdee || 2200
          const prot = proteinRange(w, p.goalPrimary)
          const protGoal = prot?.low || Math.round(w * 1.8)
          const fatGoal = Math.round(calGoal * 0.25 / 9)
          const carbGoal = Math.round((calGoal - protGoal * 4 - fatGoal * 9) / 4)
          setGoals({ calories: calGoal, protein: protGoal, carbs: carbGoal, fat: fatGoal })
        }
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
        const todayRecord = trend.records.find(r => r.date === today)
        setAdherenceRecord(todayRecord || null)
      }
      const cycle = p?.cycle
      if (cycle?.trainingDays) {
        const dow = new Date().getDay()
        const todayName = cycle.trainingDays.find((d: any) => d.n === dow)
        if (todayName) {setTodayTraining({ name: todayName.name, exercises: [] })}
      }
    } catch { /* noop */ }
  }

  const today = new Date().toISOString().slice(0, 10)
  const mealEntries = (mealType: MealType) => diaryEntries.filter(e => e.mealType === mealType)
  const dayTotals = diaryEntries.reduce((acc, e) => ({
    calories: acc.calories + e.macros.calories,
    protein: acc.protein + e.macros.proteins,
    carbs: acc.carbs + e.macros.carbs,
    fat: acc.fat + e.macros.fats,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const calPct = Math.min(100, (dayTotals.calories / goals.calories) * 100)
  const protPct = Math.min(100, (dayTotals.protein / goals.protein) * 100)
  const carbPct = Math.min(100, (dayTotals.carbs / goals.carbs) * 100)
  const fatPct = Math.min(100, (dayTotals.fat / goals.fat) * 100)

  const addFoodToDiary = (food: Codulia.CoduliaFoodDetail, servingIdx: number, amount?: number) => {
    const serving = food.servings[servingIdx]
    const factor = amount ? amount / 100 : serving.amount / 100
    const entry: DiaryEntry = {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: food.name,
      mealType: activeMealType,
      servingLabel: serving?.label || `Porción personalizada`,
      amount: amount || serving?.amount || 100,
      unit: food.baseUnit,
      macros: {
        calories: Math.round(food.macros.calories * factor),
        proteins: Math.round(food.macros.proteins * factor * 10) / 10,
        carbs: Math.round(food.macros.carbs * factor * 10) / 10,
        fats: Math.round(food.macros.fats * factor * 10) / 10,
      },
      addedAt: new Date().toISOString(),
    }
    const updated = [...diaryEntries, entry]
    setDiaryEntries(updated)
    addDiaryEntry({ ...entry, date: today } as any)
    setShowAddPortion(false); setSelectedFood(null); setShowFoodSearch(false)
  }

  const removeEntry = (id: string) => {
    const updated = diaryEntries.filter(e => e.id !== id)
    setDiaryEntries(updated)
    removeDiaryEntry(id)
  }

  const recordDailyAdherence = async (score: number) => {
    if (!perfil?.activeNutritionMethod) {return}
    const record = await recordAdherence({
      methodId: perfil.activeNutritionMethod as NutritionMethodId, score,
      mealsLogged: diaryEntries.length, mealsExpected: 4,
      calorieAdherence: Math.min(100, (dayTotals.calories / goals.calories) * 100),
      proteinAdherence: Math.min(100, (dayTotals.protein / goals.protein) * 100),
    })
    setAdherenceRecord(record)
  }

  const doSearch = async () => {
    if (!searchQuery.trim()) {return}
    setSearchError(null); setSearchLoading(true); setSearchResults([]); setSelectedFood(null)
    try {
      const r = await Codulia.searchFoods(searchQuery, { limit: 20 })
      setSearchResults(r)
      if (r.length === 0) {setSearchError('Sin resultados para "' + searchQuery + '"')}
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

  const activeMethod = perfil?.activeNutritionMethod ? getNutritionMethod(perfil.activeNutritionMethod as NutritionMethodId) : null
  const weightData = pesoEvo.map(m => ({ date: m.localDate.slice(5), weight: m.weightKg })).filter(d => d.weight)
  const goalsPersonalized = Boolean(perfil?.weightKg && perfil?.heightCm)
  const imcResult = perfil?.weightKg && perfil?.heightCm ? calcIMC(perfil.weightKg, perfil.heightCm) : null
  const tmbVal = perfil?.weightKg && perfil?.heightCm ? calcTMB(perfil.weightKg, perfil.heightCm, perfil.age, perfil.sex) : null
  const tdeeVal = tmbVal ? calcTDEE(tmbVal, perfil?.activityLevel || 'moderado', perfil?.schedule?.availableDays?.length || 3) : null
  const remainingCalories = Math.max(0, goals.calories - dayTotals.calories)
  const suggestions = buildNutritionSuggestions({
    goals: goalsPersonalized ? goals : null,
    dayTotals,
    mealsLogged: diaryEntries.length,
    trainingTodayName: todayTraining?.name ?? null,
    todayVolumeKg: todayVolume,
    lastRecoveryScore: suggRecovery,
    hydrationMl: suggHydration,
    hydrationGoalMl: perfil?.hydrationGoalMl ?? null,
    allergies: perfil?.nutritionPrefs?.allergies ?? [],
    dislikedFoods: perfil?.nutritionPrefs?.dislikedFoods ?? [],
    methodName: activeMethod?.nameEs ?? null,
  })

  return (
    <div className="w-full max-w-[1260px] mx-auto px-8 py-6 space-y-6">
      {/* Safety Alerts */}
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

      {/* Page Title & Period Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2 text-secondary font-label-caps text-label-caps">
            <span className="material-symbols-outlined text-[14px]">mobile_share_stack</span>
            <span>CANON DIETÉTICO CLÁSICO</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mt-0.5">
            Nutrición Olímpica <span className="text-primary font-normal text-headline-md">· Régimen de Hipertrofia & Rendimiento</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant/40">
          <button className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-2 px-3">
            <span className="material-symbols-outlined text-secondary text-[16px]">calendar_today</span>
            <span className="font-label-md text-label-md text-on-surface font-medium">Hoy</span>
            {todayTraining && (
              <span className="px-1.5 py-0.2 bg-primary-container/40 text-on-primary-container text-[10px] font-mono rounded border border-primary/30">DÍA ENTRENO</span>
            )}
          </div>
          <button className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* 5-Metric KPI Plinths */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Ingesta vs Meta */}
        <div className="col-span-2 md:col-span-1 bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-caps text-label-caps uppercase text-secondary">Ingesta vs Meta</span>
            <span className="material-symbols-outlined text-[16px] text-secondary">local_fire_department</span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-md text-headline-md text-on-surface font-bold">{Math.round(dayTotals.calories).toLocaleString()}</span>
              <span className="text-on-surface-variant text-body-sm">/ {goals.calories.toLocaleString()} kcal</span>
            </div>
            <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1 font-body-sm">
              <span className="material-symbols-outlined text-[12px]">trending_up</span>
              {remainingCalories > 0 ? `Faltan ${remainingCalories} kcal` : 'Meta alcanzada'}
            </p>
            {!goalsPersonalized && (
              <p className="text-[10px] text-on-surface-variant mt-0.5">Metas de referencia — completá peso y altura en Perfil para cálculo personalizado</p>
            )}
          </div>
          <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden flex">
            <div className="bg-primary h-full" style={{ width: `${calPct}%` }} />
            <div className="bg-secondary/40 h-full" style={{ width: `${Math.max(0, 100 - calPct)}%` }} />
          </div>
        </div>
        {/* TDEE */}
        <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate flex flex-col justify-between">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-caps text-label-caps uppercase">TDEE Diario</span>
            <span className="material-symbols-outlined text-[16px] text-outline">bolt</span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-headline-md text-on-surface font-semibold">{tdeeVal?.toLocaleString() || '—'}</span>
              <span className="text-on-surface-variant text-body-sm">kcal</span>
            </div>
            <span className="text-[11px] text-on-surface-variant font-body-sm">Gasto total estimado</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-outline border-t border-outline-variant/20 pt-1.5">
            <span>Actividad: {perfil?.activityLevel || 'Moderada'}</span>
            <span className="font-mono text-secondary">× {perfil?.activityLevel === 'extremadamente_activo' ? '1.9' : perfil?.activityLevel === 'muy_activo' ? '1.725' : '1.55'}</span>
          </div>
        </div>
        {/* TMB */}
        <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate flex flex-col justify-between">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-caps text-label-caps uppercase">TMB Basal</span>
            <span className="material-symbols-outlined text-[16px] text-outline">monitor_heart</span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-headline-md text-on-surface font-semibold">{tmbVal?.toLocaleString() || '—'}</span>
              <span className="text-on-surface-variant text-body-sm">kcal</span>
            </div>
            <span className="text-[11px] text-on-surface-variant font-body-sm">Mifflin-St Jeor</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-outline border-t border-outline-variant/20 pt-1.5">
            <span>Peso: {perfil?.weightKg || '—'} kg</span>
            <span className="font-mono text-primary">Mifflin</span>
          </div>
        </div>
        {/* IMC */}
        <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate flex flex-col justify-between">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-caps text-label-caps uppercase">IMC Áureo</span>
            <span className="material-symbols-outlined text-[16px] text-secondary">balance</span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-headline-md text-secondary font-semibold">{imcResult?.bmi || '—'}</span>
              <span className="text-on-surface-variant text-body-sm">kg/m²</span>
            </div>
            <span className="text-[11px] text-primary font-body-sm">{imcResult?.bmiCat || '—'}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-outline border-t border-outline-variant/20 pt-1.5">
            <span>Altura: {perfil?.heightCm || '—'} cm</span>
            <span className="text-secondary font-medium">{imcResult?.bmi && Number(imcResult.bmi) < 25 ? 'Óptimo' : 'Revisar'}</span>
          </div>
        </div>
        {/* Hidratación — widget visual único (barra + litros). Fuente: Dexie `hydrationLogs`. */}
        <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate flex flex-col justify-between">
          <div className="flex items-center justify-between text-outline mb-2">
            <span className="font-label-caps text-label-caps uppercase text-primary">Néctar & Hidratación</span>
            <span className="material-symbols-outlined text-[16px] text-primary">water_drop</span>
          </div>
          <HydrationWidget />
        </div>
      </div>

      {/* Peso y objetivo — datos reales del perfil; sin objetivo → Sin datos */}
      <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 stone-plate flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[18px]">monitor_weight</span>
          <span className="font-label-caps text-label-caps uppercase text-secondary">Peso y objetivo</span>
        </div>
        <div className="font-body-sm text-on-surface">
          {perfil?.weightKg !== undefined ? (
            <>Actual: <span className="font-semibold font-mono">{perfil.weightKg} kg</span>{' '}
              {perfil?.targetWeightKg !== undefined ? (
                <>→ Objetivo: <span className="font-semibold font-mono">{perfil.targetWeightKg} kg</span>{' '}
                  <span className="text-on-surface-variant">({(perfil.targetWeightKg - perfil.weightKg) > 0 ? '+' : ''}{(perfil.targetWeightKg - perfil.weightKg).toFixed(1)} kg)</span></>
              ) : (
                <span className="text-on-surface-variant">· Sin peso objetivo (definilo en Perfil)</span>
              )}</>
          ) : (
            <span className="text-on-surface-variant">Sin datos — registrá tu peso en Perfil</span>
          )}
        </div>
        {weightData.length > 1 && (
          <div className="font-body-sm text-on-surface-variant sm:ml-auto">
            Últimas: {weightData.slice(-4).map(d => `${d.weight}kg`).join(' → ')}
          </div>
        )}
      </div>

      {/* Sugerencias del día — solo lectura, nunca se registran como consumo */}
      <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[18px]">lightbulb</span>
          <h4 className="font-title-md text-title-md text-on-surface font-semibold">Sugerencias del día</h4>
        </div>
        {suggestions === null ? (
          <p className="font-body-sm text-on-surface-variant">No hay datos suficientes para generar una recomendación personalizada.</p>
        ) : suggestions.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">Vas bien: sin brechas importantes hoy. Mantené la constancia.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {suggestions.map((s, i) => (
              <div key={i} className="bg-surface-container border border-outline-variant/40 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body-sm font-semibold text-on-surface">{s.title}</span>
                  <span className="text-[9px] font-mono text-outline uppercase">{s.origin === 'dato' ? 'dato' : 'cálculo'}</span>
                </div>
                <p className="text-[12px] text-on-surface-variant mt-1">{s.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column — Meals */}
        <div className="lg:col-span-8 space-y-6">
          {/* Meal Cards */}
          {(['desayuno', 'almuerzo', 'merienda', 'cena'] as MealType[]).map(mt => {
            const entries = mealEntries(mt)
            const mealCalories = entries.reduce((a, e) => a + e.macros.calories, 0)
            const mealP = entries.reduce((a, e) => a + e.macros.proteins, 0)
            const mealC = entries.reduce((a, e) => a + e.macros.carbs, 0)
            const mealG = entries.reduce((a, e) => a + e.macros.fats, 0)
            return (
              <div key={mt} className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded bg-surface-container-high border border-outline-variant/60 flex items-center justify-center ${mt === 'almuerzo' ? 'text-primary' : mt === 'merienda' ? 'text-secondary' : 'text-outline'}`}>
                      <span className="material-symbols-outlined text-[18px]">{MEAL_ICONS[mt]}</span>
                    </div>
                    <div>
                      <h3 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
                        {MEAL_LABELS[mt]}
                        <span className="px-2 py-0.5 text-[10px] font-label-caps rounded bg-surface-container-high text-secondary border border-secondary/30">{MEAL_TIME_LABELS[mt]}</span>
                      </h3>
                      <p className="text-[12px] text-on-surface-variant font-body-sm">{MEAL_SUBTITLES[mt]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{mealCalories || '0'}</span>
                      <span className="text-[11px] text-outline"> kcal</span>
                    </div>
                    <button onClick={() => { setActiveMealType(mt); setShowFoodSearch(true) }}
                      className="w-7 h-7 rounded bg-surface-container border border-outline-variant/40 flex items-center justify-center text-primary hover:text-on-primary-container hover:bg-primary-container/30 transition-colors" title="Añadir ítem">
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                </div>
                {/* Food Items */}
                <div className="mt-3 divide-y divide-outline-variant/20">
                  {entries.length === 0 ? (
                    <div className="py-4 text-center">
                      <p className="text-[12px] text-on-surface-variant font-body-sm">Sin registros en {MEAL_LABELS[mt].toLowerCase()}</p>
                      <button onClick={() => { setActiveMealType(mt); setShowFoodSearch(true) }}
                        className="mt-2 px-3 py-1 rounded bg-primary/15 border border-primary/30 text-primary font-label-caps text-[10px] font-semibold uppercase tracking-wider hover:bg-primary/25 transition-colors">
                        Agregar alimento
                      </button>
                    </div>
                  ) : entries.map(entry => (
                    <div key={entry.id} className="py-2.5 flex items-center justify-between text-body-sm hover:bg-surface-container/30 px-1 rounded transition-colors group">
                      <div className="flex items-center gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                        <div>
                          <span className="font-medium text-on-surface">{entry.name}</span>
                          <span className="text-[11px] text-outline block">{entry.amount}{entry.unit} · {entry.servingLabel}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[12px] font-mono">
                        <span className="text-on-surface-variant"><strong className="text-on-surface">{entry.macros.proteins}g</strong> P</span>
                        <span className="text-on-surface-variant"><strong className="text-on-surface">{entry.macros.carbs}g</strong> C</span>
                        <span className="text-on-surface-variant"><strong className="text-on-surface">{entry.macros.fats}g</strong> G</span>
                        <span className="text-secondary font-semibold w-14 text-right">{entry.macros.calories} kcal</span>
                        <button onClick={() => removeEntry(entry.id)} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all" aria-label="Quitar">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Meal Summary Bar */}
                {entries.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/30 flex items-center justify-between text-label-caps text-label-caps">
                    <span className="text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">verified</span>
                      Subtotal: {mealCalories} kcal
                    </span>
                    <div className="flex items-center gap-3 text-outline">
                      <span>P: {Math.round(mealP)}g</span>
                      <span>·</span>
                      <span>C: {Math.round(mealC)}g</span>
                      <span>·</span>
                      <span>G: {Math.round(mealG)}g</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Quick Food Vault */}
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">inventory_2</span>
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">Alimentos Frecuentes</h3>
              </div>
              <button onClick={() => setShowFoodSearch(true)} className="font-label-caps text-label-caps text-primary cursor-pointer hover:underline">Buscar más</button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { name: 'Pechuga de Pollo', detail: '100g · 31g P', color: 'bg-secondary' },
                { name: 'Avena en Hojuelas', detail: '50g · 34g C', color: 'bg-primary' },
                { name: 'Skyr / Griego 0%', detail: '150g · 18g P', color: 'bg-secondary' },
                { name: 'Aceite de Oliva Extra', detail: '15ml · 14g G', color: 'bg-tertiary' },
                { name: 'Miel Pura', detail: '20g · 17g C', color: 'bg-secondary' },
              ].map(item => (
                <button key={item.name}
                  className="px-3 py-1.5 rounded bg-surface-container border border-outline-variant/40 hover:border-primary text-body-sm text-on-surface flex items-center gap-2 transition-all">
                  <span className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span>{item.name}</span>
                  <span className="text-outline text-xs font-mono">{item.detail}</span>
                  <span className="material-symbols-outlined text-primary text-[14px]">add</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column — Donut, Oracle, Weekly, Micronutrients */}
        <div className="lg:col-span-4 space-y-6">
          {/* Donut Chart */}
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 border-b border-outline-variant/30 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">pie_chart</span>
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">Proporción de Macros</h3>
              </div>
              <span className="font-mono text-secondary text-xs font-bold">{Math.round(calPct)}% META</span>
            </div>
            <div className="relative w-52 h-52 my-2 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" fill="none" r="38" stroke="#24242a" strokeWidth="11" />
                <circle className="transition-all duration-700" cx="50" cy="50" fill="none" r="38" stroke="#556b2f"
                  strokeDasharray={`${(dayTotals.carbs * 4 / (dayTotals.calories || 1)) * 238.76} 238.76`} strokeWidth="11" />
                <circle className="transition-all duration-700" cx="50" cy="50" fill="none" r="38" stroke="#c5a059"
                  strokeDasharray={`${(dayTotals.protein * 4 / (dayTotals.calories || 1)) * 238.76} 238.76`}
                  strokeDashoffset={`-${(dayTotals.carbs * 4 / (dayTotals.calories || 1)) * 238.76}`} strokeWidth="11" />
                <circle className="transition-all duration-700" cx="50" cy="50" fill="none" r="38" stroke="#8f9284"
                  strokeDasharray={`${(dayTotals.fat * 9 / (dayTotals.calories || 1)) * 238.76} 238.76`}
                  strokeDashoffset={`-${((dayTotals.carbs * 4 + dayTotals.protein * 4) / (dayTotals.calories || 1)) * 238.76}`} strokeWidth="11" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
                <span className="font-label-caps text-[10px] text-outline tracking-wider">CONSUMIDAS</span>
                <span className="font-headline-md text-headline-md font-bold text-on-surface leading-tight">{Math.round(dayTotals.calories).toLocaleString()}</span>
                <span className="text-[11px] text-secondary font-mono font-semibold">de {goals.calories.toLocaleString()} kcal</span>
              </div>
            </div>
            <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-outline-variant/30 text-center">
              <div className="bg-surface-container/60 p-2 rounded border border-primary/20">
                <div className="flex items-center justify-center gap-1 text-[11px] text-primary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary-container" />
                  <span>Carbos</span>
                </div>
                <div className="font-mono text-sm font-bold text-on-surface mt-0.5">{Math.round(dayTotals.carbs)}g</div>
                <div className="text-[10px] text-outline">/ {goals.carbs}g</div>
              </div>
              <div className="bg-surface-container/60 p-2 rounded border border-secondary/20">
                <div className="flex items-center justify-center gap-1 text-[11px] text-secondary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  <span>Proteína</span>
                </div>
                <div className="font-mono text-sm font-bold text-on-surface mt-0.5">{Math.round(dayTotals.protein)}g</div>
                <div className="text-[10px] text-outline">/ {goals.protein}g</div>
              </div>
              <div className="bg-surface-container/60 p-2 rounded border border-outline/20">
                <div className="flex items-center justify-center gap-1 text-[11px] text-on-surface-variant font-semibold">
                  <span className="w-2 h-2 rounded-full bg-outline" />
                  <span>Grasas</span>
                </div>
                <div className="font-mono text-sm font-bold text-on-surface mt-0.5">{Math.round(dayTotals.fat)}g</div>
                <div className="text-[10px] text-outline">/ {goals.fat}g</div>
              </div>
            </div>
          </div>

          {/* Adherence */}
          {perfil?.activeNutritionMethod && (
            <div className="bg-surface-container-low border border-secondary/40 rounded-lg p-5 stone-plate relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 text-secondary/5 pointer-events-none">
                <span className="material-symbols-outlined text-[140px]">auto_awesome</span>
              </div>
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-outline-variant/30">
                <div className="w-7 h-7 rounded-full bg-secondary-container/50 border border-secondary/50 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[16px]">psychology_alt</span>
                </div>
                <div>
                  <h4 className="font-title-md text-title-md text-secondary font-semibold">Adherencia Nutricional</h4>
                  <span className="font-label-caps text-[10px] text-outline block">{activeMethod?.nameEs || 'Método activo'}</span>
                </div>
              </div>
              <div className="mt-3 text-body-sm text-on-surface-variant leading-relaxed">
                {adherenceRecord ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-sm text-sm text-on-surface font-semibold">Puntaje: {adherenceRecord.score}/10</span>
                      <span className={`px-2 py-0.5 text-[10px] font-label-caps rounded ${
                        adherenceRecord.score >= 7 ? 'bg-primary/15 text-primary' :
                        adherenceRecord.score >= 4 ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'
                      }`}>
                        {adherenceRecord.score >= 7 ? 'Bien' : adherenceRecord.score >= 4 ? 'Regular' : 'Bajo'}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">{adherenceRecord.calorieAdherence}% calorías · {adherenceRecord.proteinAdherence}% proteína</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[12px] text-on-surface-variant">¿Cómo te fue hoy con tu estrategia nutricional?</p>
                    <div className="flex gap-1">
                      {[3, 5, 7, 9].map(score => (
                        <button key={score} onClick={() => recordDailyAdherence(score)}
                          className={`flex-1 py-2 rounded border font-label-caps text-xs font-semibold uppercase tracking-wider ${
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
            </div>
          )}

          {/* Weekly Planner */}
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">view_week</span>
                <h4 className="font-title-md text-title-md text-on-surface font-semibold">Microciclo Nutricional</h4>
              </div>
              <span className="text-xs font-mono text-primary font-medium">Semana Actual</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center pt-1">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => {
                const isToday = i === (new Date().getDay() + 6) % 7
                const dayCalories = isToday ? Math.round(dayTotals.calories) : 0
                return (
                  <div key={day} className={`p-1 rounded border ${
                    isToday ? 'bg-surface-container-high border-secondary' :
                    i < (new Date().getDay() + 6) % 7 ? 'bg-surface-container border-outline-variant/30' : 'bg-surface-container/50 border-outline-variant/20'
                  }`}>
                    <span className={`text-[10px] block font-mono ${isToday ? 'text-secondary font-bold' : 'text-outline'}`}>{day}</span>
                    <div className="h-10 w-full bg-surface-container-high rounded-sm my-1 flex flex-col justify-end p-0.5">
                      <div className={`w-full rounded-xs ${isToday ? 'bg-secondary' : i < (new Date().getDay() + 6) % 7 ? 'bg-primary/40' : 'bg-outline opacity-20'}`}
                        style={{ height: isToday ? `${Math.min(100, calPct)}%` : i < (new Date().getDay() + 6) % 7 ? '40%' : '20%' }} />
                    </div>
                    <span className={`text-[9px] font-mono ${isToday ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>
                      {isToday ? `${(dayTotals.calories / 1000).toFixed(1)}k` : i < (new Date().getDay() + 6) % 7 ? '—' : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Micronutrients */}
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 stone-plate space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">science</span>
                <h4 className="font-title-md text-title-md text-on-surface font-semibold">Minerales & Néctar Celular</h4>
              </div>
              <span className="font-label-caps text-label-caps text-secondary">Electrolitos</span>
            </div>
            <div className="space-y-3">
              {[
                { name: 'Sodio', current: null as number|null, goal: 3200, unit: 'mg', color: 'bg-primary' },
                { name: 'Potasio', current: null as number|null, goal: 4000, unit: 'mg', color: 'bg-primary' },
                { name: 'Magnesio', current: null as number|null, goal: 450, unit: 'mg', color: 'bg-secondary' },
                { name: 'Creatina', current: null as number|null, goal: 5, unit: 'g', color: 'bg-secondary' },
              ].map(m => (
                <div key={m.name}>
                  <div className="flex justify-between text-xs mb-1 font-body-sm">
                    <span className="text-on-surface">{m.name}</span>
                    <span className="font-mono text-on-surface-variant">{m.current !== null ? `${m.current.toLocaleString()} / ${m.goal.toLocaleString()} ${m.unit}` : 'no registrado'}</span>
                  </div>
                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                    <div className={`${m.color} h-full`} style={{ width: m.current !== null ? `${Math.min(100, (m.current / m.goal) * 100)}%` : '0%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Food Search Modal */}
      {showFoodSearch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50" onClick={() => { setShowFoodSearch(false); setSelectedFood(null); setShowAddPortion(false) }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Buscar alimento</h3>
              <button onClick={() => { setShowFoodSearch(false); setSelectedFood(null); setShowAddPortion(false) }} className="text-on-surface-variant">
                <X size={20} />
              </button>
            </div>
            {!showAddPortion ? (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-3.5 text-on-surface-variant" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doSearch()}
                      placeholder='Ej: "yerba", "yogur", "pan"'
                      className="w-full bg-surface-container-high border border-outline-variant rounded-lg pl-9 pr-3 py-2 font-body-md text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-colors" />
                  </div>
                  <AltheaButton variant="primary" onClick={doSearch} disabled={searchLoading}>
                    {searchLoading ? '...' : 'Buscar'}
                  </AltheaButton>
                </div>
                {searchError && <div className="font-label-caps text-[10px] bg-secondary/10 border border-secondary/30 rounded p-2 text-sm text-on-surface">{searchError}</div>}
                <div className="space-y-2">
                  {searchResults.map(r => (
                    <div key={r.id} onClick={() => openFoodDetail(r.id)}
                      className="  rounded-lg p-3 flex gap-3 cursor-pointer active:bg-surface-container-high transition-colors">
                      {r.photoUrl ? (
                        <img src={r.photoUrl} alt={r.name} className="w-12 h-12 rounded-lg object-cover border border-outline-variant bg-surface-container-high" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center font-label-md text-xs text-on-surface-variant">🥗</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-body-md text-sm text-on-surface font-medium truncate">{r.name}</div>
                        <div className="font-body-md text-xs text-on-surface-variant truncate">{r.brand || r.source} · {r.baseUnit}</div>
                        <div className="font-body-md text-xs text-primary">{r.caloriesPer100g ?? r.calories ?? '—'} kcal/100{r.baseUnit}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : selectedFood && (
              <FoodPortionSelector food={selectedFood} onAdd={(servingIdx, amount) => addFoodToDiary(selectedFood, servingIdx, amount)}
                onCancel={() => { setShowAddPortion(false); setSelectedFood(null) }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FoodPortionSelector({ food, onAdd, onCancel }: {
  food: Codulia.CoduliaFoodDetail; onAdd: (servingIdx: number, amount?: number) => void; onCancel: () => void
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [customGrams, setCustomGrams] = useState('')
  const per100 = food.macros; const servings = food.servings
  const getNutrients = (idx: number, customAmt?: number) => {
    if (customAmt) { const f = customAmt / 100; return { calories: Math.round(per100.calories * f), proteins: Math.round(per100.proteins * f * 10) / 10, carbs: Math.round(per100.carbs * f * 10) / 10, fats: Math.round(per100.fats * f * 10) / 10 } }
    const s = servings[idx]; if (!s) {return { calories: 0, proteins: 0, carbs: 0, fats: 0 }}
    const f = s.amount / 100; return { calories: Math.round(per100.calories * f), proteins: Math.round(per100.proteins * f * 10) / 10, carbs: Math.round(per100.carbs * f * 10) / 10, fats: Math.round(per100.fats * f * 10) / 10 }
  }
  const customAmt = customGrams ? Number(customGrams) : undefined
  const preview = getNutrients(selectedIdx, customAmt)
  return (
    <div className="space-y-3">
      <div className="  rounded-lg p-3">
        <div className="font-body-md text-sm text-on-surface font-medium">{food.name}</div>
        {food.brand && <div className="font-body-md text-xs text-on-surface-variant">{food.brand}</div>}
      </div>
      <div className="  rounded-lg p-3">
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
                className={`w-full text-left p-2 rounded border font-body-md text-sm ${selectedIdx === i && !customGrams ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container-high border-outline-variant text-on-surface'}`}>
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
          placeholder={`Ej: 150 ${food.baseUnit}`}
          className="w-full bg-surface-container-high backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface focus:outline-none focus:border-secondary" />
      </div>
      <div className="rounded bg-primary/15 border border-primary/30 p-3">
        <div className="font-label-caps text-[10px] text-primary">Vista previa</div>
        <div className="font-headline-lg text-base font-semibold text-on-surface">{preview.calories} kcal</div>
        <div className="font-body-md text-xs text-on-surface-variant">P{preview.proteins}g · C{preview.carbs}g · G{preview.fats}g</div>
      </div>
      <div className="flex gap-2">
        <AltheaButton variant="secondary" fullWidth onClick={onCancel}>Cancelar</AltheaButton>
        <AltheaButton variant="primary" fullWidth onClick={() => onAdd(selectedIdx, customAmt)}>Agregar</AltheaButton>
      </div>
    </div>
  )
}
