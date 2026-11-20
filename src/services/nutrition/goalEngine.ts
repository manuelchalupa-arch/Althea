/**
 * OBJETIVOS NUTRICIONALES — cálculo determinístico.
 *
 * La IA puede explicar el resultado, nunca calcularlo. Fuentes:
 *  - Mifflin et al. 1990 (PMID 2305711): TMB en adultos.
 *  - ISSN Protein & Exercise 2017 (PMID 28642676) y Nunes et al. 2022
 *    (PMID 35187864): proteína 1,4–2,0 g/kg/día (referencia 1,6).
 *  - Thomas/Erdman/Burke 2016 (PMID 26920240): grasas 20–35 % y demanda
 *    de carbohidratos según entrenamiento.
 *  - Revisión de wearables 2024 (PMID 39080098): las kcal de dispositivos
 *    son estimaciones, no mediciones exactas.
 *
 * Todo es orientativo: no es diagnóstico ni consulta profesional.
 */

export type NutritionGoal = 'gain' | 'lose' | 'maintain'
export type DailyActivity = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high'
export type TrainingIntensity = 'low' | 'medium' | 'high'

export interface PhysicalActivityInput {
  types: string[]
  daysPerWeek: number
  minutesPerSession: number
  intensity: TrainingIntensity
}

export interface NutritionRiskFlags {
  minor?: boolean
  pregnancy?: boolean
  eatingDisorder?: boolean
  illness?: boolean
  medication?: boolean
}

export interface NutritionInputs {
  age: number | null
  sex: 'M' | 'F' | 'X'
  weightKg: number | null
  heightCm: number | null
  bodyFatPct?: number | null
  goal: NutritionGoal
  dailyActivity: DailyActivity
  physicalActivity: PhysicalActivityInput
  riskFlags?: NutritionRiskFlags
}

export interface NutritionPlan {
  version: 1
  createdAt: string
  inputs: NutritionInputs
  bmr: { low: number; high: number; reference: number; formula: string }
  tdee: { low: number; high: number; reference: number; factor: number; level: string }
  target: { low: number; high: number; reference: number; adjustmentPct: number; goal: NutritionGoal }
  macros: {
    protein: number
    carbs: number
    fat: number
    proteinPerKg: number
    fatPct: number
    kcalSum: number
  }
  blocked?: { reasons: string[]; referral: string }
  notes: string[]
}

/** Ajustes por objetivo: centralizados y modificables. Moderados a propósito. */
export const GOAL_ADJUSTMENT: Record<NutritionGoal, { pct: number; label: string }> = {
  // Superávit conservador para ganar mayormente músculo.
  gain: { pct: 0.10, label: 'Superávit moderado (+10 %)' },
  // Déficit moderado: nunca por debajo del gasto en reposo.
  lose: { pct: -0.15, label: 'Déficit moderado (−15 %)' },
  maintain: { pct: 0, label: 'Mantenimiento (0 %)' },
}

export const PROTEIN_G_PER_KG = { gain: 1.7, lose: 1.8, maintain: 1.6 } as const
export const PROTEIN_RANGE = { min: 1.4, max: 2.0 } as const
export const FAT_PCT_DEFAULT = 0.25
export const FAT_PCT_RANGE = { min: 0.20, max: 0.35 } as const

/** Factores estándar de actividad (los mismos de utils/nutrition). */
const FACTORS = [1.2, 1.375, 1.55, 1.725, 1.9] as const
const LEVELS = ['Sedentario', 'Ligero', 'Moderado', 'Alto', 'Muy alto'] as const

const DAILY_BASE: Record<DailyActivity, number> = {
  sedentary: 0,
  light: 0,
  moderate: 1,
  high: 2,
  very_high: 3,
}

const r = (n: number, step = 1) => Math.round(n / step) * step
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export const GOAL_LABEL: Record<NutritionGoal, string> = {
  gain: 'Aumentar masa muscular',
  lose: 'Disminuir grasa corporal',
  maintain: 'Mantener peso y composición',
}

export const DAILY_ACTIVITY_LABEL: Record<DailyActivity, string> = {
  sedentary: 'Sedentaria',
  light: 'Ligera',
  moderate: 'Moderada',
  high: 'Alta',
  very_high: 'Trabajo físicamente exigente',
}

export function missingNutritionInputs(i: NutritionInputs): string[] {
  const missing: string[] = []
  if (!(Number(i.age) >= 15)) {missing.push('edad')}
  if (!(Number(i.weightKg) > 0)) {missing.push('peso')}
  if (!(Number(i.heightCm) > 0)) {missing.push('altura')}
  return missing
}

