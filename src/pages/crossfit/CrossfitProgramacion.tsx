import { useEffect, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaSelect, AltheaTextarea } from '@/components/althea/AltheaInput'
import {
  deleteScheduleEntry,
  getScheduleByDate,
  listScheduleRange,
  listWods,
  newScheduleEntry,
  saveScheduleEntry,
} from '@/services/crossfit/cfStore'
import type { CfScheduleEntry, CfSessionKind, CfWod } from '@/services/crossfit/types'
import { addDaysToKey, todayKey, weekStartKey, weekdayOfKey } from '@/utils/dates'

// ---------- Funciones puras (exportadas para testear) ----------

export function isTrainingKind(kind: CfSessionKind): boolean {
  return kind !== 'rest' && kind !== 'recovery'
}

/** Cantidad de días con sesión de entrenamiento (excluye rest y recovery). */
export function countTrainingDays(entries: CfScheduleEntry[]): number {
  return entries.filter((e) => isTrainingKind(e.kind)).length
}

/** Racha más larga de días CALENDARIO consecutivos con entrenamiento. Un día libre o de descanso corta la racha. */
export function longestTrainingStreak(entries: CfScheduleEntry[]): number {
  const trainingDates = new Set(entries.filter((e) => isTrainingKind(e.kind)).map((e) => e.date))
  if (trainingDates.size === 0) { return 0 }
  const dates = [...trainingDates].sort()
  let best = 0
  let run = 0
  let cursor = dates[0]
  const last = dates[dates.length - 1]
  while (cursor <= last) {
    if (trainingDates.has(cursor)) {
      run += 1
      if (run > best) { best = run }
    } else {
      run = 0
    }
    cursor = addDaysToKey(cursor, 1)
  }
  return best
}

export type CfPattern = '3:1' | '5:2'

export interface CfPatternDay {
  date: string
  kind: CfSessionKind
  title?: string
}

/** Índices (0=lun…6=dom) que son descanso en cada modelo. */
const PATTERN_REST_IDX: Record<CfPattern, number[]> = {
  '3:1': [3, 6],
  '5:2': [5, 6],
}

/**
 * Programa la semana visible con el modelo elegido, SIN pisar días que ya
 * tienen entrada: solo devuelve días "libres". El entreno generado es kind 'M'
 * con título "Entrenamiento" (sin WOD: se edita después a mano).
 */
export function planPattern(weekStart: string, pattern: CfPattern, existing: CfScheduleEntry[]): CfPatternDay[] {
  const taken = new Set(existing.map((e) => e.date))
  const restIdx = PATTERN_REST_IDX[pattern]
  const plan: CfPatternDay[] = []
  for (let i = 0; i < 7; i += 1) {
    const date = addDaysToKey(weekStart, i)
    if (taken.has(date)) { continue }
    if (restIdx.includes(i)) {
      plan.push({ date, kind: 'rest' })
    } else {
      plan.push({ date, kind: 'M', title: 'Entrenamiento' })
    }
  }
  return plan
}

/**
 * Avisos honestos de sobrecarga para la semana visible, comparada con la
 * anterior: (a) racha de 4+ días, (b) 6+ días de entreno, (c) arranque
 * acumulado (semana anterior con 5+ y actual con 3+ hasta el jueves).
 */
export function overloadWarnings(prevWeek: CfScheduleEntry[], currentWeek: CfScheduleEntry[]): string[] {
  const out: string[] = []
  const streak = longestTrainingStreak(currentWeek)
  if (streak >= 4) {
    out.push(`Llevás ${streak} días seguidos de entrenamiento: considerá meter un día de descanso antes de seguir sumando.`)
  }
  const count = countTrainingDays(currentWeek)
  if (count >= 6) {
    out.push(`Esta semana tenés ${count} días de entrenamiento: es un volumen alto para una sola semana.`)
  }
  const prevCount = countTrainingDays(prevWeek)
  if (currentWeek.length > 0 && prevCount >= 5) {
    const first = [...currentWeek].sort((a, b) => a.date.localeCompare(b.date))[0]
    const jueves = addDaysToKey(weekStartKey(first.date), 3)
    const thruJueves = countTrainingDays(currentWeek.filter((e) => e.date <= jueves))
    if (thruJueves >= 3) {
      out.push(`Semana pasada entrenaste ${prevCount} días y ya llevás ${thruJueves} hasta el jueves: cuidado con el acumulado.`)
    }
  }
  return out
}

