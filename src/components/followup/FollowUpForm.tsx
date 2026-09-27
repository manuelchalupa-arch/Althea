import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { AltheaButton } from '@/components/althea'
import {
  saveFollowUp, followUpRange, hasFollowUpData, listFollowUps,
  type FollowUpMeasurements, type FollowUpRecovery,
} from '@/services/followup/followUpService'
import { FOLLOW_UP_PERIODS, type FollowUpPeriod } from '@/services/followup/periods'

const MEASURE_FIELDS: Array<{ key: keyof FollowUpMeasurements; label: string; unit: string; step: string }> = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', step: '0.1' },
  { key: 'bodyFatPct', label: 'Grasa', unit: '%', step: '0.1' },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg', step: '0.1' },
  { key: 'chestCm', label: 'Pecho', unit: 'cm', step: '0.5' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm', step: '0.5' },
  { key: 'hipCm', label: 'Cadera', unit: 'cm', step: '0.5' },
]

const RECOVERY_FIELDS: Array<{ key: keyof FollowUpRecovery; label: string; unit: string; step: string; max: number }> = [
  { key: 'sleepHours', label: 'Sueño', unit: 'h', step: '0.5', max: 24 },
  { key: 'energy', label: 'Energía', unit: '/10', step: '1', max: 10 },
  { key: 'fatigue', label: 'Fatiga', unit: '/10', step: '1', max: 10 },
  { key: 'soreness', label: 'Dolor', unit: '/10', step: '1', max: 10 },
  { key: 'mood', label: 'Ánimo', unit: '/10', step: '1', max: 10 },
  { key: 'motivation', label: 'Motivación', unit: '/10', step: '1', max: 10 },
  { key: 'stress', label: 'Estrés', unit: '/10', step: '1', max: 10 },
  { key: 'perceivedExertion', label: 'Esfuerzo', unit: '/10', step: '1', max: 10 },
]