/** Mifflin-St Jeor. Con sexo X devuelve ambas variantes, sin elegir una. */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: 'M' | 'F' | 'X') {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  const male = base + 5
  const female = base - 161
  if (sex === 'M') {return { low: male, high: male, reference: male, formula: 'Mifflin-St Jeor (M)' }}
  if (sex === 'F') {return { low: female, high: female, reference: female, formula: 'Mifflin-St Jeor (F)' }}
  return {
    low: female,
    high: male,
    reference: (male + female) / 2,
    formula: 'Mifflin-St Jeor (intervalo M/F)',
  }
}

/** Cunningham (si hay % de grasa): 500 + 22 × masa libre de grasa. */
export function cunningham(weightKg: number, bodyFatPct: number) {
  const lean = weightKg * (1 - clamp(bodyFatPct, 3, 60) / 100)
  return { reference: 500 + 22 * lean, leanMassKg: lean }
}

/** Nivel de actividad global = vida cotidiana + entrenamiento HABITUAL. */
export function activityLevelFor(daily: DailyActivity, physical: PhysicalActivityInput) {
  const weeklyMinutes = Math.max(0, physical.daysPerWeek || 0) * Math.max(0, physical.minutesPerSession || 0)
  const intensityShift = physical.intensity === 'high' ? 1 : physical.intensity === 'low' ? -1 : 0
  let level = weeklyMinutes >= 450 ? 4 : weeklyMinutes >= 300 ? 3 : weeklyMinutes >= 150 ? 2 : weeklyMinutes >= 45 ? 1 : 0
  level = clamp(level + DAILY_BASE[daily] + intensityShift, 0, 4)
  return { factor: FACTORS[level], level: LEVELS[level] }
}

/**
 * Cálculo completo. Devuelve `plan` sólo si hay datos suficientes y no hay
 * un caso que exija derivación profesional; si no, `missing` o `blocked`.
 */
export function computeNutritionPlan(
  inputs: NutritionInputs,
  now: string = new Date().toISOString(),
): { plan: NutritionPlan | null; missing: string[]; blocked: { reasons: string[]; referral: string } | null } {
  const missing = missingNutritionInputs(inputs)
  if (missing.length > 0) {return { plan: null, missing, blocked: null }}

  const risk = inputs.riskFlags || {}
  const reasons: string[] = []
  if (risk.minor) {reasons.push('Menor de 18 años')}
  if (risk.pregnancy) {reasons.push('Embarazo o lactancia')}
  if (risk.eatingDisorder) {reasons.push('Trastorno de la conducta alimentaria declarado')}
  if (risk.illness) {reasons.push('Enfermedad o condición clínica relevante')}
  if (risk.medication) {reasons.push('Medicación que afecta la nutrición')}
  const blocked = reasons.length > 0
    ? { reasons, referral: 'Nutricionista o médico de cabecera' }
    : null
  if (blocked) {return { plan: null, missing: [], blocked }}

  const weight = Number(inputs.weightKg)
  const height = Number(inputs.heightCm)
  const age = Number(inputs.age)
  const bmr = mifflinStJeor(weight, height, age, inputs.sex)
  const alt = Number(inputs.bodyFatPct) > 0 ? cunningham(weight, Number(inputs.bodyFatPct)) : null
  const level = activityLevelFor(inputs.dailyActivity, inputs.physicalActivity)
  const tdeeRef = (alt?.reference ?? bmr.reference) * level.factor
  const tdeeLow = (alt?.reference ?? bmr.low) * level.factor
  const tdeeHigh = (alt?.reference ?? bmr.high) * level.factor

  const pct = GOAL_ADJUSTMENT[inputs.goal].pct
  // Nunca por debajo del gasto en reposo (evita restricciones extremas).
  const targetRef = Math.max(bmr.reference, tdeeRef * (1 + pct))
  const targetLow = Math.max(bmr.low, tdeeLow * (1 + pct))
  const targetHigh = Math.max(bmr.high, tdeeHigh * (1 + pct))

  const proteinPerKg = clamp(PROTEIN_G_PER_KG[inputs.goal], PROTEIN_RANGE.min, PROTEIN_RANGE.max)
  const protein = r(weight * proteinPerKg)
  let fat = r(Math.max(targetRef * FAT_PCT_DEFAULT, weight * 0.6) / 9)
  const fatPct = (fat * 9) / targetRef
  if (fatPct > FAT_PCT_RANGE.max) {fat = r((targetRef * FAT_PCT_RANGE.max) / 9)}
  let carbs = r((targetRef - protein * 4 - fat * 9) / 4)
  if (carbs < 0) {
    // Si proteína y grasa no dejan carbohidratos, se baja la grasa a su mínimo.
    fat = r(Math.max(weight * 0.5, (targetRef * FAT_PCT_RANGE.min) / 9) / 9)
    carbs = Math.max(0, r((targetRef - protein * 4 - fat * 9) / 4))
  }
  const kcalSum = protein * 4 + carbs * 4 + fat * 9

  const notes: string[] = []
  if (inputs.sex === 'X') {
    notes.push('Sexo no especificado: TMB y gasto se muestran como intervalo entre las dos variantes de Mifflin-St Jeor.')
  }
  if (alt) {
    notes.push(`Se usó Cunningham con masa libre de grasa estimada (${r(alt.leanMassKg)} kg). Es una estimación, no una medición.`)
  }
  notes.push('El gasto es una estimación: la fórmula no mide calorías reales.')

  const plan: NutritionPlan = {
    version: 1,
    createdAt: now,
    inputs,
    bmr: { low: r(bmr.low), high: r(bmr.high), reference: r(bmr.reference), formula: bmr.formula },
    tdee: { low: r(tdeeLow), high: r(tdeeHigh), reference: r(tdeeRef), factor: level.factor, level: level.level },
    target: { low: r(targetLow), high: r(targetHigh), reference: r(targetRef), adjustmentPct: Math.round(pct * 100), goal: inputs.goal },
    macros: { protein, carbs, fat, proteinPerKg, fatPct: Math.round(fatPct * 100), kcalSum },
    notes,
  }
  return { plan, missing: [], blocked: null }
}