// ---------- Etiquetas y fechas ----------

const KIND_BADGE: Record<CfSessionKind, string> = {
  G: 'G',
  M: 'M',
  W: 'W',
  'G+M': 'G+M',
  'G+W': 'G+W',
  'M+W': 'M+W',
  'G+M+W': 'G+M+W',
  recovery: 'Recuperación',
  rest: 'Descanso',
}

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'G', label: 'G · Gimnasia' },
  { value: 'M', label: 'M · MetCon' },
  { value: 'W', label: 'W · Weightlifting' },
  { value: 'G+M', label: 'G+M · Gimnasia + MetCon' },
  { value: 'G+W', label: 'G+W · Gimnasia + Weightlifting' },
  { value: 'M+W', label: 'M+W · MetCon + Weightlifting' },
  { value: 'G+M+W', label: 'G+M+W · Las tres modalidades' },
  { value: 'recovery', label: 'Recuperación' },
  { value: 'rest', label: 'Descanso' },
]

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fmtDayFull(key: string): string {
  const dia = Number(key.slice(8, 10))
  const mes = MESES[Number(key.slice(5, 7)) - 1]
  return `${DIAS_LARGOS[(weekdayOfKey(key) + 6) % 7]} ${dia} de ${mes}`
}

function fmtWeekLabel(start: string): string {
  const end = addDaysToKey(start, 6)
  const d1 = Number(start.slice(8, 10))
  const d2 = Number(end.slice(8, 10))
  const m1 = MESES[Number(start.slice(5, 7)) - 1]
  const m2 = MESES[Number(end.slice(5, 7)) - 1]
  return m1 === m2
    ? `Semana del ${d1} al ${d2} de ${m1}`
    : `Semana del ${d1} de ${m1} al ${d2} de ${m2}`
}

interface DayPanel {
  date: string
  existing: CfScheduleEntry | null
  kind: CfSessionKind
  wodId: string
  title: string
  notes: string
}

/**
 * Sección "Programación": calendario semanal (lun→dom) con alta/edición de
 * sesiones por día, generadores de los modelos 3:1 y 5:2 que solo llenan días
 * libres, y avisos honestos de sobrecarga. Solo datos reales de cfSchedule.
 */
