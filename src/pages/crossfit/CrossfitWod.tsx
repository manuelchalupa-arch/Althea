import { useEffect, useMemo, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaSelect, AltheaTextarea } from '@/components/althea/AltheaInput'
import { getScheduleByDate, listWods, newResult } from '@/services/crossfit/cfStore'
import { formatClock, defaultDurationSec, type WodFormatConfig } from '@/services/crossfit/wodTimer'
import type { CfFormat, CfLevel, CfScheduleEntry, CfWod } from '@/services/crossfit/types'
import { useWodTimer } from '@/hooks/useWodTimer'
import { todayKey } from '@/utils/dates'
import type { CrossfitSectionId } from '../Crossfit'

/**
 * WOD del día: muestra la sesión programada de hoy (o permite elegir un WOD
 * guardado), ejecuta el cronómetro persistente del formato (sobrevive a
 * recargas y segundo plano vía useWodTimer) y registra el resultado real en
 * cfResults. Sin datos de demo: si no hay nada programado, lo dice.
 */

const LEVEL_OPTIONS: { value: CfLevel; label: string }[] = [
  { value: 'rx', label: 'RX (estándar original)' },
  { value: 'scaled', label: 'Escalado' },
  { value: 'beginner', label: 'Principiante' },
  { value: 'adapted', label: 'Adaptado' },
]

const RPE_OPTIONS = ['' , '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((v) => ({
  value: v,
  label: v === '' ? 'Sin RPE' : `RPE ${v}`,
}))

const TIME_FORMATS: CfFormat[] = ['FOR_TIME', 'CHIPPER']

/** Config del cronómetro derivada del WOD (defaults por formato). */
export function wodToTimerConfig(wod: CfWod): WodFormatConfig {
  return {
    format: wod.format,
    durationSec: wod.durationSec ?? defaultDurationSec(wod.format),
    timeCapSec: wod.timeCapSec,
    rounds: wod.rounds,
    intervalWorkSec: wod.intervalWorkSec,
    intervalRestSec: wod.intervalRestSec,
  }
}

/** "7:42" / "90" → segundos; null si no parsea. */
export function parseTimeInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) { return null }
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p))
    if (parts.some((p) => !Number.isFinite(p) || p < 0) || parts.length > 3) { return null }
    // 2 partes = mm:ss; 3 partes = h:mm:ss.
    if (parts.length === 2) { return parts[0] * 60 + parts[1] }
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

interface ResultForm {
  scoreText: string
  time: string
  rounds: string
  reps: string
  rpe: string
  level: CfLevel
  scalingNotes: string
  notes: string
  standardModified: boolean
}

const EMPTY_FORM: ResultForm = {
  scoreText: '', time: '', rounds: '', reps: '', rpe: '', level: 'rx',
  scalingNotes: '', notes: '', standardModified: false,
}

const num = (v: string): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

function buildScoreText(f: ResultForm, fallbackSec: number | null): string {
  const trimmed = f.scoreText.trim()
  if (trimmed) { return trimmed }
  const rounds = num(f.rounds)
  const reps = num(f.reps)
  if (rounds || reps) {
    return [rounds ? `${rounds} rondas` : '', reps ? `${reps} reps` : ''].filter(Boolean).join(' + ')
  }
  if (fallbackSec !== null) { return formatClock(fallbackSec * 1000) }
  return ''
}

