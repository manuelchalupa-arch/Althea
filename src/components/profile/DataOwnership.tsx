import { useRef, useState } from 'react'
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from 'lucide-react'
import {
  exportJSON,
  exportCSV,
  downloadBlob,
  generateImportPreview,
  importJSON,
  type ImportPreview,
  type ImportResult,
} from '@/services/storage/export'
import { AltheaBadge, AltheaButton, AltheaCard } from '@/components/althea'
import { todayKey } from '@/utils/dates'

/**
 * Propiedad de los datos (DEAD-001).
 *
 * Conecta a la interfaz el motor de export/import que ya existía en
 * `services/storage/exportImport.ts` pero no tenía punto de entrada: sin esto,
 * la persona usuaria no podía respaldar ni restaurar años de entrenamiento.
 *
 * El PDF no se ofrece acá a propósito: `exportPDF` de `export.ts` leía las
 * tablas legacy (`sessions`/`setLogs`), que ya no guardan sesiones. El informe
 * PDF real vive en Progreso → «Generar informe descargable».
 */

type Phase = 'idle' | 'preview' | 'done'

// Fecha local para el nombre del respaldo: toISOString() era UTC y a partir de
// las 21:00 (ART) el archivo quedaba sellado con el día siguiente.
const dateStamp = () => todayKey()

