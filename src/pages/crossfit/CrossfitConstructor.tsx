import { useMemo, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaInput, AltheaSelect, AltheaTextarea } from '@/components/althea/AltheaInput'
import { CF_MOVEMENTS, findCfMovement } from '@/services/crossfit/cfMovementCatalog'
import { classifyModalities, sessionKindOf } from '@/services/crossfit/classify'
import { newScheduleEntry, newWod } from '@/services/crossfit/cfStore'
import type { CfFormat, CfModality, CfMovement } from '@/services/crossfit/types'

/**
 * Constructor de WOD: formatos reales (AMRAP, FOR Time, EMOM, Tabata,
 * Chipper, Interval), movimientos del catálogo con carga/reps/distancia,
 * clasificación G/M/W automática con override manual y alta opcional en la
 * programación de una fecha.
 */

const FORMAT_OPTIONS: { value: CfFormat; label: string }[] = [
  { value: 'AMRAP', label: 'AMRAP (máx rondas en el tiempo)' },
  { value: 'FOR_TIME', label: 'FOR TIME (contra reloj)' },
  { value: 'EMOM', label: 'EMOM (cada minuto)' },
  { value: 'TABATA', label: 'Tabata (20/10 × 8)' },
  { value: 'CHIPPER', label: 'Chipper (lista larga)' },
  { value: 'INTERVAL', label: 'Intervalos (trabajo/descanso)' },
]

const MODALITY_LABEL: Record<CfModality, string> = { G: 'Gimnasia', M: 'MetCon', W: 'Weightlifting' }

const MOVEMENT_OPTIONS = [
  { value: '', label: 'Elegir movimiento…' },
  ...CF_MOVEMENTS.map((m) => ({ value: m.id, label: `${m.name} (${m.modality})` })),
  { value: '__custom', label: 'Otro (escribir nombre)' },
]

interface DraftMovement extends CfMovement {
  /** clave local para React (los order se recalculan al guardar) */
  key: string
}

let seq = 0
const nextKey = () => `mv-${++seq}`

