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

const dateStamp = () => new Date().toISOString().slice(0, 10)

export function DataOwnership() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')

  const reset = () => {
    setPhase('idle')
    setError(null)
    setNotice(null)
    setPreview(null)
    setResult(null)
    setPendingFile(null)
    setMode('merge')
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
    if (mode === 'replace' && !window.confirm(
      'El modo "reemplazar" borra los datos actuales antes de importar.\n' +
      'Se perderá todo lo que no esté en el archivo. ¿Continuar?'
    )) { return }

    setError(null)
    setBusy(true)
    try {
      const r = await importJSON(pendingFile, { mode })
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
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  aria-label="Combinar: añade lo que falta y conserva tus datos actuales"
                  name="modo-importacion"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="font-medium text-on-surface">Combinar (recomendado)</span>
                  <span className="block text-xs text-on-surface-variant">
                    Añade lo que falta. Conserva tus datos actuales.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  aria-label="Reemplazar todo: borra los datos actuales antes de importar"
                  name="modo-importacion"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="font-medium text-on-surface">Reemplazar todo</span>
                  <span className="block text-xs text-on-surface-variant">
                    Borra los datos actuales antes de importar.
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <AltheaButton variant="ghost" fullWidth onClick={reset}>Cancelar</AltheaButton>
            {preview.canImport && (
              <AltheaButton
                variant={mode === 'replace' ? 'danger' : 'primary'}
                fullWidth
                loading={busy}
                onClick={() => { void doImport() }}
              >
                {mode === 'replace' ? 'Reemplazar e importar' : 'Importar'}
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
          {result.errors.length > 0 && (
            <div className="flex items-start gap-2 rounded bg-tertiary/10 border border-tertiary/30 p-2">
              <AlertTriangle size={14} className="text-tertiary shrink-0 mt-0.5" aria-hidden="true" />
              <ul className="text-xs text-on-surface-variant space-y-0.5">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
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