export function DataOwnership() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const reset = () => {
    setPhase('idle')
    setError(null)
    setNotice(null)
    setPreview(null)
    setResult(null)
    setPendingFile(null)
    if (fileRef.current) { fileRef.current.value = '' }
  }

  const runExport = async (kind: 'json' | 'csv') => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const blob = kind === 'json' ? await exportJSON() : await exportCSV()
      const name = kind === 'json'
        ? `althea-respaldo-${dateStamp()}.json`
        : `althea-historial-${dateStamp()}.csv`
      downloadBlob(blob, name)
      setNotice(kind === 'json'
        ? 'Respaldo descargado. Conservalo: contiene todo tu historial.'
        : 'Historial CSV descargado (registros de series).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el archivo.')
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) { return }
    setError(null)
    setNotice(null)
    setResult(null)
    setPendingFile(file)
    setBusy(true)
    try {
      const p = await generateImportPreview(file)
      setPreview(p)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El archivo no es un respaldo válido de Althea.')
      setPendingFile(null)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!pendingFile) { return }
    setError(null)
    setBusy(true)
    try {
      // La confirmación autoriza la estrategia merge: los IDs en conflicto se conservan localmente.
      const r = await importJSON(pendingFile, { mode: 'merge', confirmOverwrite: true })
      setResult(r)
      setPhase('done')
      setNotice(r.success
        ? 'Respaldo restaurado. Recargá la app para ver todos los cambios.'
        : 'La importación terminó con advertencias. Revisá el detalle.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el archivo.')
    } finally {
      setBusy(false)
    }
  }

  const counts = preview
    ? ([
        ['Rutinas', preview.summary.routines],
        ['Sesiones', preview.summary.sessions],
        ['Ejercicios', preview.summary.sessionExercises],
        ['Series', preview.summary.setRecords],
        ['Check-ins', preview.summary.recoveryChecks],
        ['Botellas configuradas', preview.summary.hydrationBottles],
        ['Registros de hidratación', preview.summary.hydrationBottleLogs],
        ['Alimentos personalizados', preview.summary.customFoods],
        ['Configuraciones de avisos', preview.summary.notificationConfigs],
        ['Mediciones', preview.summary.bodyMeasurements],
      ] as const)
    : []
  const totalRecords = counts.reduce((a, [, v]) => a + v, 0)

  const importedRows = result
    ? ([
        ['Rutinas', result.imported.routines],
        ['Sesiones', result.imported.sessions],
        ['Series', result.imported.setRecords],
        ['Check-ins', result.imported.recoveryChecks],
        ['Comidas', result.imported.nutritionDiary],
      ] as const)
    : []

  return (
    <div className="space-y-3 pt-3">
      <p className="font-body-md text-xs text-on-surface-variant">
        Tus datos son tuyos. Descargá un respaldo completo para guardarlo o
        mudarlo a otro dispositivo. Todo se genera en este dispositivo; nada se envía.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => runExport('json')}
          disabled={busy}
          className="btn-primary flex items-center justify-center gap-2 min-h-[48px] px-3 disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          <span className="font-label-caps text-[10px] uppercase font-bold">Respaldo (JSON)</span>
        </button>
        <button
          type="button"
          onClick={() => runExport('csv')}
          disabled={busy}
          className="btn-secondary flex items-center justify-center gap-2 min-h-[48px] px-3 disabled:opacity-50"
        >
          <FileSpreadsheet size={16} aria-hidden="true" />
          <span className="font-label-caps text-[10px] uppercase font-bold">Historial (CSV)</span>
        </button>
      </div>

      <div className="flex items-center gap-2 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-outline-variant/40" />
        <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Restaurar</span>
        <span className="h-px flex-1 bg-outline-variant/40" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={e => { void onPickFile(e.target.files?.[0]) }}
      />

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full btn-secondary flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
        >
          <Upload size={16} aria-hidden="true" />
          <span className="font-label-caps text-[10px] uppercase font-bold">Restaurar desde un respaldo</span>
        </button>
      )}

      {busy && phase === 'idle' && (
        <p className="text-center text-sm text-on-surface-variant">Generando…</p>
      )}

      {preview && phase === 'preview' && (
        <AltheaCard className="p-3 space-y-3">
          <div className="flex items-start gap-2">
            <Check size={16} className="text-secondary shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-body-md text-sm font-semibold text-on-surface">
                Respaldo válido · {totalRecords} registros
              </div>
              <div className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
                {pendingFile?.name}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {counts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">{k}</dt>
                <dd className="text-on-surface font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {preview.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded bg-tertiary/10 border border-tertiary/30 p-2">
              <AlertTriangle size={14} className="text-tertiary shrink-0 mt-0.5" aria-hidden="true" />
              <ul className="text-xs text-on-surface-variant space-y-0.5">
                {preview.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {!preview.canImport && (
            <p className="text-xs text-error">
              Este archivo no se puede importar. Descargá un respaldo desde la propia app.
            </p>
          )}

          {preview.canImport && (
            <div className="space-y-1.5">
              <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
                Cómo importar
              </span>
              <p className="text-sm text-on-surface">
                <span className="font-medium">Combinar (recomendado)</span>
                <span className="block text-xs text-on-surface-variant">
                  Agrega los registros que faltan. Los registros existentes se conservan y no se sobrescriben.
                </span>
              </p>
              <p className="text-xs text-on-surface-variant">
                El reemplazo completo está temporalmente deshabilitado para evitar
                borrar información que el respaldo no contenga.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <AltheaButton variant="ghost" fullWidth onClick={reset}>Cancelar</AltheaButton>
            {preview.canImport && (
              <AltheaButton
                variant="primary"
                fullWidth
                loading={busy}
                onClick={() => { void doImport() }}
              >
                Importar y combinar
              </AltheaButton>
            )}
          </div>
        </AltheaCard>
      )}

      {phase === 'done' && result && (
        <AltheaCard className="p-3 space-y-3">
          <AltheaBadge variant={result.success ? 'success' : 'warning'}>
            {result.success ? 'Importación completa' : 'Importación con advertencias'}
          </AltheaBadge>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {importedRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">{k}</dt>
                <dd className="text-on-surface font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {(!result.verification.passed || result.errors.length > 0) && (
            <div className="flex items-start gap-2 rounded bg-tertiary/10 border border-tertiary/30 p-2">
              <AlertTriangle size={14} className="text-tertiary shrink-0 mt-0.5" aria-hidden="true" />
              <ul className="text-xs text-on-surface-variant space-y-0.5">
                {[...result.errors, ...result.verification.details.filter(d => d !== 'Verificación completada')].slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <AltheaButton variant="secondary" fullWidth onClick={reset}>Cerrar</AltheaButton>
        </AltheaCard>
      )}

      {notice && (
        <p role="status" className="font-label-caps text-[10px] bg-secondary/10 border border-secondary/30 rounded p-2 text-on-surface">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="font-label-caps text-[10px] bg-error/10 border border-error/30 rounded p-2 text-on-surface text-error">
          {error}
        </p>
      )}

      <p className="font-body-sm text-[11px] text-on-surface-variant">
        El informe en PDF se genera desde Progreso → «Generar informe descargable».
      </p>
    </div>
  )
}

export default DataOwnership