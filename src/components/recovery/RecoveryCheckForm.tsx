import { useState, useEffect } from 'react'
import { recoveryIndex, recoveryColor } from '@/utils/calc'
import { db } from '@/services/storage/db'

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
}

export const DEFAULT_RECOVERY_VALS: RecoveryCheckValues = {
  energy: 7, fatigue: 4, pain: 2, mood: 7,
  motivation: 7, perceivedExertion: 5, stress: 3,
  painArea: '', painObservation: '',
}

interface Props {
  date?: string
  onChange?: (vals: RecoveryCheckValues, score: number, color: 'green' | 'yellow' | 'red') => void
  onSaved?: (score: number) => void
}

// Formulario de check-in de recuperación. Fuente canónica: Dexie `recoveryChecks`.
// Solo escribe el check-in del día; nunca modifica rutinas ni historial de entrenamiento.
export function RecoveryCheckForm({ date, onChange, onSaved }: Props) {
  const today = date ?? new Date().toISOString().slice(0, 10)
  const [vals, setVals] = useState<RecoveryCheckValues>(DEFAULT_RECOVERY_VALS)
  const [score, setScore] = useState(0)
  const [color, setColor] = useState<'green' | 'yellow' | 'red'>('green')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    db.recoveryChecks.get(today).then(r => {
      if (r && r.energy !== undefined) {
        const v: RecoveryCheckValues = {
          energy: Number(r.energy ?? 7), fatigue: Number(r.fatigue ?? 4),
          pain: Number((r as { soreness?: number }).soreness ?? 2), mood: Number(r.motivation ?? 7),
          motivation: Number(r.motivation ?? 7), perceivedExertion: Number(r.perceivedExertion ?? 5),
          stress: Number(r.stress ?? 3), painArea: String(r.painArea ?? ''), painObservation: String(r.painObservation ?? ''),
        }
        setVals(v)
        const s = typeof r.score === 'number' ? r.score : recoveryIndex(v)
        const c = recoveryColor(s)
        setScore(s); setColor(c)
        onChange?.(v, s, c)
      } else {
        const saved = localStorage.getItem('recovery:' + today)
        if (saved) {
          try {
            const v = { ...DEFAULT_RECOVERY_VALS, ...JSON.parse(saved) }
            setVals(v)
            const s = recoveryIndex(v)
            const c = recoveryColor(s)
            setScore(s); setColor(c)
            onChange?.(v, s, c)
          } catch { /* noop */ }
        } else {
          const s = recoveryIndex(DEFAULT_RECOVERY_VALS)
          const c = recoveryColor(s)
          setScore(s); setColor(c)
          onChange?.(DEFAULT_RECOVERY_VALS, s, c)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const update = (k: string, v: number | string) => {
    const nv = { ...vals, [k]: v }
    setVals(nv)
    const s = recoveryIndex(nv)
    const c = recoveryColor(s)
    setScore(s); setColor(c)
    onChange?.(nv, s, c)
  }

  const save = async () => {
    setSaving(true)
    try {
      localStorage.setItem('recovery:' + today, JSON.stringify(vals))
      await db.recoveryChecks.put({ id: today, localDate: today, ...vals, score, color })
      try { window.dispatchEvent(new Event('recoveryChange')) } catch { /* noop */ }
      onSaved?.(score)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className={`rounded p-5 text-center border ${color === 'green' ? 'bg-emerald-900/30 border-emerald-800' : color === 'yellow' ? 'bg-amber-900/30 border-amber-800' : 'bg-red-900/30 border-red-800'}`}>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant opacity-70">RECUPERACIÓN</div>
        <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface mt-1 flex items-center justify-center gap-2">{score}/100 <span aria-hidden className={`inline-block w-3 h-3 rounded-full ${color === 'green' ? 'bg-success' : color === 'yellow' ? 'bg-warning' : 'bg-danger'}`}></span></div>
        <div className="font-body-md text-sm text-on-surface opacity-80 mt-1">{color === 'green' ? 'Normal' : color === 'yellow' ? 'Moderada' : 'Baja'} — {color === 'green' ? 'Listo para entrenar' : color === 'yellow' ? 'Considerá bajar volumen' : 'Priorizá descanso'}</div>
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
        <button onClick={save} disabled={saving} className="w-full py-3 rounded bg-primary text-on-surface font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar check-in'}</button>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Se guarda al presionar · actualiza recuperación, gráfico e IA. Índice orientativo, no diagnóstico médico. No modifica tu rutina.</p>
      </div>
    </div>
  )
}
