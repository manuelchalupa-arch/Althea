import { useRef, useState, type FormEvent } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaSelect, AltheaTextarea } from '@/components/althea/AltheaInput'
import { CF_BENCHMARKS, getBenchmark, isBetterResult, parseClockToSec } from '@/services/crossfit/cfBenchmarks'
import type { CfBenchmark, CfBenchmarkCategory } from '@/services/crossfit/cfBenchmarks'
import { listBenchmarkResults, newResult } from '@/services/crossfit/cfStore'
import type { CfLevel, CfResult } from '@/services/crossfit/types'

type CategoryFilter = 'todos' | CfBenchmarkCategory

const CATEGORY_TABS: ReadonlyArray<{ value: CategoryFilter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'girl', label: 'Girls' },
  { value: 'hero', label: 'Heroes' },
]

const SCORE_TYPE_LABEL: Record<CfBenchmark['scoreType'], string> = {
  time: 'mejor tiempo',
  volume: 'más volumen',
}

const LEVEL_OPTIONS: ReadonlyArray<{ value: CfLevel; label: string }> = [
  { value: 'rx', label: 'RX (tal cual)' },
  { value: 'scaled', label: 'Scaled' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'adapted', label: 'Adaptado' },
]

const SCALE_ORDER = ['rx', 'scaled', 'beginner'] as const
const SCALE_LABEL: Record<(typeof SCALE_ORDER)[number], string> = {
  rx: 'RX',
  scaled: 'Scaled',
  beginner: 'Beginner',
}

/**
 * PR del historial: el mejor resultado utilizable para el scoreType (con
 * timeSec si es de tiempo; con rounds/reps si es de volumen).
 */
function findPrId(results: CfResult[], scoreType: CfBenchmark['scoreType']): string | null {
  const usable = results.filter((r) =>
    scoreType === 'time' ? typeof r.timeSec === 'number' : typeof r.rounds === 'number' || typeof r.reps === 'number',
  )
  let best: CfResult | null = null
  for (const r of usable) {
    const prev = best ? { timeSec: best.timeSec, rounds: best.rounds, reps: best.reps } : null
    if (isBetterResult(scoreType, prev, r)) { best = r }
  }
  return best ? best.id : null
}

/**
 * Benchmarks CrossFit (Girls + Heroes): catálogo oficial con historial real
 * de cfResults por benchmarkId y registro de resultados con newResult.
 * Sin datos de demostración: los vacíos muestran estados honestos.
 */
