import { useState, useEffect, useRef } from 'react'
import { recoveryIndex, recoveryColor } from '@/utils/calc'
import { db } from '@/services/storage/db'
import { updateRecoveryCheck } from '@/services/recovery/recoveryService'
import { todayKey } from '@/utils/dates'

// Cuestionario de recuperación (nombres internos estables, etiquetas en español).
// Positivas: energy, mood, motivation · Negativas: fatigue, pain, perceivedExertion, stress.
// painArea/painObservation son descriptivas. Fórmula documentada en utils/calc.ts.
export const RECOVERY_FIELDS: [string, string][] = [
  ['energy', 'Energía'], ['fatigue', 'Fatiga'], ['pain', 'Dolor'], ['mood', 'Estado de ánimo'],
  ['motivation', 'Motivación'], ['perceivedExertion', 'Esfuerzo percibido'], ['stress', 'Estrés'],
]

export interface RecoveryCheckValues {
  energy: number; fatigue: number; pain: number; mood: number
  motivation: number; perceivedExertion: number; stress: number
  painArea: string; painObservation: string
  sleepHours?: number; sleepQuality?: number; sleepNotes?: string
}

export const DEFAULT_RECOVERY_VALS: RecoveryCheckValues = {
  energy: 7, fatigue: 4, pain: 2, mood: 7,
  motivation: 7, perceivedExertion: 5, stress: 3,
  painArea: '', painObservation: '',
  sleepHours: undefined, sleepQuality: undefined, sleepNotes: undefined,
}

// Estados de hidratación del formulario.
type HydrationState = 'loading' | 'hydrated' | 'error'

interface Props {
  date?: string
  onChange?: (vals: RecoveryCheckValues, score: number, color: 'green' | 'yellow' | 'red') => void
  onSaved?: (score: number) => void
}

