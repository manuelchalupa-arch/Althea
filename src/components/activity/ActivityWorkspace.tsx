import { useState, useEffect, useCallback } from 'react'
import { activityCatalog, type Activity, type ActivityMetVariant } from '@/data/activityCatalog'
import {
  calculateCalorieExpenditure,
  calculateSessionLoad,
  getDefaultVariant,
  describeSessionRpe,
  supportsDistance,
  RPE_LEVELS,
} from '@/services/activity/activityDomain'
import {
  saveActivitySession,
  getActivityHistory,
  selectVariantBySpeed,
  type ActivitySessionRecord,
} from '@/services/activity/activityService'
import {
  getGpsTrackState,
  subscribeGpsTrack,
  startGpsTrack,
  pauseGpsTrack,
  resumeGpsTrack,
  stopGpsTrack,
  type GpsTrackSnapshot,
} from '@/services/activity/gpsTracker'
import { db } from '@/services/storage/db'
import { AltheaCard, AltheaCardHeader, AltheaButton, AltheaSelect, AltheaInput } from '@/components/althea'
import SemanticIcon from '@/components/ui/SemanticIcon'

const SPEED_ACTIVITIES = new Set(['caminar', 'trotar', 'correr', 'bicicleta_exterior', 'bicicleta_fija'])

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface ActivityWorkspaceProps {
  /** Llamado tras guardar correctamente (el modal puede mostrar confirmación propia). */
  onSaved?: () => void
}

