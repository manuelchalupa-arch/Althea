// Editor de configuración de botellas de agua. NO muestra consumo ni registra
// agua: eso lo hace WaterBottle (una sola botella, fuente única
// db.hydrationBottleLogs). Este componente solo define las capacidades.
import { useCallback, useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getBottleConfigs, saveBottleConfigs, validateBottles, type BottleConfig } from '@/services/recovery/hydrationBottles'

export function BottleConfigEditor() {
  const isMobile = useIsMobile()
  const [configs, setConfigs] = useState<BottleConfig[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [draft, setDraft] = useState<BottleConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const cfgs = await getBottleConfigs()
    setConfigs(cfgs)
    setDraft(cfgs)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const normalized = draft.map(b => ({ ...b, capacityLiters: b.capacityMl / 1000 }))
      const err = validateBottles(normalized)
      if (err) { throw new Error(err) }
      await saveBottleConfigs(normalized)
      // Avisa a cualquier WaterBottle montado (Inicio/Nutrición) que hay que
      // releer las botellas activas y sus capacidades.
      try { window.dispatchEvent(new Event('bottleConfigChange')) } catch { /* noop */ }
      await load()
      setShowConfig(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const panel = (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container p-3 space-y-3">
      <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">Configuración (2 a 3 botellas activas)</div>
      {draft.map((b, idx) => (
        <div key={b.id} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={`Botella ${idx + 1}`}
            value={b.name ?? ''}
            onChange={e => {
              const v = e.target.value
              setDraft(prev => prev.map(x => x.id === b.id ? { ...x, name: v } : x))
            }}
            aria-label={`Nombre de la botella ${idx + 1}`}
            className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant rounded px-2 py-1.5 font-body-sm text-sm text-on-surface"
          />
          <input
            type="number"
            step="0.05"
            min="0.1"
            max="5"
            value={(b.capacityMl / 1000).toFixed(2)}
            onChange={e => {
              const liters = parseFloat(e.target.value)
              const ml = Math.round((isNaN(liters) ? 0 : liters) * 1000)
              setDraft(prev => prev.map(x => x.id === b.id ? { ...x, capacityMl: ml, capacityLiters: ml / 1000 } : x))
            }}
            aria-label={`Capacidad en litros de la botella ${idx + 1}`}
            className="w-20 bg-surface-container-low border border-outline-variant rounded px-2 py-1.5 font-mono text-sm text-on-surface"
          />
          <span className="font-label-caps text-[10px] text-on-surface-variant">L</span>
          <label className="flex items-center gap-1 font-body-sm text-xs text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={b.active}
              onChange={e => setDraft(prev => prev.map(x => x.id === b.id ? { ...x, active: e.target.checked } : x))}
              aria-label={`Botella ${idx + 1} activa`}
            />
            activa
          </label>
        </div>
      ))}
      {error && <div className="font-body-sm text-xs text-error">{error}</div>}
      <div className="flex gap-2">
        <button onClick={() => setShowConfig(false)} className="flex-1 min-h-[44px] rounded border border-outline-variant/40 font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
        <button onClick={handleSave} disabled={saving} data-testid="bottle-config-save" className="flex-1 min-h-[44px] rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-3" data-testid="bottle-config-editor">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <Settings2 size={14} className="text-primary" /> Botellas
        </div>
        <button
          onClick={() => { setDraft(configs); setShowConfig(v => !v) }}
          aria-label="Configurar botellas"
          aria-expanded={showConfig}
          data-testid="bottle-config-toggle"
          className="p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded border border-outline-variant/40 hover:border-primary text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Settings2 size={14} />
        </button>
      </div>

      {/* En mobile se abre como bottom sheet (Stitch); en desktop sigue inline.
          La lógica de guardado/validación es la misma en ambos casos. */}
      {showConfig && (isMobile ? (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center althea-modal"
          onClick={() => setShowConfig(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Configuración de botellas"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-surface-container p-4">
            {panel}
          </div>
        </div>
      ) : panel)}
    </div>
  )
}

export default BottleConfigEditor
