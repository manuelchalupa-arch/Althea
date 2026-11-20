import { useCallback, useEffect, useState } from 'react'
import { AltheaBadge, AltheaButton, AltheaCard } from '@/components/althea'
import {
  DAILY_ACTIVITY_LABEL,
  GOAL_ADJUSTMENT,
  GOAL_LABEL,
  type DailyActivity,
  type NutritionGoal,
  type NutritionInputs,
  type NutritionPlan,
  type TrainingIntensity,
} from '@/services/nutrition/goalEngine'
import {
  loadNutritionPlan,
  saveNutritionPlan,
  suggestedAdjustments,
  type NutritionPlanRecord,
} from '@/services/nutrition/nutritionPlanStore'
import type { UserProfile } from '@/types'

const ACTIVITY_OPTIONS: DailyActivity[] = ['sedentary', 'light', 'moderate', 'high', 'very_high']
const INTENSITY_LABEL: Record<TrainingIntensity, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }
const SEX_LABEL: Record<'M' | 'F' | 'X', string> = {
  M: 'Sexo masculino',
  F: 'Sexo femenino',
  X: 'Sexo no especificado',
}

const goalFromProfile = (p: UserProfile | null): NutritionGoal => {
  const g = p?.trainingGoal || p?.goal
  if (g === 'fat_loss' || g === 'perdida_peso') {return 'lose'}
  if (g === 'hypertrophy' || g === 'hipertrofia') {return 'gain'}
  return 'maintain'
}

const activityFromProfile = (p: UserProfile | null): DailyActivity => {
  switch (p?.activityLevel) {
    case 'sedentario': return 'sedentary'
    case 'poco_activo': return 'light'
    case 'muy_activo': return 'high'
    case 'extremadamente_activo': return 'very_high'
    default: return 'moderate'
  }
}