function num(v: string): number | undefined {
  if (v.trim() === '') {return undefined}
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function FollowUpForm({ onSaved }: { onSaved?: (date: string) => void }) {
  const today = todayKey()
  const [period, setPeriod] = useState<FollowUpPeriod>('7')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [measures, setMeasures] = useState<Record<string, string>>({})
  const [recovery, setRecovery] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [history, setHistory] = useState<Array<{ date: string; weightKg?: number; sleepHours?: number; score?: number }>>([])

  const range = useMemo(() => followUpRange(period, customStart, customEnd, today), [period, customStart, customEnd, today])

  // Cargar el último seguimiento guardado para no perder lo ya registrado.
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [rows, prev] = await Promise.all([
        listFollowUps(8),
        db.bodyMeasurements.get(`followup-${range.end}`).catch(() => undefined),
      ])
      if (!alive) {return}
      setHistory(rows)
      if (prev) {
        const m: Record<string, string> = {}
        for (const f of MEASURE_FIELDS) {
          const v = prev[f.key]
          if (typeof v === 'number') {m[f.key] = String(v)}
        }
        setMeasures(m)
        const rec = await db.recoveryChecks.get(range.end).catch(() => undefined)
        if (rec) {
          const r: Record<string, string> = {}
          for (const f of RECOVERY_FIELDS) {
            const v = rec[f.key]
            if (typeof v === 'number') {r[f.key] = String(v)}
          }
          setRecovery(r)
        }
      } else {
        setMeasures({})
        setRecovery({})
      }
    }
    load()
    return () => { alive = false }
  }, [range.end])

  const setField = (bucket: 'm' | 'r', key: string, value: string) => {
    setMsg(null)
    if (bucket === 'm') {setMeasures(p => ({ ...p, [key]: value }))}
    else {setRecovery(p => ({ ...p, [key]: value }))}
  }

  const inputPayload = useMemo(() => {
    const measurements: FollowUpMeasurements = {}
    for (const f of MEASURE_FIELDS) {
      const v = num(measures[f.key] ?? '')
      if (v !== undefined) {(measurements as Record<string, number>)[f.key] = v}
    }
    const rec: FollowUpRecovery = {}
    for (const f of RECOVERY_FIELDS) {
      const v = num(recovery[f.key] ?? '')
      if (v !== undefined) {(rec as Record<string, number>)[f.key] = v}
    }
    return { measurements, rec }
  }, [measures, recovery])

  const empty = !hasFollowUpData({ period, measurements: inputPayload.measurements, recovery: inputPayload.rec })

  const handleSave = async () => {
    if (empty || saving) {return}
    setSaving(true)
    setMsg(null)
    try {
      const res = await saveFollowUp({
        period,
        customStart: period === 'custom' ? customStart : undefined,
        customEnd: period === 'custom' ? customEnd : undefined,
        measurements: inputPayload.measurements,
        recovery: inputPayload.rec,
        notes: notes.trim() || undefined,
      })
      setHistory(await listFollowUps(8))
      const partes = [res.savedMeasurement && 'medidas', res.savedRecovery && 'recuperación'].filter(Boolean)
      setMsg({ tone: 'ok', text: `Seguimiento ${res.date} guardado (${partes.join(' y ')})` })
      onSaved?.(res.date)
    } catch (e: unknown) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      data-testid="followup-form"
      className="rounded-xl border border-outline-variant/40 bg-surface-container p-4 space-y-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-headline-md text-headline-sm font-semibold text-on-surface">Seguimiento</h3>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Revisá tu período y registrá lo que se mide a mano. Los datos automáticos de entrenamiento, fuerza y nutrición no se duplican acá.
          </p>
        </div>
        <span className="material-symbols-outlined text-secondary shrink-0" style={{ fontSize: 22 }}>fact_check</span>
      </header>

      {/* Período */}
      <div className="space-y-2">
        <span className="font-label-caps text-[10px] uppercase text-outline">Período</span>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Período de seguimiento">
          {FOLLOW_UP_PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              data-testid={`followup-period-${p.id}`}
              aria-pressed={period === p.id}
              onClick={() => { setPeriod(p.id); setMsg(null) }}
              className={`min-h-[48px] px-2 rounded-lg border font-label-caps text-[10px] font-semibold uppercase transition-colors ${
                period === p.id
                  ? 'bg-surface-container-high border-primary text-on-surface'
                  : 'bg-surface-container border-outline-variant/60 text-on-surface-variant hover:border-primary/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="font-label-caps text-[10px] uppercase text-outline">
              Desde
              <input
                type="date"
                data-testid="followup-start"
                value={customStart}
                max={customEnd || today}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]"
              />
            </label>
            <label className="font-label-caps text-[10px] uppercase text-outline">
              Hasta
              <input
                type="date"
                data-testid="followup-end"
                value={customEnd}
                min={customStart || undefined}
                max={today}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]"
              />
            </label>
          </div>
        )}
        <p className="font-body-sm text-[11px] text-outline" data-testid="followup-range">
          {range.start} → {range.end}
        </p>
      </div>

      {/* Medidas manuales */}
      <fieldset className="space-y-2">
        <legend className="font-label-caps text-[10px] uppercase text-outline">Medidas</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MEASURE_FIELDS.map(f => (
            <label key={f.key} className="font-label-caps text-[10px] uppercase text-outline">
              {f.label} <span className="text-secondary normal-case">({f.unit})</span>
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                data-testid={`followup-${f.key}`}
                value={measures[f.key] ?? ''}
                onChange={e => setField('m', f.key, e.target.value)}
                placeholder="—"
                className="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2 font-body-md text-sm text-on-surface min-h-[44px]"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Recuperación manual */}
      <fieldset className="space-y-2">
        <legend className="font-label-caps text-[10px] uppercase text-outline">Recuperación</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {RECOVERY_FIELDS.map(f => (
            <label key={f.key} className="font-label-caps text-[10px] uppercase text-outline">
              {f.label} <span className="text-secondary normal-case">({f.unit})</span>
              <input
                type="number"
                inputMode="numeric"
                step={f.step}
                min={0}
                max={f.max}
                data-testid={`followup-${f.key}`}
                value={recovery[f.key] ?? ''}
                onChange={e => setField('r', f.key, e.target.value)}
                placeholder="—"
                className="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2 font-body-md text-sm text-on-surface min-h-[44px]"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block font-label-caps text-[10px] uppercase text-outline">
        Notas
        <textarea
          data-testid="followup-notes"
          value={notes}
          onChange={e => { setNotes(e.target.value); setMsg(null) }}
          rows={2}
          placeholder="Cómo viene la semana…"
          className="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg p-2 font-body-sm text-sm text-on-surface"
        />
      </label>

      <AltheaButton
        fullWidth
        size="lg"
        icon="save"
        disabled={empty || saving}
        onClick={handleSave}
        data-testid="followup-save"
      >
        {saving ? 'Guardando…' : 'Guardar seguimiento'}
      </AltheaButton>

      {msg && (
        <p
          data-testid="followup-msg"
          role="status"
          className={`font-body-sm text-xs ${msg.tone === 'ok' ? 'text-secondary' : 'text-error'}`}
        >
          {msg.text}
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-outline-variant/30">
          <span className="font-label-caps text-[10px] uppercase text-outline">Seguimientos guardados</span>
          <ul className="space-y-1" data-testid="followup-history">
            {history.map(h => (
              <li key={h.date} className="font-body-sm text-[11px] text-on-surface-variant flex items-center justify-between gap-2">
                <span>{h.date}</span>
                <span>
                  {h.weightKg !== undefined ? `${h.weightKg} kg` : '—'}
                  {h.sleepHours !== undefined ? ` · ${h.sleepHours} h` : ''}
                  {h.score !== undefined ? ` · índice ${h.score}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