export interface ExtraActivity {
  id: string
  label: string
  date: string
  durationMinutes: number
  /** Gasto NETO sobre el reposo; nunca el bruto del reloj. */
  activeKcal: number | null
  method: string
  estimated: boolean
}

/**
 * Ajuste sugerido por actividad EXTRA del día. Nunca modifica la meta base:
 * devuelve una recomendación aparte y prioriza carbohidratos.
 *
 * No se suma el gasto completo (doble conteo con el factor de actividad y
 * precisión limitada de las estimaciones): se acredita la mitad, con tope.
 */
export function suggestedActivityAdjustment(plan: NutritionPlan, extras: ExtraActivity[], date: string) {
  const valid = extras.filter((e) => e.date === date && Number(e.durationMinutes) >= 15 && Number(e.activeKcal) > 0)
  if (valid.length === 0) {return null}
  const net = valid.reduce((sum, e) => sum + Number(e.activeKcal), 0)
  const credit = Math.min(r(net * 0.5, 10), r(plan.target.reference * 0.15, 10), 400)
  if (credit < 80) {return null}
  return {
    baseKcal: plan.target.reference,
    adjustmentKcal: credit,
    low: plan.target.low + credit,
    high: plan.target.high + credit,
    carbsG: r(credit / 4),
    activities: valid,
    method: 'MET × peso × duración (gasto neto) con crédito del 50 % para evitar doble conteo',
    uncertainty: '±30 % (estimación, no medición)',
  }
}

/**
 * Sugerencia de ajuste por tendencia de peso: sólo con varias semanas de
 * registros. No cambia nada por una sola medición.
 */
export function weightTrendAdjustment(
  plan: NutritionPlan,
  weights: Array<{ localDate: string; weightKg: number }>,
  todayKey: string,
) {
  const valid = weights
    .filter((w) => Number(w.weightKg) > 0 && w.localDate <= todayKey)
    .sort((a, b) => a.localDate.localeCompare(b.localDate))
    .slice(-8)
  if (valid.length < 4) {return null}
  const first = valid[0]
  const last = valid[valid.length - 1]
  const days = Math.max(1, Math.round((Date.parse(last.localDate) - Date.parse(first.localDate)) / 86400000))
  if (days < 14) {return null}
  const deltaKg = Number(last.weightKg) - Number(first.weightKg)
  const weekly = (deltaKg / days) * 7
  if (plan.inputs.goal === 'lose' && weekly > -0.15) {
    return { reason: `Tu peso promedio bajó ${weekly.toFixed(2)} kg/semana en ${days} días: el déficit es muy chico.`, deltaPct: -5, weeks: days }
  }
  if (plan.inputs.goal === 'gain' && weekly < 0.1) {
    return { reason: `Tu peso promedio subió ${weekly.toFixed(2)} kg/semana en ${days} días: el superávit es insuficiente.`, deltaPct: 5, weeks: days }
  }
  if (plan.inputs.goal === 'maintain' && Math.abs(weekly) > 0.35) {
    return { reason: `Tu peso se movió ${weekly.toFixed(2)} kg/semana en ${days} días con objetivo de mantenimiento.`, deltaPct: weekly > 0 ? -5 : 5, weeks: days }
  }
  return null
}
