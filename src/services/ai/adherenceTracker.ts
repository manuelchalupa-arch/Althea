// ADHERENCE TRACKER — Registro de adherencia, detección de problemas y adaptación
import type { NutritionMethodId, NutritionUserProfile } from './nutritionMethods'
import { getNutritionMethod } from './nutritionMethodsDB'

export interface AdherenceRecord {
  id: string
  methodId: NutritionMethodId
  date: string              // YYYY-MM-DD
  score: number             // 0-10, 10 = adherencia perfecta
  daysOnMethod: number      // días consecutivos con este método
  mealsLogged: number       // comidas registradas hoy
  mealsExpected: number     // comidas esperadas según método
  calorieAdherence: number  // % de adherencia calórica (0-100)
  proteinAdherence: number  // % de adherencia proteica (0-100)
  notes?: string            // notas del usuario
  createdAt: string
}

export interface AdherenceTrend {
  methodId: NutritionMethodId
  records: AdherenceRecord[]
  averageScore: number
  trend: 'improving' | 'stable' | 'declining'
  consecutiveDeclining: number
  daysOnMethod: number
  longestStreak: number
  currentStreak: number
  lastRecordDate: string | null
}

export interface AdaptationRecommendation {
  type: 'adjust' | 'switch' | 'simplify' | 'professional'
  reason: string
  currentMethod: NutritionMethodId
  suggestedMethod?: NutritionMethodId
  adjustments?: string[]
  severity: 'low' | 'medium' | 'high'
  confidence: number
}

// ─── Almacenamiento (localStorage como espejo, Dexie como fuente) ───
const STORAGE_KEY = 'nutrition:adherence'
const MAX_RECORDS = 90 // 3 meses

function getRecords(): AdherenceRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecords(records: AdherenceRecord[]): void {
  // Mantener solo los últimos MAX_RECORDS
  const trimmed = records.slice(-MAX_RECORDS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
}

// ─── Registrar adherencia diaria ───
export function recordAdherence(input: {
  methodId: NutritionMethodId
  score: number
  mealsLogged: number
  mealsExpected: number
  calorieAdherence: number
  proteinAdherence: number
  notes?: string
}): AdherenceRecord {
  const today = new Date().toISOString().slice(0, 10)
  const records = getRecords()

  // Calcular días consecutivos con este método
  const sameMethodRecords = records.filter(r => r.methodId === input.methodId)
  const daysOnMethod = calculateConsecutiveDays(sameMethodRecords, today)

  const record: AdherenceRecord = {
    id: `adh-${input.methodId}-${today}-${Date.now()}`,
    methodId: input.methodId,
    date: today,
    score: Math.max(0, Math.min(10, input.score)),
    daysOnMethod: daysOnMethod + 1,
    mealsLogged: input.mealsLogged,
    mealsExpected: input.mealsExpected,
    calorieAdherence: Math.max(0, Math.min(100, input.calorieAdherence)),
    proteinAdherence: Math.max(0, Math.min(100, input.proteinAdherence)),
    notes: input.notes,
    createdAt: new Date().toISOString(),
  }

  records.push(record)
  saveRecords(records)
  return record
}

// ─── Calcular días consecutivos ───
function calculateConsecutiveDays(records: AdherenceRecord[], upToDate: string): number {
  if (records.length === 0) return 0

  const dates = [...new Set(records.map(r => r.date))].sort().reverse()
  let streak = 0
  let expectedDate = upToDate

  for (const date of dates) {
    if (date === expectedDate) {
      streak++
      // Previous day
      const prev = new Date(expectedDate)
      prev.setDate(prev.getDate() - 1)
      expectedDate = prev.toISOString().slice(0, 10)
    } else if (date < expectedDate) {
      break
    }
  }

  return streak
}

// ─── Obtener tendencia de adherencia ───
export function getAdherenceTrend(methodId: NutritionMethodId): AdherenceTrend {
  const records = getRecords().filter(r => r.methodId === methodId)

  if (records.length === 0) {
    return {
      methodId,
      records: [],
      averageScore: 0,
      trend: 'stable',
      consecutiveDeclining: 0,
      daysOnMethod: 0,
      longestStreak: 0,
      currentStreak: 0,
      lastRecordDate: null,
    }
  }

  const scores = records.map(r => r.score)
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length

  // Trend: compare last 3 vs previous 3
  const recent = scores.slice(-3)
  const previous = scores.slice(-6, -3)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length)
  const previousAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg

  let trend: 'improving' | 'stable' | 'declining' = 'stable'
  if (recentAvg > previousAvg + 0.5) trend = 'improving'
  else if (recentAvg < previousAvg - 0.5) trend = 'declining'

  // Consecutive declining days
  let consecutiveDeclining = 0
  for (let i = scores.length - 1; i > 0; i--) {
    if (scores[i] < scores[i - 1]) consecutiveDeclining++
    else break
  }

  // Streaks
  const today = new Date().toISOString().slice(0, 10)
  const currentStreak = calculateConsecutiveDays(records, today)
  const longestStreak = calculateLongestStreak(records)

  return {
    methodId,
    records,
    averageScore,
    trend,
    consecutiveDeclining,
    daysOnMethod: currentStreak,
    longestStreak,
    currentStreak,
    lastRecordDate: records[records.length - 1]?.date || null,
  }
}