function baseInputs(p: UserProfile | null): NutritionInputs {
  return {
    age: p?.age ?? null,
    sex: p?.sex ?? 'X',
    weightKg: p?.weightKg ?? null,
    heightCm: p?.heightCm ?? null,
    bodyFatPct: p?.bodyFatPct ?? null,
    goal: goalFromProfile(p),
    dailyActivity: activityFromProfile(p),
    physicalActivity: {
      types: [],
      daysPerWeek: Math.max(1, p?.schedule?.availableDays?.length ?? p?.availableDays?.length ?? 3),
      minutesPerSession: p?.sessionDurationMin ?? p?.preferences?.sessionDurationMin ?? (Number(p?.trainingTime) || 60),
      intensity: 'medium',
    },
    riskFlags: {},
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
const range = (low: number, high: number) => (Math.round(low) === Math.round(high) ? fmt(low) : `${fmt(low)}–${fmt(high)}`)

const fieldClass = 'w-full min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[44px]'
const labelClass = 'block font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1'

export default function NutritionGoalsPanel({ profile, date, onSaved }: {
  profile: UserProfile | null
  date: string
  onSaved: () => void
}) {
  const [record, setRecord] = useState<NutritionPlanRecord | null>(null)
  const [editing, setEditing] = useState(false)
  const [inputs, setInputs] = useState<NutritionInputs>(() => baseInputs(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ reasons: string[]; referral: string } | null>(null)
  const [adjust, setAdjust] = useState<Awaited<ReturnType<typeof suggestedAdjustments>> | null>(null)

  const load = useCallback(async () => {
    const r = await loadNutritionPlan().catch(() => null)
    setRecord(r)
    setInputs(r?.current.inputs ?? baseInputs(profile))
    setAdjust(r ? await suggestedAdjustments(r.current, date).catch(() => null) : null)
  }, [profile, date])

  useEffect(() => { load() }, [load])

  const set = <K extends keyof NutritionInputs>(key: K, value: NutritionInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }))
  const setTraining = <K extends keyof NutritionInputs['physicalActivity']>(key: K, value: NutritionInputs['physicalActivity'][K]) =>
    setInputs(prev => ({ ...prev, physicalActivity: { ...prev.physicalActivity, [key]: value } }))
  const setRisk = (key: keyof NonNullable<NutritionInputs['riskFlags']>, value: boolean) =>
    setInputs(prev => ({ ...prev, riskFlags: { ...prev.riskFlags, [key]: value } }))

  const save = async () => {
    setBusy(true)
    setError(null)
    setBlocked(null)
    try {
      const payload: NutritionInputs = {
        ...inputs,
        riskFlags: { ...inputs.riskFlags, minor: Boolean(inputs.riskFlags?.minor) || Number(inputs.age) < 18 },
      }
      const result = await saveNutritionPlan(payload, record ? 'Objetivo recalculado' : 'Cálculo inicial')
      if (result.blocked) {
        setBlocked(result.blocked)
        return
      }
      if (result.missing.length > 0) {
        setError(`Faltan datos: ${result.missing.join(', ')}.`)
        return
      }
      setEditing(false)
      await load()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el objetivo')
    } finally {
      setBusy(false)
    }
  }

  const plan: NutritionPlan | null = record?.current ?? null

  return (
    <AltheaCard level={2} className="domain-nutrition space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title-md text-on-surface font-semibold">Objetivo nutricional</h2>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Calculado con tus datos; nunca desde una estimación de la IA.
          </p>
        </div>
        <AltheaButton
          size="sm"
          variant="secondary"
          className="shrink-0 min-h-[44px]"
          onClick={() => { setEditing(v => !v); setError(null); setBlocked(null) }}
        >
          {editing ? 'Cerrar' : plan ? 'Recalcular' : 'Calcular'}
        </AltheaButton>
      </div>

      {blocked && (
        <div role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 space-y-1">
          <p className="font-body-md text-sm text-on-surface font-medium">Este cálculo necesita acompañamiento profesional.</p>
          <ul className="list-disc pl-5 font-body-sm text-xs text-on-surface-variant">
            {blocked.reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
          <p className="font-label-caps text-[10px] text-on-surface-variant">Derivar a: {blocked.referral}</p>
        </div>
      )}
      {error && <p role="alert" className="font-body-sm text-xs text-error">{error}</p>}

      {editing && (
        <fieldset className="space-y-3">
          <legend className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
            Datos para el cálculo
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block min-w-0">
              <span className={labelClass}>Edad</span>
              <input type="number" min={14} max={100} inputMode="numeric" value={inputs.age ?? ''} aria-label="Edad en años" onChange={e => set('age', e.target.value === '' ? null : Number(e.target.value))} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Peso (kg)</span>
              <input type="number" min={30} max={250} step={0.1} inputMode="decimal" value={inputs.weightKg ?? ''} aria-label="Peso en kilogramos" onChange={e => set('weightKg', e.target.value === '' ? null : Number(e.target.value))} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Altura (cm)</span>
              <input type="number" min={120} max={230} inputMode="numeric" value={inputs.heightCm ?? ''} aria-label="Altura en centímetros" onChange={e => set('heightCm', e.target.value === '' ? null : Number(e.target.value))} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>% grasa (opc.)</span>
              <input type="number" min={3} max={60} step={0.1} inputMode="decimal" value={inputs.bodyFatPct ?? ''} aria-label="Porcentaje de grasa corporal, opcional" onChange={e => set('bodyFatPct', e.target.value === '' ? null : Number(e.target.value))} className={fieldClass} />
            </label>
          </div>

          <div>
            <span className={labelClass}>Sexo</span>
            <div className="flex gap-1.5" role="group" aria-label="Sexo para el cálculo">
              {(['M', 'F', 'X'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('sex', s)}
                  aria-pressed={inputs.sex === s}
                  aria-label={SEX_LABEL[s]}
                  title={SEX_LABEL[s]}
                  className={`flex-1 min-w-0 min-h-[44px] rounded-lg border font-body-md text-sm font-semibold ${inputs.sex === s ? 'border-primary bg-primary/20 text-on-surface' : 'border-outline-variant bg-surface text-on-surface-variant'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>Objetivo</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {(['gain', 'lose', 'maintain'] as NutritionGoal[]).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', g)}
                  aria-pressed={inputs.goal === g}
                  className={`min-h-[44px] rounded-lg border px-2 py-1.5 font-body-md text-xs ${inputs.goal === g ? 'border-primary bg-primary/20 text-on-surface' : 'border-outline-variant bg-surface text-on-surface-variant'}`}
                >
                  {GOAL_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className={labelClass}>Actividad diaria</span>
              <select value={inputs.dailyActivity} onChange={e => set('dailyActivity', e.target.value as DailyActivity)} aria-label="Actividad diaria" className={fieldClass}>
                {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{DAILY_ACTIVITY_LABEL[a]}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Intensidad del entrenamiento</span>
              <select value={inputs.physicalActivity.intensity} onChange={e => setTraining('intensity', e.target.value as TrainingIntensity)} aria-label="Intensidad del entrenamiento" className={fieldClass}>
                {(['low', 'medium', 'high'] as TrainingIntensity[]).map(i => <option key={i} value={i}>{INTENSITY_LABEL[i]}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Días de entreno / semana</span>
              <input type="number" min={0} max={7} inputMode="numeric" value={inputs.physicalActivity.daysPerWeek} aria-label="Días de entrenamiento por semana" onChange={e => setTraining('daysPerWeek', Number(e.target.value) || 0)} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Minutos por sesión</span>
              <input type="number" min={10} max={240} step={5} inputMode="numeric" value={inputs.physicalActivity.minutesPerSession} aria-label="Minutos por sesión de entrenamiento" onChange={e => setTraining('minutesPerSession', Number(e.target.value) || 0)} className={fieldClass} />
            </label>
          </div>

          <fieldset className="rounded-lg border border-outline-variant/50 p-3">
            <legend className="px-1 font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
              Requiere derivación profesional
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {([
                ['minor', 'Menor de 18 años'],
                ['pregnancy', 'Embarazo o lactancia'],
                ['eatingDisorder', 'Trastorno de la conducta alimentaria'],
                ['illness', 'Enfermedad o condición clínica'],
                ['medication', 'Medicación que afecta la nutrición'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 min-h-[36px] font-body-sm text-xs text-on-surface">
                  <input type="checkbox" checked={Boolean(inputs.riskFlags?.[key]) || (key === 'minor' && Number(inputs.age) < 18)} onChange={e => setRisk(key, e.target.checked)} disabled={key === 'minor' && Number(inputs.age) < 18} className="w-4 h-4 shrink-0" />
                  {label}
                </label>
              ))}
            </div>
            <p className="font-body-sm text-[11px] text-on-surface-variant mt-1">
              En estos casos no se fija un déficit ni un superávit automático: se deriva a un profesional.
            </p>
          </fieldset>

          <AltheaButton fullWidth className="min-h-[48px]" loading={busy} onClick={save}>
            Calcular y guardar objetivo
          </AltheaButton>
        </fieldset>
      )}

      {plan && !editing && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Objetivo base</p>
              <p className="font-headline-sm text-2xl font-bold text-on-surface leading-tight">
                {range(plan.target.low, plan.target.high)} <span className="text-sm font-normal text-on-surface-variant">kcal/día</span>
              </p>
            </div>
            <AltheaBadge variant="secondary">{GOAL_ADJUSTMENT[plan.inputs.goal].label}</AltheaBadge>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              ['Proteínas', plan.macros.protein, `${plan.macros.proteinPerKg.toFixed(1)} g/kg`],
              ['Carbohidratos', plan.macros.carbs, 'por diferencia'],
              ['Grasas', plan.macros.fat, `${plan.macros.fatPct} % kcal`],
            ] as const).map(([label, value, hint]) => (
              <div key={label} className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-2 text-center min-w-0">
                <div className="font-mono text-base font-bold text-on-surface">{value} g</div>
                <div className="font-label-caps text-[9px] uppercase tracking-wider text-on-surface-variant truncate">{label}</div>
                <div className="font-body-sm text-[10px] text-on-surface-variant truncate">{hint}</div>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-body-sm text-xs">
            <div className="flex justify-between gap-2"><dt className="text-on-surface-variant">TMB</dt><dd className="font-mono text-on-surface">{range(plan.bmr.low, plan.bmr.high)} kcal · {plan.bmr.formula}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-on-surface-variant">Gasto total</dt><dd className="font-mono text-on-surface">{range(plan.tdee.low, plan.tdee.high)} kcal · factor {plan.tdee.factor}</dd></div>
          </dl>

          {adjust?.activity && adjust.activity.adjustmentKcal > 0 && (
            <div className="rounded-lg border border-secondary/40 bg-secondary/10 p-3 space-y-1">
              <p className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">Ajuste sugerido por actividad registrada hoy</p>
              <p className="font-body-md text-sm text-on-surface">
                +{fmt(adjust.activity.adjustmentKcal)} kcal (base {fmt(adjust.activity.baseKcal)} → {fmt(adjust.activity.low)}–{fmt(adjust.activity.high)} kcal), con +{adjust.activity.carbsG} g de carbohidratos.
              </p>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                {adjust.activity.activities.map(a => `${a.label} (${a.durationMinutes} min)`).join(' · ')}. {adjust.activity.method}. Incertidumbre {adjust.activity.uncertainty}.
              </p>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Es una sugerencia aparte: la meta base no cambia y no se suman las dos.</p>
            </div>
          )}

          {adjust?.trend && (
            <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
              <p className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">Tendencia de peso</p>
              <p className="font-body-md text-sm text-on-surface">{adjust.trend.reason}</p>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Sugerencia: {adjust.trend.deltaPct > 0 ? '+' : ''}{adjust.trend.deltaPct} % sobre la meta, revisable con tu profesional.</p>
            </div>
          )}

          <ul className="list-disc pl-5 font-body-sm text-[11px] text-on-surface-variant space-y-0.5">
            {plan.notes.map(n => <li key={n}>{n}</li>)}
          </ul>

          {record && record.history.length > 0 && (
            <details className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
              <summary className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant cursor-pointer min-h-[32px] flex items-center">
                Historial de objetivos ({record.history.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {record.history.map(h => (
                  <li key={h.at} className="font-body-sm text-[11px] text-on-surface-variant">
                    <span className="font-mono text-on-surface">{new Date(h.at).toLocaleDateString('es-AR')}</span> · {range(h.plan.target.low, h.plan.target.high)} kcal · {GOAL_LABEL[h.plan.inputs.goal]} · {h.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </AltheaCard>
  )
}