export default function ActivityWorkspace({ onSaved }: ActivityWorkspaceProps) {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [variant, setVariant] = useState<ActivityMetVariant | null>(null)
  const [date, setDate] = useState(todayLocal())
  const [time, setTime] = useState(nowTime())
  const [duration, setDuration] = useState(30)
  const [rpe, setRpe] = useState<number>(3)
  const [notes, setNotes] = useState('')
  const [weightKg, setWeightKg] = useState<number | null>(null)
  const [history, setHistory] = useState<ActivitySessionRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [savedSummary, setSavedSummary] = useState<string | null>(null)
  const [track, setTrack] = useState<GpsTrackSnapshot>(() => getGpsTrackState())
  const [trackNotice, setTrackNotice] = useState<string | null>(null)
  const [trackDistance, setTrackDistance] = useState<number | null>(null)
  const [gpsKm, setGpsKm] = useState<number | null>(null)
  const [distanceKm, setDistanceKm] = useState('')
  const [distanceOrigin, setDistanceOrigin] = useState<'manual' | 'machine'>('manual')
  const [incline, setIncline] = useState('')
  const [watts, setWatts] = useState('')
  const [machineKcal, setMachineKcal] = useState('')

  useEffect(() => {
    db.userProfile.get('me').then(p => {
      if (p?.weightKg && p.weightKg > 0) { setWeightKg(p.weightKg) }
    }).catch(() => {})
    getActivityHistory().then(setHistory).catch(() => {})
    return subscribeGpsTrack(setTrack)
  }, [])

  useEffect(() => {
    if (activity && (!variant || !activity.variants.some(v => v.id === variant.id))) {
      setVariant(getDefaultVariant(activity))
    }
  }, [activity, variant])

  // Variante automática por velocidad (solo actividades con variantes por velocidad).
  useEffect(() => {
    if (!activity || !SPEED_ACTIVITIES.has(activity.id)) { return }
    if (track.speedKmh === null || track.status === 'idle') { return }
    const auto = selectVariantBySpeed(activity, track.speedKmh)
    if (auto) {
      const v = activity.variants.find(x => x.id === auto)
      if (v && v.id !== variant?.id) { setVariant(v) }
    }
  }, [activity, track.speedKmh, track.status, variant?.id])

  // Tiqueo del cronómetro visible mientras graba.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (track.status !== 'active') { return }
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [track.status])

  const handleStartGps = useCallback(() => {
    if (!activity) { return }
    setTrackNotice(null)
    setError(null)
    try {
      startGpsTrack(activity.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el GPS')
    }
  }, [activity])

  const handlePauseGps = useCallback(() => {
    pauseGpsTrack()
    setTrackNotice('Seguimiento en pausa: el tiempo detenido no cuenta. Podés cerrar esta ventana sin perder lo registrado.')
  }, [])

  const handleFinishGps = useCallback(() => {
    const summary = stopGpsTrack()
    const minutes = Math.max(1, Math.round(summary.activeSeconds / 60))
    setDuration(minutes)
    setTrackDistance(summary.distanceMeters > 0 ? summary.distanceMeters : null)
    // La distancia GPS válida tiene prioridad y se indica como tal.
    setGpsKm(summary.distanceMeters > 0 ? Math.round((summary.distanceMeters / 1000) * 100) / 100 : null)
    setTrackNotice(null)
  }, [])

  const handleActivityChange = useCallback((next: Activity | null) => {
    const t = getGpsTrackState()
    if (t.status !== 'idle' && t.activityId && next && t.activityId !== next.id) {
      pauseGpsTrack()
      setTrackNotice('Se pausó el seguimiento al cambiar de actividad. Reanudalo o finalizalo cuando quieras.')
    }
    setActivity(next)
    setVariant(null)
  }, [])

  const energy = activity && variant
    ? calculateCalorieExpenditure(activity, duration, weightKg, variant.id)
    : null
  const load = calculateSessionLoad(duration, rpe)

  const canSave = !!activity && !!variant && duration > 0 && !!date && !!time && !saving

  const handleSave = async () => {
    if (!activity || !variant) { return }
    setSaving(true)
    setError(null)
    setSaved(false)
    setSavedSummary(null)
    try {
      const startedAt = new Date(`${date}T${time}:00`)
      const manualKm = Number(String(distanceKm).replace(',', '.'))
      const hasManualKm = supportsDistance(activity.id) && Number.isFinite(manualKm) && manualKm > 0
      const useGpsKm = gpsKm !== null && gpsKm > 0
      const inclineNum = Number(String(incline).replace(',', '.'))
      const wattsNum = Number(String(watts).replace(',', '.'))
      const machineKcalNum = Number(String(machineKcal).replace(',', '.'))
      const rec = await saveActivitySession({
        activityId: activity.id,
        calendarDate: date,
        startedAt: startedAt.toISOString(),
        durationMinutes: duration,
        distanceMeters: trackDistance ?? undefined,
        distanceKm: useGpsKm ? gpsKm : (hasManualKm ? Math.round(manualKm * 100) / 100 : null),
        distanceSource: useGpsKm ? 'gps' : (hasManualKm ? distanceOrigin : null),
        weightKg,
        variantId: variant.id,
        sessionRpe: rpe,
        inclinePercent: activity.id === 'cinta_correr' && Number.isFinite(inclineNum) && inclineNum >= 0 ? inclineNum : null,
        powerWatts: activity.id === 'bicicleta_fija' && Number.isFinite(wattsNum) && wattsNum > 0 ? Math.round(wattsNum) : null,
        machineKcal: Number.isFinite(machineKcalNum) && machineKcalNum > 0 ? Math.round(machineKcalNum) : null,
        notes: notes.trim() || undefined,
      })
      const hist = await getActivityHistory()
      setHistory(hist)
      const parts = [`${rec.durationMinutes} min`]
      if (rec.distanceKm) { parts.push(`${rec.distanceKm} km (${rec.distanceSource === 'gps' ? 'GPS' : rec.distanceSource === 'machine' ? 'máquina' : 'manual'})`) }
      if (rec.grossKcal !== null && rec.grossKcal !== undefined) {
        parts.push(`${Math.round(rec.grossKcal)} kcal brutas`)
        if (rec.activeKcal !== null && rec.activeKcal !== undefined) { parts.push(`${Math.round(rec.activeKcal)} kcal activas`) }
        if (rec.calorieMethod) { parts.push(`método ${rec.calorieMethod === 'MET' ? 'MET' : rec.calorieMethod === 'ACSM_WALK' ? 'ACSM caminata' : 'ACSM carrera'}`) }
      } else {
        parts.push('gasto no disponible')
      }
      if (rec.machineKcal) { parts.push(`máquina: ${rec.machineKcal} kcal (declaradas, no sumadas)`) }
      setSavedSummary(parts.join(' · '))
      setNotes('')
      setRpe(3)
      setTrackDistance(null)
      setGpsKm(null)
      setDistanceKm('')
      setIncline('')
      setWatts('')
      setMachineKcal('')
      setSaved(true)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la sesión')
    } finally {
      setSaving(false)
    }
  }

  const tracking = track.status !== 'idle'
  const selectedRpe = RPE_LEVELS.find((l) => l.value === rpe)

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {saved && (
        <div role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Sesión guardada en tu historial.
          {savedSummary && <span className="block mt-1 text-on-surface-variant">{savedSummary}</span>}
        </div>
      )}

      <AltheaCard padding="md">
        <AltheaCardHeader title="Actividad" subtitle="Elegí qué vas a hacer" icon="fitness_center" />
        <div className="space-y-4">
          <AltheaSelect
            label="Actividad"
            value={activity?.id ?? ''}
            onChange={e => handleActivityChange(activityCatalog.find(x => x.id === e.target.value) ?? null)}
            options={[
              { value: '', label: 'Seleccionar actividad' },
              ...activityCatalog.map(a => ({ value: a.id, label: a.nombre })),
            ]}
          />

          {activity && (
            <AltheaSelect
              label="Variante / intensidad"
              value={variant?.id ?? ''}
              onChange={e => setVariant(activity.variants.find(v => v.id === e.target.value) ?? null)}
              options={activity.variants.map(v => ({ value: v.id, label: `${v.label} (${v.met} MET)` }))}
            />
          )}

          {variant?.estimated && (
            <p className="text-xs text-on-surface-variant flex items-start gap-1.5">
              <SemanticIcon name="info" size={14} className="shrink-0 mt-0.5" />
              Valor estimado por proximidad — no es una medición directa del Compendium.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <AltheaInput
              label="Fecha"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={todayLocal()}
            />
            <AltheaInput
              label="Hora"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>

          <AltheaInput
            label="Duración (minutos)"
            type="number"
            min={1}
            max={600}
            value={duration}
            onChange={e => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
          />

          {activity && supportsDistance(activity.id) && (
            <div className="space-y-3">
              {gpsKm !== null ? (
                <p className="text-xs text-on-surface-variant" role="status">
                  Distancia GPS: {gpsKm} km (tiene prioridad sobre la manual).
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <AltheaInput
                    label="Distancia (km, opcional)"
                    type="number"
                    min={0}
                    step="0.1"
                    value={distanceKm}
                    onChange={e => setDistanceKm(e.target.value)}
                    placeholder="Ej: 5"
                  />
                  <AltheaSelect
                    label="Origen"
                    value={distanceOrigin}
                    onChange={e => setDistanceOrigin(e.target.value === 'machine' ? 'machine' : 'manual')}
                    options={[
                      { value: 'manual', label: 'Manual' },
                      { value: 'machine', label: 'Máquina' },
                    ]}
                  />
                </div>
              )}
              {activity.id === 'cinta_correr' && (
                <div>
                  <AltheaInput
                    label="Pendiente (%) — opcional, 0 si no la conocés"
                    type="number"
                    min={0}
                    max={40}
                    step="0.5"
                    value={incline}
                    onChange={e => setIncline(e.target.value)}
                    placeholder="Ej: 2"
                  />
                  <p className="text-xs text-on-surface-variant mt-1">
                    Con distancia y pendiente se usa la ecuación ACSM dentro de su rango; si no, MET.
                  </p>
                </div>
              )}
              {activity.id === 'bicicleta_fija' && (
                <div>
                  <AltheaInput
                    label="Potencia (W, opcional)"
                    type="number"
                    min={0}
                    max={2000}
                    step="1"
                    value={watts}
                    onChange={e => {
                      const v = e.target.value
                      setWatts(v)
                      const w = Number(v)
                      if (Number.isFinite(w) && w > 0) {
                        const sug = w < 150 ? 'moderado' : 'vigoroso'
                        const sv = activity.variants.find(x => x.id === sug)
                        if (sv) { setVariant(sv) }
                      }
                    }}
                    placeholder="Ej: 150"
                  />
                  <p className="text-xs text-on-surface-variant mt-1">
                    Referencia: ~100 W moderado, ~200 W vigoroso. Podés ajustar la variante igual.
                  </p>
                </div>
              )}
              <div>
                <AltheaInput
                  label="Kcal según máquina (opcional)"
                  type="number"
                  min={0}
                  step="1"
                  value={machineKcal}
                  onChange={e => setMachineKcal(e.target.value)}
                  placeholder="Lo que mostró la máquina"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  Declaradas por vos; no se suman a la estimación de Althea.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-aux" id="rpe-label">Esfuerzo percibido (1–5)</span>
            <div role="group" aria-labelledby="rpe-label" className="grid grid-cols-5 gap-1.5">
              {RPE_LEVELS.map((l) => {
                const selected = l.value === rpe
                return (
                  <button
                    key={l.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Esfuerzo ${l.value}: ${l.description}`}
                    onClick={() => setRpe(l.value)}
                    className={`${l.color} rounded-lg min-h-[44px] font-mono text-sm font-bold flex items-center justify-center transition
                      ${l.value >= 2 ? 'text-black' : 'text-white'}
                      ${selected ? 'ring-2 ring-offset-2 ring-primary ring-offset-surface scale-105' : 'opacity-80 hover:opacity-100'}`}
                  >
                    {l.value}
                  </button>
                )
              })}
            </div>
            {selectedRpe && (
              <p className="text-xs text-on-surface-variant" role="status">
                {selectedRpe.value} · {selectedRpe.description}
              </p>
            )}
          </div>

          {weightKg && (
            <p className="text-xs text-on-surface-variant">
              Peso corporal: {weightKg} kg
            </p>
          )}

          {activity && SPEED_ACTIVITIES.has(activity.id) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {track.status === 'idle' && (
                  <AltheaButton variant="primary" size="sm" icon="play_arrow" onClick={handleStartGps}>
                    Iniciar GPS
                  </AltheaButton>
                )}
                {track.status === 'active' && (
                  <>
                    <AltheaButton variant="secondary" size="sm" icon="pause" onClick={handlePauseGps}>
                      Pausar
                    </AltheaButton>
                    <AltheaButton variant="primary" size="sm" icon="check" onClick={handleFinishGps}>
                      Finalizar
                    </AltheaButton>
                  </>
                )}
                {track.status === 'paused' && (
                  <>
                    <AltheaButton variant="primary" size="sm" icon="play_arrow" onClick={() => { setTrackNotice(null); try { resumeGpsTrack() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reanudar') } }}>
                      Reanudar
                    </AltheaButton>
                    <AltheaButton variant="secondary" size="sm" icon="check" onClick={handleFinishGps}>
                      Finalizar
                    </AltheaButton>
                  </>
                )}
                {tracking && (
                  <span className="text-sm text-on-surface font-mono" aria-live="polite">
                    {formatElapsed(track.activeSeconds)}
                    {track.distanceMeters > 0 ? ` · ${(track.distanceMeters / 1000).toFixed(2)} km` : ''}
                    {track.speedKmh !== null ? ` · ${track.speedKmh.toFixed(1)} km/h` : ''}
                  </span>
                )}
              </div>
              {trackNotice && (
                <p className="text-xs text-on-surface-variant" role="status">{trackNotice}</p>
              )}
              {!tracking && (
                <p className="text-xs text-on-surface-variant">
                  El GPS ajusta la variante según tu velocidad. Podés cerrar esta ventana: la sesión en curso se conserva.
                </p>
              )}
            </div>
          )}

          <AltheaInput
            label="Notas (opcional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ej: partido con amigos, sensación buena…"
          />
        </div>
      </AltheaCard>

      {activity && variant && energy && (
        <AltheaCard padding="md">
          <AltheaCardHeader title="Resumen estimado" subtitle="Cálculo en vivo con los datos ingresados" icon="insights" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-headline-md text-xl text-on-surface font-semibold">{duration}</p>
              <p className="text-aux">minutos</p>
            </div>
            <div>
              <p className="font-headline-md text-xl text-on-surface font-semibold">
                {energy.calories !== null ? Math.round(energy.calories) : '—'}
              </p>
              <p className="text-aux">kcal brutas</p>
            </div>
            <div>
              <p className="font-headline-md text-xl text-on-surface font-semibold">
                {load !== null ? load : '—'}
              </p>
              <p className="text-aux">carga (RPE×min)</p>
            </div>
          </div>
          {energy.formula && (
            <p className="text-xs text-on-surface-variant mt-3 font-mono">{energy.formula}</p>
          )}
          {energy.netCalories !== null && (
            <p className="text-xs text-on-surface-variant mt-1">
              Activas estimadas: {Math.round(energy.netCalories)} kcal (descuentan reposo).
            </p>
          )}
          {energy.calories === null && (
            <p className="text-xs text-on-surface-variant mt-2">Sin peso corporal no se estiman calorías.</p>
          )}
        </AltheaCard>
      )}

      <div className="flex justify-end">
        <AltheaButton
          variant="primary"
          size="lg"
          icon="check"
          disabled={!canSave}
          loading={saving}
          onClick={handleSave}
        >
          Guardar sesión
        </AltheaButton>
      </div>

      {history.length > 0 && (
        <AltheaCard padding="md">
          <AltheaCardHeader title="Historial" subtitle={`${history.length} sesión${history.length !== 1 ? 'es' : ''} registrada${history.length !== 1 ? 's' : ''}`} icon="history" />
          <div className="space-y-2">
            {history.slice(0, 20).map(h => {
              const rpeDesc = describeSessionRpe(h.sessionRpe)
              return (
                <div key={h.id} className="flex items-center justify-between gap-3 py-2 border-b border-outline-variant/30 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body-md text-sm text-on-surface font-medium truncate">
                      {h.activityName}
                      {h.variantLabel ? ` · ${h.variantLabel}` : ''}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {h.calendarDate} {h.startedAt ? new Date(h.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      {h.durationMinutes ? ` · ${h.durationMinutes} min` : ''}
                      {h.sessionRpe !== null && h.sessionRpe !== undefined ? ` · RPE ${h.sessionRpe}${rpeDesc ? ` (${rpeDesc})` : ''}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm text-secondary font-semibold">
                      {h.grossKcal !== null && h.grossKcal !== undefined ? `${Math.round(h.grossKcal)} kcal` : 'sin kcal'}
                    </p>
                    {h.sessionLoad !== null && h.sessionLoad !== undefined && (
                      <p className="text-xs text-on-surface-variant">carga {h.sessionLoad}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </AltheaCard>
      )}
    </div>
  )
}