const num = (v: string): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export default function CrossfitConstructor() {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<CfFormat>('AMRAP')
  const [durationMin, setDurationMin] = useState('12')
  const [timeCapMin, setTimeCapMin] = useState('20')
  const [rounds, setRounds] = useState('5')
  const [intervalWorkSec, setIntervalWorkSec] = useState('30')
  const [intervalRestSec, setIntervalRestSec] = useState('30')
  const [objective, setObjective] = useState('')
  const [instructions, setInstructions] = useState('')

  const [picker, setPicker] = useState('')
  const [customName, setCustomName] = useState('')
  const [movements, setMovements] = useState<DraftMovement[]>([])

  const [manualOverride, setManualOverride] = useState(false)
  const [manualModalities, setManualModalities] = useState<CfModality[]>([])

  const [scheduleDate, setScheduleDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const autoModalities = useMemo(
    () => classifyModalities(movements.map((m) => m.name)),
    [movements],
  )
  const modalities = manualOverride ? manualModalities : autoModalities

  const equipment = useMemo(() => {
    const set = new Set<string>()
    for (const m of movements) {
      for (const e of findCfMovement(m.name)?.equipment ?? []) { set.add(e) }
    }
    return [...set]
  }, [movements])

  const addMovement = () => {
    setError(null)
    if (picker === '__custom') {
      const n = customName.trim()
      if (!n) { setError('Escribí el nombre del movimiento personalizado.'); return }
      setMovements((prev) => [...prev, { key: nextKey(), name: n, modality: classifyModalities([n])[0] ?? 'M', order: prev.length }])
      setCustomName('')
      setPicker('')
      return
    }
    const def = CF_MOVEMENTS.find((m) => m.id === picker)
    if (!def) { setError('Elegí un movimiento para agregar.'); return }
    setMovements((prev) => [...prev, { key: nextKey(), exerciseId: def.id, name: def.name, modality: def.modality, order: prev.length }])
    setPicker('')
  }

  const updateMovement = (key: string, patch: Partial<DraftMovement>) => {
    setMovements((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  const removeMovement = (key: string) => {
    setMovements((prev) => prev.filter((m) => m.key !== key).map((m, i) => ({ ...m, order: i })))
  }

  const moveMovement = (key: string, dir: -1 | 1) => {
    setMovements((prev) => {
      const idx = prev.findIndex((m) => m.key === key)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= prev.length) { return prev }
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((m, i) => ({ ...m, order: i }))
    })
  }

  const toggleManualModality = (m: CfModality) => {
    // Al primer click entra en modo manual sembrando con lo automático.
    setManualModalities((prev) => {
      const base = manualOverride ? prev : autoModalities
      return base.includes(m) ? base.filter((x) => x !== m) : [...base, m]
    })
    setManualOverride(true)
  }

  const resetForm = () => {
    setName('')
    setObjective('')
    setInstructions('')
    setMovements([])
    setManualOverride(false)
    setManualModalities([])
    setScheduleDate('')
  }

  const save = async (alsoSchedule: boolean) => {
    setError(null)
    setSavedMsg(null)
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Poné un nombre para el WOD.'); return }
    if (movements.length === 0) { setError('Agregá al menos un movimiento.'); return }
    if (manualOverride && manualModalities.length === 0) { setError('Elegí al menos una modalidad (G, M o W) o volvé a la clasificación automática.'); return }
    if (alsoSchedule && !scheduleDate) { setError('Elegí una fecha para programar el WOD.'); return }

    const durationSec = format === 'TABATA' ? 240 : num(durationMin) ? Number(durationMin) * 60 : undefined
    const capSec = format === 'TABATA' ? undefined : num(timeCapMin) ? Number(timeCapMin) * 60 : undefined

    setSaving(true)
    try {
      const wod = await newWod({
        name: trimmedName,
        format,
        objective: objective.trim(),
        modalities,
        modalitiesManual: manualOverride,
        durationSec: format === 'AMRAP' || format === 'EMOM' || format === 'TABATA' ? durationSec : undefined,
        timeCapSec: format === 'FOR_TIME' || format === 'CHIPPER' ? capSec : undefined,
        rounds: format === 'FOR_TIME' || format === 'CHIPPER' || format === 'INTERVAL' ? num(rounds) : undefined,
        intervalWorkSec: format === 'INTERVAL' ? num(intervalWorkSec) : undefined,
        intervalRestSec: format === 'INTERVAL' ? num(intervalRestSec) : undefined,
        movements: movements.map(({ key: _key, ...m }, i) => ({ ...m, order: i })),
        equipment,
        instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
        level: 'intermedio',
      })

      if (alsoSchedule) {
        await newScheduleEntry({ date: scheduleDate, kind: sessionKindOf(modalities), wodId: wod.id, title: wod.name })
        setSavedMsg(`"${wod.name}" guardado y programado para ${scheduleDate}.`)
      } else {
        setSavedMsg(`"${wod.name}" guardado en la biblioteca.`)
      }
      resetForm()
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const needsDuration = format === 'AMRAP' || format === 'EMOM'
  const needsCap = format === 'FOR_TIME' || format === 'CHIPPER'
  const needsRounds = format === 'FOR_TIME' || format === 'CHIPPER' || format === 'INTERVAL'

  return (
    <div className="space-y-4">
      <AltheaCard>
        <div className="space-y-3">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Datos del WOD</p>
          <AltheaInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder={'Ej.: Fran revisited'} maxLength={80} />
          <AltheaSelect label="Formato" value={format} onChange={(e) => setFormat(e.target.value as CfFormat)} options={FORMAT_OPTIONS} />
          <AltheaInput label="Objetivo (opcional)" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ej.: umbral aeróbico" maxLength={120} />

          <div className="grid gap-3 sm:grid-cols-3">
            {needsDuration && (
              <AltheaInput
                label={format === 'EMOM' ? 'Minutos totales' : 'Duración (min)'}
                type="number" inputMode="numeric" min={1} max={120}
                value={durationMin} onChange={(e) => setDurationMin(e.target.value)}
              />
            )}
            {needsCap && (
              <AltheaInput
                label="Time cap (min)" type="number" inputMode="numeric" min={1} max={180}
                value={timeCapMin} onChange={(e) => setTimeCapMin(e.target.value)}
              />
            )}
            {needsRounds && (
              <AltheaInput
                label="Rondas" type="number" inputMode="numeric" min={1} max={100}
                value={rounds} onChange={(e) => setRounds(e.target.value)}
              />
            )}
            {format === 'INTERVAL' && (
              <>
                <AltheaInput
                  label="Trabajo (seg)" type="number" inputMode="numeric" min={5} max={600}
                  value={intervalWorkSec} onChange={(e) => setIntervalWorkSec(e.target.value)}
                />
                <AltheaInput
                  label="Descanso (seg)" type="number" inputMode="numeric" min={5} max={600}
                  value={intervalRestSec} onChange={(e) => setIntervalRestSec(e.target.value)}
                />
              </>
            )}
            {format === 'TABATA' && (
              <p className="text-xs text-on-surface-variant self-end pb-2">8 rondas × (20 s trabajo / 10 s descanso) = 4 min fijos.</p>
            )}
          </div>
        </div>
      </AltheaCard>

      {/* Movimientos */}
      <AltheaCard>
        <div className="space-y-3">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Movimientos</p>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <AltheaSelect label="Agregar desde el catálogo" value={picker} onChange={(e) => setPicker(e.target.value)} options={MOVEMENT_OPTIONS} />
            </div>
            {picker === '__custom' && (
              <div className="flex-1 min-w-[180px]">
                <AltheaInput label="Nombre propio" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej.: Wall Walk" maxLength={60} />
              </div>
            )}
            <AltheaButton type="button" variant="secondary" onClick={addMovement} className="min-h-[44px]">Agregar</AltheaButton>
          </div>

          {movements.length === 0 ? (
            <p className="text-on-surface-variant text-sm">Sin movimientos todavía. Agregá desde el catálogo CrossFit (52 movimientos) o escribí uno propio.</p>
          ) : (
            <ul className="space-y-2">
              {movements.map((m, i) => (
                <li key={m.key} className="rounded-lg border border-outline-variant/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-on-surface-variant">{i + 1}.</span>
                      <span className="font-semibold text-on-surface truncate">{m.name}</span>
                      <AltheaBadge size="xs">{m.modality}</AltheaBadge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => moveMovement(m.key, -1)} disabled={i === 0} aria-label={`Subir ${m.name}`} className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant/60 text-on-surface-variant disabled:opacity-40">↑</button>
                      <button type="button" onClick={() => moveMovement(m.key, 1)} disabled={i === movements.length - 1} aria-label={`Bajar ${m.name}`} className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant/60 text-on-surface-variant disabled:opacity-40">↓</button>
                      <button type="button" onClick={() => removeMovement(m.key)} aria-label={`Quitar ${m.name}`} className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant/60 text-error">✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AltheaInput
                      label="Reps" type="number" inputMode="numeric" min={1}
                      value={m.reps ?? ''} onChange={(e) => updateMovement(m.key, { reps: num(e.target.value) })}
                    />
                    <AltheaInput
                      label="Distancia (m)" type="number" inputMode="numeric" min={1}
                      value={m.distanceM ?? ''} onChange={(e) => updateMovement(m.key, { distanceM: num(e.target.value) })}
                    />
                    <AltheaInput
                      label="Carga (kg)" type="number" inputMode="decimal" min={0} step="0.5"
                      value={m.loadKg ?? ''} onChange={(e) => updateMovement(m.key, { loadKg: e.target.value ? Number(e.target.value) : undefined })}
                    />
                    {format === 'EMOM' && (
                      <AltheaInput
                        label="Minuto" type="number" inputMode="numeric" min={1}
                        value={m.minute ?? ''} onChange={(e) => updateMovement(m.key, { minute: num(e.target.value) })}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AltheaCard>

      {/* Clasificación G/M/W */}
      <AltheaCard>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Clasificación G / M / W</p>
            <AltheaBadge variant={manualOverride ? 'warning' : 'primary'} size="xs">
              {manualOverride ? 'manual' : 'automática'}
            </AltheaBadge>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['G', 'M', 'W'] as CfModality[]).map((m) => {
              const on = modalities.includes(m)
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleManualModality(m)}
                  className={`min-h-[44px] px-4 rounded-lg border font-label-md text-label-md transition ${
                    on ? 'border-current bg-primary/10 text-primary font-semibold' : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {m} · {MODALITY_LABEL[m]}
                </button>
              )
            })}
            {manualOverride && (
              <button
                type="button"
                onClick={() => { setManualOverride(false); setManualModalities([]) }}
                className="min-h-[44px] px-4 rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface-variant"
              >
                Volver a automática
              </button>
            )}
          </div>

          <p className="text-xs text-on-surface-variant">
            {modalities.length === 0
              ? 'Sin movimientos: la clasificación aparece al agregar el primero.'
              : `Detectado: ${modalities.map((m) => `${m} (${MODALITY_LABEL[m]})`).join(' + ')}. La corregís con los botones si hace falta.`}
          </p>
          {equipment.length > 0 && (
            <p className="text-xs text-on-surface-variant">Equipo derivado: {equipment.join(', ')}</p>
          )}
        </div>
      </AltheaCard>

      {/* Instrucciones + programación */}
      <AltheaCard>
        <div className="space-y-3">
          <AltheaTextarea
            label="Instrucciones (una por línea, opcional)"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={'Calentar 10 min\n3 rondas de preparación\nEjecutar el WOD'}
          />
          <AltheaInput
            label="Programar en fecha (opcional)"
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
          />

          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          {savedMsg && <p role="status" className="text-sm text-secondary font-semibold">{savedMsg}</p>}

          <div className="flex flex-wrap gap-2">
            <AltheaButton type="button" onClick={() => save(false)} loading={saving} className="min-h-[44px]">
              Guardar WOD
            </AltheaButton>
            <AltheaButton type="button" variant="secondary" onClick={() => save(true)} disabled={saving} className="min-h-[44px]">
              Guardar y programar
            </AltheaButton>
          </div>
        </div>
      </AltheaCard>
    </div>
  )
}