// ─── Calcular racha más larga ───
function calculateLongestStreak(records: AdherenceRecord[]): number {
  const dates = [...new Set(records.map(r => r.date))].sort()
  let longest = 0
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)

    if (diffDays === 1) {
      current++
    } else {
      longest = Math.max(longest, current)
      current = 1
    }
  }

  return Math.max(longest, current)
}

// ─── Detectar problemas y recomendar adaptación ───
export function detectAdherenceProblems(
  methodId: NutritionMethodId,
  profile: NutritionUserProfile,
): AdaptationRecommendation | null {
  const trend = getAdherenceTrend(methodId)

  // No hay datos suficientes
  if (trend.records.length < 3) return null

  const method = getNutritionMethod(methodId)

  // 1. Adherencia muy baja consistentemente (<5 promedio, 5+ días)
  if (trend.averageScore < 5 && trend.daysOnMethod >= 5) {
    return {
      type: 'switch',
      reason: `Adherencia promedio ${trend.averageScore.toFixed(1)}/10 durante ${trend.daysOnMethod} días. Este método no se adapta a tu estilo de vida.`,
      currentMethod: methodId,
      suggestedMethod: suggestAlternative(methodId, profile),
      severity: 'high',
      confidence: 0.8,
    }
  }

  // 2. Tendencia descendente sostenida (4+ días bajando)
  if (trend.consecutiveDeclining >= 4) {
    return {
      type: 'adjust',
      reason: `Adherencia bajando ${trend.consecutiveDeclining} días seguidos. Puede ser señal de fatiga dietética o restricción excesiva.`,
      currentMethod: methodId,
      adjustments: generateAdjustments(methodId, trend),
      severity: 'medium',
      confidence: 0.7,
    }
  }

  // 3. Racha muy corta vs método exigente
  if (method && method.characteristics.restrictions.length > 3 && trend.currentStreak < 3) {
    return {
      type: 'simplify',
      reason: `${method.nameEs} tiene ${method.characteristics.restrictions.length} restricciones pero solo lográs ${trend.currentStreak} días consecutivos. Simplificar puede mejorar adherencia.`,
      currentMethod: methodId,
      adjustments: ['Reducir restricciones temporales', 'Permitir flexibilidad 1 día/semana', 'Enfocar en 2-3 cambios principales'],
      severity: 'medium',
      confidence: 0.6,
    }
  }

  // 4. Calorías o proteína consistentemente bajas
  const recentRecords = trend.records.slice(-5)
  const avgCalAdherence = recentRecords.reduce((a, r) => a + r.calorieAdherence, 0) / recentRecords.length
  const avgProtAdherence = recentRecords.reduce((a, r) => a + r.proteinAdherence, 0) / recentRecords.length

  if (avgCalAdherence < 60 || avgProtAdherence < 60) {
    return {
      type: 'adjust',
      reason: `Adherencia calórica ${avgCalAdherence.toFixed(0)}% y proteica ${avgProtAdherence.toFixed(0)}% en los últimos días. Puede haber barras prácticas.`,
      currentMethod: methodId,
      adjustments: generateMacroAdjustments(methodId, avgCalAdherence, avgProtAdherence),
      severity: 'medium',
      confidence: 0.65,
    }
  }

  // 5. Sin registros recientes (posible abandono)
  const lastDate = trend.lastRecordDate
  if (lastDate) {
    const daysSinceLastRecord = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceLastRecord > 5) {
      return {
        type: 'simplify',
        reason: `No registrás adherencia desde hace ${daysSinceLastRecord} días. Puede ser señal de abandono del método.`,
        currentMethod: methodId,
        suggestedMethod: suggestAlternative(methodId, profile),
        severity: 'low',
        confidence: 0.5,
      }
    }
  }

  return null
}

// ─── Sugerir método alternativo ───
function suggestAlternative(
  currentMethod: NutritionMethodId,
  profile: NutritionUserProfile,
): NutritionMethodId {
  // Si el actual es restrictivo, sugerir algo más flexible
  const restrictiveMethods = ['keto', 'whole30', 'paleo']
  if (restrictiveMethods.includes(currentMethod)) {
    const goal = profile.trainingGoal || 'health'
    if (goal === 'fat_loss' || goal === 'recomposition') return 'mediterranean'
    if (goal === 'hypertrophy' || goal === 'muscle_gain') return 'flexitarian'
    return 'mediterranean'
  }

  // Si el actual es muy técnico, sugerir intuitive_eating
  const complexMethods = ['carb_cycling', 'around_training']
  if (complexMethods.includes(currentMethod)) {
    return 'intuitive_eating'
  }

  // Default: mediterranean (más sostenible)
  return 'mediterranean'
}