export default function CrossfitProgramacion() {
  const [weekStart, setWeekStart] = useState(() => weekStartKey(todayKey()))
  const [reloadKey, setReloadKey] = useState(0)
  const [entries, setEntries] = useState<CfScheduleEntry[] | null>(null)
  const [prevEntries, setPrevEntries] = useState<CfScheduleEntry[]>([])
  const [wods, setWods] = useState<CfWod[]>([])
  const [panel, setPanel] = useState<DayPanel | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    let alive = true
    listWods()
      .then((rows) => { if (alive) { setWods(rows) } })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setEntries(null)
    Promise.all([
      listScheduleRange(weekStart, addDaysToKey(weekStart, 6)),
      listScheduleRange(addDaysToKey(weekStart, -7), addDaysToKey(weekStart, -1)),
    ])
      .then(([cur, prev]) => {
        if (alive) { setEntries(cur); setPrevEntries(prev) }
      })
      .catch(() => { if (alive) { setEntries([]); setPrevEntries([]) } })
    return () => { alive = false }
  }, [weekStart, reloadKey])

  const reload = () => { setReloadKey((k) => k + 1) }

  async function openDay(date: string): Promise<void> {
    setConfirmDelete(false)
    const rows = await getScheduleByDate(date).catch(() => [] as CfScheduleEntry[])
    const e = rows[0] ?? null
    setPanel({
      date,
      existing: e,
      kind: e?.kind ?? 'M',
      wodId: e?.wodId ?? '',
      title: e?.title ?? '',
      notes: e?.notes ?? '',
    })
  }

  async function guardar(): Promise<void> {
    if (!panel) { return }
    setBusy(true)
    const payload = {
      kind: panel.kind,
      wodId: panel.wodId || undefined,
      title: panel.title.trim() || undefined,
      notes: panel.notes.trim() || undefined,
    }
    try {
      if (panel.existing) {
        await saveScheduleEntry({ ...panel.existing, ...payload })
      } else {
        await newScheduleEntry({ date: panel.date, ...payload })
      }
      setMsg(`Sesión guardada para el ${fmtDayFull(panel.date)}.`)
      setPanel(null)
      setConfirmDelete(false)
    } catch {
      setMsg('No se pudo guardar la sesión. Probá de nuevo.')
    } finally {
      setBusy(false)
      reload()
    }
  }

  async function eliminar(): Promise<void> {
    if (!panel?.existing) { return }
    setBusy(true)
    try {
      await deleteScheduleEntry(panel.existing.id)
      setMsg('Sesión eliminada.')
      setPanel(null)
      setConfirmDelete(false)
    } catch {
      setMsg('No se pudo eliminar la sesión. Probá de nuevo.')
    } finally {
      setBusy(false)
      reload()
    }
  }

  async function generar(pattern: CfPattern): Promise<void> {
    if (!entries) { return }
    setBusy(true)
    const plan = planPattern(weekStart, pattern, entries)
    try {
      for (const day of plan) {
        await newScheduleEntry({ date: day.date, kind: day.kind, title: day.title })
      }
      if (plan.length === 0) {
        setMsg('No había días libres: la semana ya está programada.')
      } else {
        const train = plan.filter((d) => isTrainingKind(d.kind)).length
        setMsg(`Se crearon ${plan.length} sesiones: ${train} de entreno y ${plan.length - train} de descanso.`)
      }
    } catch {
      setMsg('No se pudo generar la programación. Probá de nuevo.')
    } finally {
      setBusy(false)
      reload()
    }
  }

  const today = todayKey()
  const wodById = new Map(wods.map((w) => [w.id, w]))
  const byDate = new Map<string, CfScheduleEntry>()
  for (const e of entries ?? []) {
    if (!byDate.has(e.date)) { byDate.set(e.date, e) }
  }
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i))
  const warnings = entries ? overloadWarnings(prevEntries, entries) : []

  return (
    <div className="space-y-4">
      {/* Navegación de semanas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-xl font-semibold text-on-surface">{fmtWeekLabel(weekStart)}</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => setWeekStart(addDaysToKey(weekStart, -7))}
            className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant px-2 font-label-md text-label-md text-on-surface"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Volver a la semana de hoy"
            onClick={() => setWeekStart(weekStartKey(todayKey()))}
            className="min-h-[44px] rounded-lg border border-outline-variant px-3 font-label-md text-label-md text-on-surface"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Semana siguiente"
            onClick={() => setWeekStart(addDaysToKey(weekStart, 7))}
            className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant px-2 font-label-md text-label-md text-on-surface"
          >
            →
          </button>
        </div>
      </div>

      {/* Mensajes de estado (guardado / generación) */}
      <div role="status" className="min-h-[20px] text-sm text-on-surface">{msg}</div>

      {/* Avisos de sobrecarga */}
      {warnings.length > 0 && (
        <div className="space-y-2 rounded-xl border border-tertiary/40 bg-tertiary/5 p-3.5">
          <AltheaBadge variant="warning" icon="warning">Aviso de sobrecarga</AltheaBadge>
          {warnings.map((w) => (
            <p key={w} className="text-sm text-on-surface">{w}</p>
          ))}
        </div>
      )}

      {/* Modelos 3:1 y 5:2 */}
      <div className="flex flex-wrap gap-2">
        <AltheaButton
          variant="secondary"
          className="min-h-[44px]"
          aria-label="Generar programación modelo 3:1 para la semana visible"
          disabled={busy}
          onClick={() => void generar('3:1')}
        >
          Modelo 3:1
        </AltheaButton>
        <AltheaButton
          variant="secondary"
          className="min-h-[44px]"
          aria-label="Generar programación modelo 5:2 para la semana visible"
          disabled={busy}
          onClick={() => void generar('5:2')}
        >
          Modelo 5:2
        </AltheaButton>
      </div>
      <p className="text-xs text-on-surface-variant">
        3:1 = tres días de entreno y uno de descanso, arrancando el lunes. 5:2 = de lunes a viernes entreno,
        fin de semana descanso. Solo llenan los días libres: los que ya tienen sesión no se tocan.
      </p>

      {/* Calendario semanal */}
      {entries === null ? (
        <p className="text-on-surface-variant text-sm py-8 text-center">Cargando datos…</p>
      ) : (
        <div role="group" aria-label={fmtWeekLabel(weekStart)} className="space-y-1.5">
          <div className="hidden sm:grid sm:grid-cols-7 gap-1.5" aria-hidden="true">
            {DIAS_CORTOS.map((d) => (
              <div key={d} className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant text-center py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
            {weekDates.map((date, i) => {
              const e = byDate.get(date)
              const isToday = date === today
              const wod = e?.wodId ? wodById.get(e.wodId) : undefined
              const texto = e ? (e.title ?? wod?.name ?? '') : ''
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => void openDay(date)}
                  aria-label={`${e ? 'Editar sesión del' : 'Programar sesión del'} ${fmtDayFull(date)}`}
                  className={`min-h-[44px] sm:min-h-[92px] w-full rounded-xl border p-2 flex flex-col gap-1 text-left transition ${
                    isToday ? 'border-primary/70 bg-primary/5' : 'border-outline-variant'
                  } ${panel?.date === date ? 'ring-2 ring-primary' : ''}`}
                  // inline gana sobre la regla base de <button> que en este tema
                  // pisa las utilities de Tailwind (fondo oscuro en celdas claras).
                  style={isToday ? undefined : { backgroundColor: 'var(--c-surface-container)' }}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
                      <span className="sm:hidden">{DIAS_CORTOS[i]} </span>
                      {Number(date.slice(8, 10))}
                    </span>
                    {isToday && (
                      <span className="font-label-caps text-[9px] uppercase tracking-widest text-primary">Hoy</span>
                    )}
                  </span>
                  {e ? (
                    <>
                      <AltheaBadge
                        variant={isTrainingKind(e.kind) ? 'primary' : 'outline'}
                        size="xs"
                      >
                        {KIND_BADGE[e.kind]}
                      </AltheaBadge>
                      {texto && <span className="text-xs text-on-surface truncate">{texto}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-on-surface-variant">libre</span>
                  )}
                </button>
              )
            })}
          </div>

          {entries.length === 0 && (
            <AltheaEmpty
              icon="calendar_month"
              title="Semana sin programar"
              description="Todavía no cargaste sesiones para esta semana. Hacé clic en un día para programar, o usá los modelos 3:1 o 5:2."
            />
          )}
        </div>
      )}

      {/* Panel de alta/edición por día (inline, sin modal) */}
      {panel && (
        <AltheaCard>
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
              {panel.existing ? 'Sesión existente' : 'Nueva sesión'}
            </p>
            <h3 className="font-headline text-lg font-semibold text-on-surface">{fmtDayFull(panel.date)}</h3>

            <AltheaSelect
              label="Tipo de sesión"
              options={KIND_OPTIONS}
              value={panel.kind}
              onChange={(ev) => setPanel({ ...panel, kind: ev.target.value as CfSessionKind })}
            />
            <AltheaSelect
              label="WOD (opcional)"
              options={[{ value: '', label: 'Sin WOD' }, ...wods.map((w) => ({ value: w.id, label: w.name }))]}
              value={panel.wodId}
              onChange={(ev) => setPanel({ ...panel, wodId: ev.target.value })}
            />
            <AltheaInput
              label="Título"
              value={panel.title}
              placeholder="Opcional: título libre para el calendario"
              onChange={(ev) => setPanel({ ...panel, title: ev.target.value })}
            />
            <AltheaTextarea
              label="Notas"
              value={panel.notes}
              placeholder="Opcional: escalas, objetivos, cómo te sentiste…"
              onChange={(ev) => setPanel({ ...panel, notes: ev.target.value })}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <AltheaButton className="min-h-[44px]" loading={busy} onClick={() => void guardar()}>
                Guardar
              </AltheaButton>
              <AltheaButton
                variant="ghost"
                className="min-h-[44px]"
                onClick={() => { setPanel(null); setConfirmDelete(false) }}
              >
                Cancelar
              </AltheaButton>
              {panel.existing && (
                confirmDelete ? (
                  <AltheaButton variant="danger" className="min-h-[44px]" disabled={busy} onClick={() => void eliminar()}>
                    Confirmar eliminación
                  </AltheaButton>) : (
                  <AltheaButton variant="danger" className="min-h-[44px]" onClick={() => setConfirmDelete(true)}>
                    Eliminar
                  </AltheaButton>
                )
              )}
            </div>

            {confirmDelete && (
              <p role="alert" className="text-sm text-error">
                ¿Eliminar la sesión del {fmtDayFull(panel.date)}? No se puede deshacer: apretá "Confirmar eliminación"
                para borrarla o "Cancelar" para cerrar el panel.
              </p>
            )}
          </div>
        </AltheaCard>
      )}
    </div>
  )
}
