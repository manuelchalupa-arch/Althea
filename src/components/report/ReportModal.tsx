import { useState } from 'react'
import {
  generateReport, isCompleteReport, categoriesForSection, REPORT_SECTIONS,
  type ReportSelection, type ReportData, type ReportCategory,
} from '@/services/report/reportService'
import { downloadReportPdf } from '@/services/report/reportPdf'

type SectionId = 'mediciones' | 'entrenamiento' | 'nutricion' | 'recuperacion'

/** Períodos de la UI → períodos del servicio (sin duplicar el motor de fechas). */
const PERIODS: Array<{ id: SectionId extends never ? never : ReportSelection['period']; label: string }> = [
  { id: '7', label: 'Semanal' },
  { id: '30', label: 'Mensual' },
  { id: 'custom', label: 'Personalizado' },
]

export function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<ReportSelection['period']>('30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sections, setSections] = useState<SectionId[]>(['entrenamiento'])
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Las 4 secciones → informe completo.
  const completo = isCompleteReport(sections.flatMap(categoriesForSection) as ReportCategory[])

  const clearReport = () => {
    setReport(null)
    setDownloaded(null)
    setDownloadError(null)
  }

  const toggle = (id: SectionId) => {
    setSections(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    clearReport()
  }

  const handleGenerate = async () => {
    setError(null)
    clearReport()
    setLoading(true)
    try {
      if (!sections.length) {throw new Error('Seleccioná al menos una sección')}
      if (period === 'custom' && (!customStart || !customEnd)) {throw new Error('Indicá inicio y fin del período')}
      const categories = sections.flatMap(categoriesForSection) as ReportCategory[]
      const r = await generateReport({ period, customStart, customEnd, categories })
      setReport(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  /** El PDF se arma en el dispositivo: sin red, sin impresión y sin librerías. */
  const handleDownload = () => {
    if (!report) {return}
    setDownloading(true)
    setDownloadError(null)
    try {
      setDownloaded(downloadReportPdf(report))
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  if (!open) {return null}

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-surface-container-low border-b border-outline-variant/40 p-4 flex items-center justify-between">
          <div>
            <div className="font-label-caps text-[10px] uppercase text-secondary tracking-wider">Informe</div>
            <h2 className="font-headline-lg text-lg font-semibold text-on-surface">Generar informe</h2>
            <p className="font-body-sm text-xs text-on-surface-variant">Usa datos reales de Althea. Seleccioná período y categorías.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar informe" className="min-w-12 min-h-12 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Período */}
          <div>
            <div className="font-label-caps text-[10px] uppercase text-outline mb-2">Período</div>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPeriod(p.id)
                    clearReport()
                  }}
                  data-testid={`report-period-${p.id}`}
                  aria-pressed={period === p.id}
                  className={`min-h-[48px] px-4 flex items-center rounded-lg font-label-caps text-[10px] font-semibold uppercase border ${period === p.id ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container border-outline-variant/60 text-on-surface-variant'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <label className="font-label-caps text-[10px] uppercase text-outline">
                  Desde
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[48px]"
                  />
                </label>
                <label className="font-label-caps text-[10px] uppercase text-outline">
                  Hasta
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[48px]" />
                </label>
              </div>
            )}
          </div>

          {/* Secciones */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-label-caps text-[10px] uppercase text-outline">Secciones</span>
              {completo && (
                <span className="font-label-caps text-[10px] font-semibold uppercase text-secondary" data-testid="report-complete-badge">
                  Informe completo
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="report-sections">
              {REPORT_SECTIONS.map(s => (
                <label
                  key={s.id}
                  data-testid={`report-section-${s.id}`}
                  className={`flex items-start gap-3 p-3 min-h-[52px] rounded-lg border cursor-pointer ${sections.includes(s.id) ? 'bg-primary/10 border-primary/30' : 'bg-surface-container border-outline-variant/40'}`}
                >
                  <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id as SectionId)} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface">{s.label}</div>
                    <div className="font-body-sm text-[11px] text-on-surface-variant">{s.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            data-testid="report-generate"
            className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-label-caps text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
          >
            {loading ? 'Generando…' : 'Generar informe'}
          </button>
          {error && <div className="rounded border border-error/30 bg-error/10 p-2 font-body-sm text-xs text-error">{error}</div>}

          {report && (
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-label-caps text-[10px] uppercase text-secondary">
                  {report.completo ? 'Informe completo' : report.periodLabel}
                </span>
                <span className="font-body-sm text-xs text-outline">
                  {report.range.start} → {report.range.end}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading || report.isEmpty}
                  data-testid="report-download"
                  className="min-h-[48px] px-4 flex items-center gap-2 rounded-lg bg-primary text-on-primary font-label-caps text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                >
                  {downloading ? 'Preparando…' : 'Descargar PDF'}
                </button>
                <span className="font-body-sm text-[11px] text-outline">
                  Se arma en el dispositivo, sin conexión.
                </span>
              </div>
              {report.isEmpty && (
                <p className="font-body-sm text-sm text-on-surface-variant">Período vacío — no hay datos reales en este rango.</p>
              )}
              {downloaded && (
                <div className="rounded border border-primary/30 bg-primary/10 p-2 font-body-sm text-xs text-on-surface" data-testid="report-download-ok">
                  Listo: <strong>{downloaded}</strong>
                </div>
              )}
              {downloadError && (
                <div className="rounded border border-error/30 bg-error/10 p-2 font-body-sm text-xs text-error" data-testid="report-download-error">
                  No se pudo generar el PDF: {downloadError}
                </div>
              )}
              {!report.isEmpty && (
                <>
                  {report.entrenamiento && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Entrenamiento</div>
                      <div className="grid grid-cols-2 gap-2 font-body-sm text-xs text-on-surface">
                        <span>días entrenados: <strong>{report.entrenamiento.diasEntrenados}</strong></span>
                        <span>sesiones: <strong>{report.entrenamiento.sesiones}</strong></span>
                        <span>volumen: <strong>{report.entrenamiento.volumen.toLocaleString()} kg</strong></span>
                        <span>series: <strong>{report.entrenamiento.series}</strong></span>
                        <span>repeticiones: <strong>{report.entrenamiento.repeticiones}</strong></span>
                        <span>frecuencia: <strong>{report.entrenamiento.frecuencia}</strong></span>
                        <span>adherencia: <strong>{report.entrenamiento.adherencia ?? '—'}%</strong></span>
                        <span>rendimiento: <strong>{report.entrenamiento.rendimiento?.volumenPorSesion.toLocaleString()} kg/sesión</strong></span>
                      </div>
                    </section>
                  )}
                  {report.fuerza && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Fuerza</div>
                      <div className="font-body-sm text-xs text-on-surface space-y-1">
                        <div>
                          peso máx: <strong>{report.fuerza.pesoMax} kg</strong> · reps: <strong>{report.fuerza.repeticiones}</strong> · volumen: <strong>{report.fuerza.volumen.toLocaleString()} kg</strong> · 1RM est.: <strong>{report.fuerza.rmEstimado} kg</strong>
                        </div>
                        {report.fuerza.progresoPorEjercicio.slice(0, 5).map(p => (
                          <div key={p.exerciseId} className="text-on-surface-variant">
                            {p.exerciseId}: {p.pesoMax} kg × {p.reps} reps → 1RM {p.rm} kg
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {report.musculos && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Músculos</div>
                      <div className="font-body-sm text-xs text-on-surface">
                        <div>carga: {report.musculos.cargaPorGrupo.slice(0, 5).map(c => `${c.muscle} ${c.volumen}kg ${c.pct}%`).join(' · ') || '—'}</div>
                        <div>más trabajados: {report.musculos.gruposMas.join(', ') || '—'}</div>
                        <div>menos trabajados: {report.musculos.gruposMenos.join(', ') || '—'}</div>
                      </div>
                    </section>
                  )}
                  {report.mediciones && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Mediciones</div>
                      <div className="font-body-sm text-xs text-on-surface space-y-0.5">
                        <div>
                          peso: <strong>{report.mediciones.peso?.inicial} → {report.mediciones.peso?.final} kg</strong>
                          {' '}({report.mediciones.peso && report.mediciones.peso.delta > 0 ? '+' : ''}{report.mediciones.peso?.delta} kg · mín {report.mediciones.peso?.min} · máx {report.mediciones.peso?.max})
                        </div>
                        {report.mediciones.grasaPct && (
                          <div>% grasa: <strong>{report.mediciones.grasaPct.inicial} → {report.mediciones.grasaPct.final}%</strong> ({report.mediciones.grasaPct.delta > 0 ? '+' : ''}{report.mediciones.grasaPct.delta})</div>
                        )}
                        {report.mediciones.masaMuscularKg && (
                          <div>masa muscular: <strong>{report.mediciones.masaMuscularKg.inicial} → {report.mediciones.masaMuscularKg.final} kg</strong> ({report.mediciones.masaMuscularKg.delta > 0 ? '+' : ''}{report.mediciones.masaMuscularKg.delta})</div>
                        )}
                        {report.mediciones.perimetros.map(p => (
                          <div key={p.clave} className="text-on-surface-variant">
                            {p.clave}: {p.inicial} → {p.final} cm ({p.delta > 0 ? '+' : ''}{p.delta} cm)
                          </div>
                        ))}
                        <div className="text-outline">{report.mediciones.dias} mediciones en el período</div>
                      </div>
                    </section>
                  )}
                  {report.recuperacion && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Recuperación</div>
                      <div className="font-body-sm text-xs text-on-surface">
                        <div>score avg: {report.recuperacion.avgScore ?? '—'} · registros: {report.recuperacion.scores.length}</div>
                        <div>fatiga, sueño, dolor, estrés, motivación — datos reales ({report.recuperacion.scores.length} check-ins)</div>
                      </div>
                    </section>
                  )}
                  {report.nutricion && (
                    <section className="space-y-1">
                      <div className="font-label-caps text-[10px] uppercase text-outline">Nutrición</div>
                      <div className="font-body-sm text-xs text-on-surface">
                        kcal {report.nutricion.calorias} · P {report.nutricion.proteinas}g · C {report.nutricion.carbohidratos}g · G {report.nutricion.grasas}g · agua {report.nutricion.hidratacionMl} ml
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