export function RecoveryCheckForm({ date, onChange, onSaved }: Props) {
  const today = date ?? todayKey()
  const [vals, setVals] = useState<RecoveryCheckValues>(DEFAULT_RECOVERY_VALS)
  const [score, setScore] = useState(0)
  const [color, setColor] = useState<'green' | 'yellow' | 'red'>('green')
  const [saving, setSaving] = useState(false)
  const [hasRecord, setHasRecord] = useState(false)
  const [hydration, setHydration] = useState<HydrationState>('loading')

  // El callback del padre puede cambiar de identidad en cada render; se guarda
  // en un ref para que el efecto de carga (sólo depende de `today`) llame
  // siempre a la versión más reciente sin re-ejecutarse.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Cargar registro existente desde Dexie y hidratar formulario.
  // Siempre carga la fecha solicitada, no limitada a "hoy".
  useEffect(() => {
    setHydration('loading')
    db.recoveryChecks.get(today).then(async r => {
      if (r && r.energy !== undefined) {
        // Aplicar todos los campos existentes del registro Dexie.
        // Valores decimales (sleepHours = 7.5) se preservan exactamente.
        const v: RecoveryCheckValues = {
          energy: Number(r.energy ?? 7), fatigue: Number(r.fatigue ?? 4),
          pain: Number((r as unknown as Record<string, unknown>).soreness ?? (r as unknown as Record<string, unknown>).pain as number ?? 2), mood: Number(r.motivation ?? 7),
          motivation: Number(r.motivation ?? 7), perceivedExertion: Number(r.perceivedExertion ?? 5),
          stress: Number(r.stress ?? 3), painArea: String(r.painArea ?? ''),
          painObservation: String(r.painObservation ?? ''),
          sleepHours: typeof r.sleepHours === 'number' ? r.sleepHours : undefined,
          sleepQuality: typeof r.sleepQuality === 'number' ? r.sleepQuality : undefined,
          sleepNotes: typeof (r as unknown as Record<string, unknown>).notes === 'string' ? (r as unknown as Record<string, unknown>).notes as string : undefined,
        }
        setVals(v)
        const s = typeof r.score === 'number' ? r.score : recoveryIndex(v)
        const c = recoveryColor(s)
        setScore(s); setColor(c)
        setHasRecord(true)
        setHydration('hydrated')
        onChangeRef.current?.(v, s, c)
      } else {
        // No existe registro: aplicar defaults puros.
        const s = recoveryIndex(DEFAULT_RECOVERY_VALS)
        const c = recoveryColor(s)
        setScore(s); setColor(c)
        setHasRecord(false)
        setHydration('hydrated')
        onChangeRef.current?.(DEFAULT_RECOVERY_VALS, s, c)
      }
    }).catch(() => {
      setHydration('error')
    })
  }, [today])

  // Actualizar score y color cuando cambian los valores.
  const update = (k: string, v: number | string) => {
    const nv = { ...vals, [k]: v }
    setVals(nv)
    const s = recoveryIndex(nv)
    const c = recoveryColor(s)
    setScore(s); setColor(c)
    onChange?.(nv, s, c)
  }

  // Guardado definitivo: solo se permite después de hidratación completa.
const save = async () => {
    if (hydration !== 'hydrated') {return}
    setSaving(true)
    try {
      const patch: {
        energy: number; fatigue: number; stress: number; soreness: number;
        motivation: number; perceivedExertion: number;
        painArea: string; painObservation: string;
        score: number; color: 'green' | 'yellow' | 'red';
        sleepHours?: number; sleepQuality?: number; notes?: string;
      } = {
        energy: vals.energy, fatigue: vals.fatigue, stress: vals.stress,
        soreness: vals.pain, motivation: vals.motivation,
        perceivedExertion: vals.perceivedExertion,
        painArea: vals.painArea, painObservation: vals.painObservation,
        score, color,
      }
      if (typeof vals.sleepHours === 'number') {patch.sleepHours = vals.sleepHours}
      if (typeof vals.sleepQuality === 'number') {patch.sleepQuality = vals.sleepQuality}
      if (vals.sleepNotes !== null && vals.sleepNotes !== undefined) {(patch as unknown as Record<string, unknown>).notes = vals.sleepNotes}
      await updateRecoveryCheck(patch as never, today)
      setHasRecord(true)
      onSaved?.(score)
      // mecanismo reutilizable requiredAction: completar desbloquea (Dexie, no solo React) — no bloquea UI
      import('@/services/notifications/requiredActionService').then(m => m.completeRecoveryCheck(today).catch(()=>{})).catch(()=>{})
} finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className={`rounded p-5 text-center border ${color === 'green' ? 'bg-secondary/15 border-secondary/40' : color === 'yellow' ? 'bg-tertiary/15 border-tertiary/40' : 'bg-error/15 border-error/40'}`}>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant opacity-70">RECUPERACIÓN</div>
        <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface mt-1 flex items-center justify-center gap-2">{score}/100 <span aria-hidden className={`inline-block w-3 h-3 rounded-full ${color === 'green' ? 'bg-secondary' : color === 'yellow' ? 'bg-tertiary' : 'bg-error'}`}></span></div>
        <div className="font-body-md text-sm text-on-surface opacity-80 mt-1">{color === 'green' ? 'Normal' : color === 'yellow' ? 'Moderada' : 'Baja'} — {color === 'green' ? 'Listo para entrenar' : color === 'yellow' ? 'Considerá bajar volumen' : 'Priorizá descanso'}</div>
        {!hasRecord && (
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant opacity-70 mt-1">Sin check-in guardado — completá y guardá para registrar tu estado real</div>
        )}
      </div>

      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Cuestionario diario (1–10) — completalo cuando quieras</div>
        {RECOVERY_FIELDS.map(([k, label]) => (
          <label key={k} className="block">
            <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>{label}</span><span>{vals[k as keyof RecoveryCheckValues]}/10</span></div>
            <input type="range" min={1} max={10} value={Number(vals[k as keyof RecoveryCheckValues])} onChange={e => update(k, Number(e.target.value))} className="w-full accent-primary" />
          </label>
        ))}
        <label className="block font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Zona del dolor
          <input value={vals.painArea} onChange={e => update('painArea', e.target.value)} placeholder="Ej: hombro derecho" maxLength={80} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
        </label>
        <label className="block font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Observación del dolor
          <textarea value={vals.painObservation} onChange={e => update('painObservation', e.target.value)} placeholder="Tipo de molestia, cuándo aparece…" rows={2} maxLength={300} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
        </label>
        <div className="pt-1 space-y-3 border-t border-outline-variant/30">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Sueño</div>
          <label className="block">
            <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Horas dormidas</span><span>{vals.sleepHours ?? 7} h</span></div>
            <input type="range" min={0} max={12} step={0.5} value={vals.sleepHours ?? 7} onChange={e => update('sleepHours', Number(e.target.value))} className="w-full accent-primary" />
          </label>
          <label className="block">
            <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Calidad del sueño</span><span>{vals.sleepQuality ?? 7}/10</span></div>
            <input type="range" min={1} max={10} value={vals.sleepQuality ?? 7} onChange={e => update('sleepQuality', Number(e.target.value))} className="w-full accent-primary" />
          </label>
        </div>
        <button onClick={save} disabled={hydration !== 'hydrated'} className="w-full py-3 min-h-[48px] rounded-xl bg-primary text-on-primary font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar recuperación'}</button>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Se guarda al presionar · actualiza recuperación, gráfico e IA. Índice orientativo, no diagnóstico médico. No modifica tu rutina.</p>
      </div>
    </div>
  )
}