export default function CrossfitWod({ onNavigate }: { onNavigate?: (id: CrossfitSectionId) => void }) {
  const timer = useWodTimer()

  const [wods, setWods] = useState<CfWod[] | null>(null)
  const [todayWodId, setTodayWodId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [loaded, setLoaded] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ResultForm>(EMPTY_FORM)

  // Carga: WODs guardados + sesión de hoy.
  useEffect(() => {
    let alive = true
    Promise.all([listWods(), getScheduleByDate(todayKey())])
      .then(([list, schedule]) => {
        if (!alive) { return }
        const entry = schedule.find((s: CfScheduleEntry) => s.wodId)
        setWods(list)
        setTodayWodId(entry?.wodId ?? null)
        setLoaded(true)
      })
      .catch(() => { if (alive) { setWods([]); setLoaded(true) } })
    return () => { alive = false }
  }, [])

  const wodById = useMemo(() => new Map((wods ?? []).map((w) => [w.id, w])), [wods])
  const activeWod: CfWod | null = timer.wodId
    ? wodById.get(timer.wodId) ?? null
    : selectedId
      ? wodById.get(selectedId) ?? null
      : todayWodId
        ? wodById.get(todayWodId) ?? null
        : null

  // Auto-finalizar cuando el formato cumple (AMRAP/Tabata/EMOM/cap/intervalos).
  useEffect(() => {
    if (timer.phase === 'running' && timer.display?.done) { timer.finish() }
  }, [timer])

  // Al finalizar, prellenar el formulario de resultado con el tiempo real.
  useEffect(() => {
    if (timer.phase !== 'finished' || showForm) { return }
    const isTime = TIME_FORMATS.includes(timer.config?.format ?? 'FOR_TIME')
    setForm({
      ...EMPTY_FORM,
      time: isTime ? formatClock(timer.elapsedMs) : '',
      scoreText: isTime ? formatClock(timer.elapsedMs) : '',
    })
    setShowForm(true)
    setSavedMsg(null)
  }, [timer.phase, timer.elapsedMs, timer.config, showForm])

  const start = () => {
    if (!activeWod) { return }
    setError(null)
    setSavedMsg(null)
    setShowForm(false)
    setForm(EMPTY_FORM)
    timer.start(wodToTimerConfig(activeWod), activeWod.id)
  }

  const discard = () => {
    timer.cancel()
    setShowForm(false)
    setForm(EMPTY_FORM)
    setSavedMsg(null)
    setError(null)
  }

  const saveResult = async () => {
    if (!activeWod) { return }
    setError(null)
    const isTime = TIME_FORMATS.includes(activeWod.format)
    const parsedTime = parseTimeInput(form.time)
    if (isTime && form.time.trim() && parsedTime === null) {
      setError('Tiempo inválido: usá "7:42", "1:05:00" o segundos.')
      return
    }
    const fallbackSec = isTime && timer.phase !== 'idle' ? Math.round(timer.elapsedMs / 1000) : null
    const scoreText = buildScoreText(form, fallbackSec)
    if (!scoreText) {
      setError('Ingresá el resultado (tiempo, rondas o reps).')
      return
    }
    try {
      await newResult({
        wodId: activeWod.id,
        benchmarkId: activeWod.benchmarkId,
        wodName: activeWod.name,
        format: activeWod.format,
        level: form.level,
        scoreText,
        timeSec: parsedTime ?? fallbackSec ?? undefined,
        rounds: num(form.rounds),
        reps: num(form.reps),
        rpe: form.rpe ? Number(form.rpe) : undefined,
        scalingNotes: form.scalingNotes.trim() || undefined,
        notes: form.notes.trim() || undefined,
        isBenchmark: Boolean(activeWod.benchmarkId),
        standardModified: activeWod.benchmarkId ? form.standardModified : undefined,
      })
      setShowForm(false)
      setForm(EMPTY_FORM)
      timer.cancel()
      setSavedMsg(`Resultado de "${activeWod.name}" guardado.`)
    } catch {
      setError('No se pudo guardar el resultado. Probá de nuevo.')
    }
  }

  const display = timer.display
  const phaseLabel = display?.phase === 'rest' ? 'DESCANSO' : display?.phase === 'done' ? '¡TERMINADO!' : 'TRABAJO'

  // ── Estados sin WOD ────────────────────────────────────────────────
  if (!loaded) {
    return <p className="text-on-surface-variant text-sm py-8 text-center">Cargando WOD…</p>
  }

  if ((wods ?? []).length === 0) {
    return (
      <div className="space-y-3">
        <AltheaEmpty
          icon="exercise"
          title="Sin WODs todavía"
          description="Creá tu primer WOD en el constructor o programá una sesión con un WOD existente."
        />
        {onNavigate && (
          <div className="flex gap-2 justify-center">
            <AltheaButton type="button" onClick={() => onNavigate('constructor')}>Crear WOD</AltheaButton>
            <AltheaButton type="button" variant="secondary" onClick={() => onNavigate('programacion')}>Ir a programación</AltheaButton>
          </div>
        )}
      </div>
    )
  }

  const running = timer.phase === 'running' || timer.phase === 'paused'

  return (
    <div className="space-y-4">
      {/* Cronómetro / selección */}
      {running || timer.phase === 'finished' ? (
        <AltheaCard>
          <div className="space-y-4 text-center">
            <div>
              <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
                {activeWod?.name ?? 'Cronómetro'}
              </p>
              <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-primary" aria-live="polite">
                {timer.phase === 'finished' ? 'Finalizado' : phaseLabel}
              </p>
            </div>

            <p
              className="font-headline text-6xl sm:text-7xl font-semibold tabular-nums text-on-surface"
              role="timer"
              aria-label={`Tiempo: ${display ? formatClock(display.countdown ? display.phaseMs : timer.elapsedMs) : ''}`}
            >
              {display ? formatClock(display.countdown ? display.phaseMs : timer.elapsedMs) : '00:00'}
            </p>

            <div className="flex justify-center gap-2 flex-wrap" aria-hidden>
              <AltheaBadge>{activeWod?.format ?? ''}</AltheaBadge>
              {display?.totalRounds && (
                <AltheaBadge variant="secondary">Ronda {Math.min(display.round, display.totalRounds)}/{display.totalRounds}</AltheaBadge>
              )}
              {display && !display.countdown && display.phase !== 'done' && (
                <AltheaBadge variant="outline">Transcurrido</AltheaBadge>
              )}
              {display?.countdown && display.totalRemainingSec !== null && display.phase !== 'done' && (
                <AltheaBadge variant="outline">Restante {formatClock(display.totalRemainingSec * 1000)}</AltheaBadge>
              )}
            </div>

            {timer.phase === 'running' && (
              <div className="flex justify-center gap-2 flex-wrap">
                <AltheaButton type="button" variant="secondary" icon="pause" onClick={timer.pause}>Pausar</AltheaButton>
                <AltheaButton type="button" onClick={() => timer.finish()}>Finalizar</AltheaButton>
                {confirmCancel ? (
                  <AltheaButton type="button" variant="danger" onClick={() => { timer.cancel(); setConfirmCancel(false) }}>
                    Confirmar y descartar
                  </AltheaButton>
                ) : (
                  <AltheaButton type="button" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancelar</AltheaButton>
                )}
              </div>
            )}
            {timer.phase === 'paused' && (
              <div className="flex justify-center gap-2 flex-wrap">
                <AltheaButton type="button" icon="play_arrow" onClick={timer.resume}>Reanudar</AltheaButton>
                <AltheaButton type="button" onClick={() => timer.finish()}>Finalizar</AltheaButton>
                {confirmCancel ? (
                  <AltheaButton type="button" variant="danger" onClick={() => { timer.cancel(); setConfirmCancel(false) }}>
                    Confirmar y descartar
                  </AltheaButton>
                ) : (
                  <AltheaButton type="button" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancelar</AltheaButton>
                )}
              </div>
            )}
          </div>
        </AltheaCard>
      ) : (
        <AltheaCard>
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">WOD del día</p>
            {activeWod ? (
              <>
                <h2 className="font-headline text-lg font-semibold text-on-surface">{activeWod.name}</h2>
                <div className="flex flex-wrap gap-1.5">
                  <AltheaBadge>{activeWod.format}</AltheaBadge>
                  {activeWod.modalities.map((m) => <AltheaBadge key={m} variant="secondary">{m}</AltheaBadge>)}
                  <AltheaBadge variant="outline">{activeWod.level}</AltheaBadge>
                </div>

                <ul className="space-y-1.5">
                  {activeWod.movements.map((m) => (
                    <li key={`${m.order}-${m.name}`} className="flex justify-between gap-2 text-sm border-b border-outline-variant/40 pb-1.5">
                      <span className="text-on-surface">{m.order + 1}. {m.name}</span>
                      <span className="text-on-surface-variant text-right shrink-0">
                        {[m.reps ? `${m.reps} reps` : '', m.distanceM ? `${m.distanceM} m` : '', m.loadText ?? (m.loadKg ? `${m.loadKg} kg` : '')]
                          .filter(Boolean).join(' · ') || '—'}
                      </span>
                    </li>
                  ))}
                </ul>

                {activeWod.instructions.length > 0 && (
                  <ul className="text-sm text-on-surface-variant list-disc list-inside space-y-0.5">
                    {activeWod.instructions.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2 items-end pt-1">
                  <div className="flex-1 min-w-[200px]">
                    <AltheaSelect
                      label="Elegir otro WOD guardado"
                      value={selectedId || todayWodId || ''}
                      onChange={(e) => setSelectedId(e.target.value)}
                      options={(wods ?? []).map((w) => ({ value: w.id, label: w.name }))}
                    />
                  </div>
                  <AltheaButton type="button" icon="play_arrow" onClick={start} className="min-h-[44px]">
                    Iniciar cronómetro
                  </AltheaButton>
                  <AltheaButton
                    type="button"
                    variant="ghost"
                    onClick={() => { setShowForm(true); setSavedMsg(null); setForm(EMPTY_FORM) }}
                    className="min-h-[44px]"
                  >
                    Registrar sin cronómetro
                  </AltheaButton>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-on-surface-variant text-sm">
                  {todayWodId
                    ? 'La sesión de hoy referencia un WOD que ya no existe. Elegí otro abajo.'
                    : 'No hay WOD programado para hoy. Elegí uno de tus WODs guardados para ejecutarlo.'}
                </p>
                <AltheaSelect
                  label="Elegir WOD guardado"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  options={[{ value: '', label: '— Seleccioná un WOD —' }, ...(wods ?? []).map((w) => ({ value: w.id, label: w.name }))]}
                />
                <AltheaButton
                  type="button"
                  icon="play_arrow"
                  disabled={!selectedId}
                  onClick={start}
                  className="min-h-[44px]"
                >
                  Iniciar cronómetro
                </AltheaButton>
              </div>
            )}
          </div>
        </AltheaCard>
      )}

      {/* Resultado */}
      {showForm && activeWod && (
        <AltheaCard>
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
              Resultado — {activeWod.name}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <AltheaInput
                label="Marcador"
                value={form.scoreText}
                onChange={(e) => setForm({ ...form, scoreText: e.target.value })}
                placeholder={TIME_FORMATS.includes(activeWod.format) ? '7:42' : '8 rondas + 12 reps'}
                hint="Dejalo vacío para armarlo con tiempo/rondas/reps de abajo."
              />
              <AltheaInput
                label="Tiempo (mm:ss o segundos)"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                placeholder="7:42"
              />
              <AltheaInput
                label="Rondas" type="number" inputMode="numeric" min={1}
                value={form.rounds}
                onChange={(e) => setForm({ ...form, rounds: e.target.value })}
              />
              <AltheaInput
                label="Reps" type="number" inputMode="numeric" min={1}
                value={form.reps}
                onChange={(e) => setForm({ ...form, reps: e.target.value })}
              />
              <AltheaSelect
                label="Nivel de ejecución"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value as CfLevel })}
                options={LEVEL_OPTIONS}
              />
              <AltheaSelect
                label="RPE (esfuerzo percibido)"
                value={form.rpe}
                onChange={(e) => setForm({ ...form, rpe: e.target.value })}
                options={RPE_OPTIONS}
              />
            </div>

            <AltheaTextarea
              label="Escalado aplicado (opcional)"
              value={form.scalingNotes}
              onChange={(e) => setForm({ ...form, scalingNotes: e.target.value })}
              placeholder="Ej.: pull-ups con banda verde, 43/27 kg"
            />
            <AltheaTextarea
              label="Notas (opcional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Sensaciones, pausas, lesiones..."
            />

            {activeWod.benchmarkId && (
              <label className="flex items-center gap-2 min-h-[44px] text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={form.standardModified}
                  onChange={(e) => setForm({ ...form, standardModified: e.target.checked })}
                  className="w-5 h-5"
                />
                Modifiqué el estándar original del benchmark
              </label>
            )}

            {error && <p role="alert" className="text-sm text-error">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <AltheaButton type="button" onClick={saveResult}>Guardar resultado</AltheaButton>
              <AltheaButton type="button" variant="ghost" onClick={discard}>Descartar</AltheaButton>
            </div>
          </div>
        </AltheaCard>
      )}

      {savedMsg && <p role="status" className="text-sm text-secondary font-semibold">{savedMsg}</p>}

      {onNavigate && !running && timer.phase !== 'finished' && !showForm && (
        <div className="flex gap-2">
          <AltheaButton type="button" variant="ghost" onClick={() => onNavigate('programacion')} className="min-h-[44px]">
            Ver programación
          </AltheaButton>
          <AltheaButton type="button" variant="ghost" onClick={() => onNavigate('benchmarks')} className="min-h-[44px]">
            Benchmarks
          </AltheaButton>
        </div>
      )}
    </div>
  )
}