// ─── Generar ajustes para tendencia descendente ───
function generateAdjustments(methodId: NutritionMethodId, trend: AdherenceTrend): string[] {
  const adjustments: string[] = []
  const method = getNutritionMethod(methodId)

  if (method?.characteristics.restrictions.length) {
    adjustments.push(`Reducir restricciones: mantener solo las ${Math.min(2, method.characteristics.restrictions.length)} más importantes`)
  }

  if (method?.defaults.mealFrequency[1] && method.defaults.mealFrequency[1] > 4) {
    adjustments.push('Reducir a 4 comidas/día en vez de 5-6')
  }

  adjustments.push('Permitir 1 comida libre por semana')
  adjustments.push('Simplificar el tracking: solo registrar comidas principales')

  return adjustments
}

// ─── Generar ajustes para problemas macro ───
function generateMacroAdjustments(
  methodId: NutritionMethodId,
  calorieAdherence: number,
  proteinAdherence: number,
): string[] {
  const adjustments: string[] = []

  if (calorieAdherence < 60) {
    adjustments.push('Establecer recordatorios de comida')
    adjustments.push('Preparar comidas con anticipación (meal prep)')
    adjustments.push('Aumentar densidad calórica de las comidas')
  }

  if (proteinAdherence < 60) {
    adjustments.push('Agregar una shake proteica al día')
    adjustments.push('Incluir proteína en cada comida principal')
    adjustments.push('Simplificar: 2 fuentes de proteína principales')
  }

  return adjustments
}

// ─── Calcular adherencia automática desde registros de nutrición ───
export function calculateAutomaticAdherence(
  methodId: NutritionMethodId,
  mealsLoggedToday: number,
  totalCaloriesToday: number,
  totalProteinToday: number,
  targetCalories: number,
  targetProtein: number,
): number {
  const method = getNutritionMethod(methodId)
  if (!method) return 5

  const expectedMeals = Math.round((method.defaults.mealFrequency[0] + method.defaults.mealFrequency[1]) / 2)
  const mealScore = Math.min(1, mealsLoggedToday / Math.max(1, expectedMeals))

  const calorieScore = targetCalories > 0
    ? Math.min(1, totalCaloriesToday / targetCalories)
    : 0.5

  const proteinScore = targetProtein > 0
    ? Math.min(1, totalProteinToday / targetProtein)
    : 0.5

  // Weighted average: meals 30%, calories 35%, protein 35%
  const score = (mealScore * 0.3 + calorieScore * 0.35 + proteinScore * 0.35) * 10

  return Math.round(Math.max(0, Math.min(10, score)))
}

// ─── Obtener resumen de adherencia para el Coach ───
export function getAdherenceSummary(profile: NutritionUserProfile): {
  overallScore: number
  bestMethod: NutritionMethodId | null
  worstMethod: NutritionMethodId | null
  activeIssues: AdaptationRecommendation[]
  recommendations: string[]
} {
  const methodIds: NutritionMethodId[] = [
    'mediterranean', 'dash', 'vegan', 'paleo', 'flexitarian',
    'intermittent_fasting', 'carb_cycling', 'around_training',
    'high_protein', 'intuitive_eating', 'keto', 'whole30',
  ]

  const trends = methodIds.map(id => ({
    id,
    trend: getAdherenceTrend(id),
  })).filter(t => t.trend.records.length > 0)

  if (trends.length === 0) {
    return {
      overallScore: 0,
      bestMethod: null,
      worstMethod: null,
      activeIssues: [],
      recommendations: ['Empezá a registrar tu adherencia nutricional diaria para obtener insights.'],
    }
  }

  // Overall score
  const overallScore = trends.reduce((a, t) => a + t.trend.averageScore, 0) / trends.length

  // Best/worst
  const sorted = [...trends].sort((a, b) => b.trend.averageScore - a.trend.averageScore)
  const bestMethod = sorted[0]?.id || null
  const worstMethod = sorted[sorted.length - 1]?.id || null

  // Active issues
  const activeIssues: AdaptationRecommendation[] = []
  for (const t of trends) {
    const issue = detectAdherenceProblems(t.id, profile)
    if (issue) activeIssues.push(issue)
  }

  // Recommendations
  const recommendations: string[] = []
  if (overallScore < 5) {
    recommendations.push('Tu adherencia general es baja. Considerá simplificar tu estrategia nutricional.')
  }
  if (trends.some(t => t.trend.trend === 'declining')) {
    recommendations.push('Algunos métodos muestran tendencia descendente. Revisá si son sostenibles.')
  }
  if (activeIssues.length > 0) {
    recommendations.push(`${activeIssues.length} problema(s) activo(s) detectado(s). Revisá las recomendaciones.`)
  }

  return {
    overallScore,
    bestMethod,
    worstMethod,
    activeIssues,
    recommendations,
  }
}