export default function CrossfitBenchmarks() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [history, setHistory] = useState<CfResult[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scoreText, setScoreText] = useState('')
  const [timeRaw, setTimeRaw] = useState('')
  const [roundsRaw, setRoundsRaw] = useState('')
  const [repsRaw, setRepsRaw] = useState('')
  const [level, setLevel] = useState<CfLevel>('rx')
  const [standardModified, setStandardModified] = useState(false)
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Secuencia para descartar respuestas de historial de un benchmark ya cerrado.
  const loadSeq = useRef(0)

  const expanded = expandedId ? getBenchmark(expandedId) ?? null : null

  const inCategory = category === 'todos' ? CF_BENCHMARKS : CF_BENCHMARKS.filter((b) => b.category === category)
  const q = query.trim().toLowerCase()
  const filtered = q ? inCategory.filter((b) => b.name.toLowerCase().includes(q)) : inCategory

  function resetForm() {
    setScoreText('')
    setTimeRaw('')
    setRoundsRaw('')
    setRepsRaw('')
    setLevel('rx')
    setStandardModified(false)
    setNotes('')
    setFormError(null)
    setSaved(false)
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      loadSeq.current += 1
      setExpandedId(null)
      return
    }
    const seq = ++loadSeq.current
    setExpandedId(id)
    resetForm()
    setHistory(null)
    setLoadingHistory(true)
    try {
      const rows = await listBenchmarkResults(id)
      if (seq === loadSeq.current) { setHistory(rows) }
    } finally {
      if (seq === loadSeq.current) { setLoadingHistory(false) }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!expanded) { return }

    const trimmed = scoreText.trim()
    if (!trimmed) {
      setFormError('Ingresá el resultado, por ejemplo "7:42".')
      return
    }

    let timeSec: number | undefined
    if (timeRaw.trim()) {
      const parsed = parseClockToSec(timeRaw)
      if (parsed === null) {
        setFormError('Tiempo inválido: usá segundos ("462") o mm:ss ("7:42").')
        return
      }
      timeSec = parsed
    }

    let rounds: number | undefined
    if (roundsRaw.trim()) {
      const n = Number(roundsRaw)
      if (!Number.isInteger(n) || n < 0) {
        setFormError('Rondas inválidas: ingresá un número entero.')
        return
      }
      rounds = n
    }

    let reps: number | undefined
    if (repsRaw.trim()) {
      const n = Number(repsRaw)
      if (!Number.isInteger(n) || n < 0) {
        setFormError('Reps inválidas: ingresá un número entero.')
        return
      }
      reps = n
    }

    setSaving(true)
    setFormError(null)
    try {
      await newResult({
        benchmarkId: expanded.id,
        isBenchmark: true,
        wodName: expanded.name,
        format: expanded.format,
        scoreText: trimmed,
        timeSec,
        rounds,
        reps,
        level,
        standardModified,
        notes: notes.trim() || undefined,
      })
      const rows = await listBenchmarkResults(expanded.id)
      setHistory(rows)
      resetForm()
      setSaved(true)
    } catch {
      setFormError('No se pudo guardar el resultado. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-headline text-lg font-semibold text-on-surface">Benchmarks</h2>
        <p className="text-sm text-on-surface-variant">
          Los WODs oficiales (Girls y Heroes) con tus resultados reales: compará tiempos y volumen entre intentos.
        </p>
      </div>

      {/* Buscador */}
      <div className="space-y-1.5">
        <label htmlFor="cf-benchmarks-search" className="font-label-md text-xs text-on-surface">Buscar benchmark</label>
        <input
          id="cf-benchmarks-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: fran, murph…"
          className="min-h-[44px] w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant"
        />
      </div>

      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        {CATEGORY_TABS.map((tab) => {
          const active = category === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(tab.value)}
              className={`min-h-[44px] rounded-lg border px-3 font-label-md text-label-md transition active:scale-[0.98] ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <p className="text-aux text-[10px]">
        {filtered.length} {filtered.length === 1 ? 'benchmark' : 'benchmarks'}
      </p>

      {/* Lista */}
      {filtered.length === 0 ? (
        <AltheaEmpty
          icon="workspace_premium"
          title="Sin benchmarks"
          description="No encontramos nada con esa búsqueda. Probá con otro nombre o cambiá el filtro de categoría."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const isExpanded = expandedId === b.id
            const panelId = `cf-benchmark-${b.id}`
            return (
              <AltheaCard key={b.id} padding="sm">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onClick={() => { void toggleExpand(b.id) }}
                  className="flex min-h-[44px] w-full items-center gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="block font-headline text-sm font-semibold text-on-surface">{b.name}</span>
                      <AltheaBadge variant={b.category === 'girl' ? 'primary' : 'warning'} size="xs">
                        {b.category === 'girl' ? 'Girl' : 'Hero'}
                      </AltheaBadge>
                    </span>
                    <span className="block font-label-md text-xs capitalize text-on-surface-variant">
                      {b.format} · {SCORE_TYPE_LABEL[b.scoreType]}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 font-bold text-primary">{isExpanded ? '−' : '+'}</span>
                </button>

                {isExpanded && expanded && expanded.id === b.id && (
                  <div id={panelId} className="mt-3 space-y-4 border-t border-outline-variant pt-3">
                    <p className="text-sm text-on-surface-variant">{b.history}</p>

                    {/* Movimientos */}
                    <div className="space-y-1.5">
                      <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Movimientos</p>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-outline-variant">
                            <th scope="col" className="py-1.5 pr-2 font-label-md text-xs uppercase tracking-wide text-on-surface-variant">Movimiento</th>
                            <th scope="col" className="py-1.5 pr-2 font-label-md text-xs uppercase tracking-wide text-on-surface-variant">Reps</th>
                            <th scope="col" className="py-1.5 pr-2 font-label-md text-xs uppercase tracking-wide text-on-surface-variant">Carga</th>
                            <th scope="col" className="py-1.5 font-label-md text-xs uppercase tracking-wide text-on-surface-variant">Distancia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {b.movements.map((m) => (
                            <tr key={m.order}>
                              <td className="py-2 pr-2 align-top text-on-surface">
                                {m.name}
                                {m.notes && <span className="block text-xs text-on-surface-variant">{m.notes}</span>}
                              </td>
                              <td className="py-2 pr-2 align-top text-on-surface">{m.reps ?? '—'}</td>
                              <td className="py-2 pr-2 align-top text-on-surface">{m.loadText ?? '—'}</td>
                              <td className="py-2 align-top text-on-surface">{m.distanceM ? `${m.distanceM} m` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Escalado */}
                    <div className="space-y-1.5">
                      <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Escalado</p>
                      <table className="w-full text-left text-sm">
                        <tbody className="divide-y divide-outline-variant/50">
                          {SCALE_ORDER.filter((k) => b.scale[k]).map((k) => (
                            <tr key={k}>
                              <th scope="row" className="w-1/4 py-2 pr-3 align-top font-label-md text-xs uppercase tracking-wide text-on-surface-variant">
                                {SCALE_LABEL[k]}
                              </th>
                              <td className="py-2 align-top text-on-surface">{b.scale[k]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Equipo */}
                    <div className="space-y-1.5">
                      <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Equipo</p>
                      <p className="text-sm text-on-surface">{b.equipment.join(' · ')}</p>
                    </div>

                    {/* Historial real de cfResults */}
                    <div className="space-y-2">
                      <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Historial</p>
                      {loadingHistory ? (
                        <p className="text-sm text-on-surface-variant">Cargando historial…</p>
                      ) : history && history.length > 0 ? (
                        (() => {
                          const prId = findPrId(history, b.scoreType)
                          return (
                            <ul className="divide-y divide-outline-variant/50">
                              {history.map((r) => (
                                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-on-surface">{r.scoreText}</p>
                                    <p className="text-xs text-on-surface-variant">
                                      {r.date} · {r.level.toUpperCase()}
                                      {r.standardModified ? ' · estándar modificado' : ''}
                                    </p>
                                  </div>
                                  {prId === r.id && <AltheaBadge variant="primary" size="xs">PR</AltheaBadge>}
                                </li>
                              ))}
                            </ul>
                          )
                        })()
                      ) : history ? (
                        <AltheaEmpty
                          icon="workspace_premium"
                          title="Sin resultados registrados para este benchmark."
                          description="Cuando hagas un intento, su resultado aparecerá acá."
                        />
                      ) : null}
                    </div>

                    {/* Registrar resultado */}
                    <form onSubmit={handleSubmit} noValidate className="space-y-3 border-t border-outline-variant pt-3">
                      <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Registrar resultado</p>
                      <AltheaInput
                        label="Resultado"
                        required
                        value={scoreText}
                        onChange={(e) => setScoreText(e.target.value)}
                        placeholder={b.scoreType === 'time' ? '7:42' : '8 rondas + 12 reps'}
                      />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <AltheaInput
                          label="Tiempo (opcional)"
                          value={timeRaw}
                          onChange={(e) => setTimeRaw(e.target.value)}
                          placeholder="7:42 o 462"
                          inputMode="numeric"
                        />
                        <AltheaInput
                          label="Rondas (opcional)"
                          type="number"
                          min={0}
                          value={roundsRaw}
                          onChange={(e) => setRoundsRaw(e.target.value)}
                          placeholder="8"
                        />
                        <AltheaInput
                          label="Reps (opcional)"
                          type="number"
                          min={0}
                          value={repsRaw}
                          onChange={(e) => setRepsRaw(e.target.value)}
                          placeholder="12"
                        />
                      </div>
                      <AltheaSelect
                        label="Nivel"
                        options={LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={level}
                        onChange={(e) => setLevel(e.target.value as CfLevel)}
                      />
                      <label className="flex min-h-[44px] items-center gap-2 text-sm text-on-surface">
                        <input
                          type="checkbox"
                          checked={standardModified}
                          onChange={(e) => setStandardModified(e.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                        Modifiqué el estándar original
                      </label>
                      <AltheaTextarea
                        label="Notas"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej.: descansos, lesión, sensaciones…"
                      />
                      {formError && <p role="alert" className="text-sm text-error">{formError}</p>}
                      {saved && <p role="status" className="text-sm text-secondary">Resultado guardado.</p>}
                      <AltheaButton type="submit" variant="primary" fullWidth icon="done" loading={saving}>
                        Guardar resultado
                      </AltheaButton>
                    </form>
                  </div>
                )}
              </AltheaCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
