import { useState, useCallback, useEffect } from 'react'
import { AlertTriangle, X, ChevronDown } from 'lucide-react'
import { AltheaButton } from '@/components/althea'
import { db } from '@/services/storage/db'
import type { PainLog } from '@/types'

type PainLevel = 'none' | 'mild' | 'moderate' | 'severe'

const PAIN_LEVELS: { value: PainLevel; label: string; color: string }[] = [
  { value: 'none', label: 'Sin dolor', color: 'bg-emerald/20 text-emerald border-emerald/30' },
  { value: 'mild', label: 'Leve', color: 'bg-primary/20 text-primary border-primary/30' },
  { value: 'moderate', label: 'Moderado', color: 'bg-amber/20 text-amber border-amber/30' },
  { value: 'severe', label: 'Severo', color: 'bg-error/20 text-error border-error/30' },
]

const BODY_ZONES = [
  'cuello', 'hombro izquierdo', 'hombro derecho', 'brazo izquierdo', 'brazo derecho',
  'antebrazo izquierdo', 'antebrazo derecho', 'muñeca izquierda', 'muñeca derecha',
  'pecho', 'espalda alta', 'espalda baja', 'lumbar', 'abdomen',
  'cadera izquierda', 'cadera derecha', 'muslo izquierdo', 'muslo derecho',
  'rodilla izquierda', 'rodilla derecha', 'pantorrilla izquierda', 'pantorrilla derecha',
  'tobillo izquierdo', 'tobillo derecho', 'otra'
]

interface PainToggleProps {
  sessionId: string
  exerciseId: string
  exerciseName: string
  initialLevel?: PainLevel
  onPainChange: (level: PainLevel, zone?: string, notes?: string) => void
  onOpenVariants?: () => void
}

export function PainToggle({ sessionId, exerciseId, exerciseName, initialLevel = 'none', onPainChange, onOpenVariants }: PainToggleProps) {
  const [level, setLevel] = useState<PainLevel>(initialLevel)
  const [showDetails, setShowDetails] = useState(false)
  const [zone, setZone] = useState('')
  const [notes, setNotes] = useState('')
  const [showZonePicker, setShowZonePicker] = useState(false)
  const [showZoneList, setShowZoneList] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleLevelChange = useCallback((newLevel: PainLevel) => {
    setLevel(newLevel)
    if (newLevel !== 'none') {
      setShowDetails(true)
    } else {
      setShowDetails(false)
      setZone('')
      setNotes('')
      setShowZoneList(false)
    }
  }, [])

  const savePainLog = useCallback(async () => {
    if (level === 'none') {
      onPainChange('none')
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      return
    }
    if (saving) return

    const today = new Date().toISOString().slice(0, 10)
    const existing = await db.painLogs
      .where({ exerciseId, localDate: today, level })
      .first()
    if (existing) {
      onPainChange(level, zone || 'no especificada', notes)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      return
    }

    setSaving(true)
    const painLog: PainLog = {
      id: crypto.randomUUID(),
      localDate: today,
      level,
      zone: zone || 'no especificada',
      exerciseId,
      moment: new Date().toISOString(),
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
    }

    try {
      await db.painLogs.put(painLog)
      onPainChange(level, zone || 'no especificada', notes)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      console.error('Failed to save pain log:', e)
    } finally {
      setSaving(false)
    }
  }, [level, zone, notes, exerciseId, sessionId, onPainChange])

  useEffect(() => {
    if (level !== 'none') {
      setShowDetails(true)
    }
  }, [level])

  const isSevere = level === 'severe'

  return (
    <div className={`rounded-xl border p-3 space-y-3 transition-colors ${isSevere ? 'bg-error/5 border-error/30' : 'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <div className="font-body-sm text-on-surface font-medium">Dolor</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{exerciseName}</div>
          </div>
        </div>
        {saved && (
          <span className="px-2 py-0.5 rounded-full bg-emerald/20 text-emerald text-[10px] font-label-md font-semibold uppercase tracking-widest">Guardado</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {PAIN_LEVELS.map(l => (
          <button
            key={l.value}
            onClick={() => handleLevelChange(l.value)}
            aria-pressed={level === l.value}
            className={`px-2 py-3 min-h-[48px] rounded-lg border font-body-sm text-sm font-medium transition-all ${level === l.value ? `${l.color} ring-2 ring-current` : 'bg-surface-container-high/50 border-outline-variant text-on-surface-variant hover:border-primary/50'}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {showDetails && level !== 'none' && (
        <div className="space-y-3 pt-2 border-t border-outline-variant/30 animate-in slide-in-from-top-2 duration-200">
          <div>
            <button
              onClick={() => setShowZoneList(v => !v)}
              aria-expanded={showZoneList}
              className="w-full flex items-center justify-between py-2 min-h-[44px] font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"
            >
              <span>Zona: {zone || 'elegir'}</span>
              <ChevronDown size={16} className={`transition-transform ${showZoneList ? 'rotate-180' : ''}`} />
            </button>
            {showZoneList && (
            <div className="flex flex-wrap gap-1 mt-1">
              {BODY_ZONES.map(z => (
                <button
                  key={z}
                  onClick={() => {
                    setZone(z)
                    setShowZonePicker(false)
                    setShowZoneList(false)
                  }}
                  className={`px-3 py-2 min-h-[44px] rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest ${zone === z ? 'bg-primary border-primary text-primary' : 'bg-surface-container-high/50 border-outline-variant text-on-surface-variant hover:border-primary/50'}`}
                >
                  {z}
                </button>
              ))}
              <button
                onClick={() => setShowZonePicker(!showZonePicker)}
                className="px-3 py-2 min-h-[44px] rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest bg-surface-container-high/50 border-outline-variant text-on-surface-variant hover:border-primary/50"
              >
                Otra…
              </button>
            </div>
            )}
            {showZonePicker && (
              <input
                value={zone}
                onChange={e => setZone(e.target.value)}
                placeholder="Especifica la zona"
                className="w-full mt-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"
              />
            )}
          </div>

          <div>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Tipo de molestia, cuándo aparece, qué la alivia..."
              rows={2}
              maxLength={300}
              className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface"
            />
          </div>

          {isSevere && (
            <div className="rounded-lg bg-error/15 border border-error/30 p-3 flex items-start gap-2">
              <AlertTriangle className="text-error mt-0.5" size={18} />
              <div className="font-body-sm text-error font-medium">Detené el ejercicio y consultá a un profesional.</div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <AltheaButton variant="secondary" size="sm" onClick={() => { setShowDetails(false); setZone(''); setNotes(''); }}>
              Cancelar
            </AltheaButton>
            <AltheaButton size="sm" onClick={savePainLog} className="flex-1">
              {saved ? 'Guardado ✓' : 'Guardar y continuar'}
            </AltheaButton>
            {level === 'moderate' || level === 'severe' ? (
              <AltheaButton variant="secondary" size="sm" onClick={onOpenVariants}>
                Ver variantes
              </AltheaButton>
            ) : null}
          </div>
        </div>
      )}

      {!showDetails && level !== 'none' && (
        <AltheaButton variant="secondary" size="sm" className="w-full" onClick={() => setShowDetails(true)}>
          Agregar detalles (zona, notas)
        </AltheaButton>
      )}

      {level === 'none' && (
        <div className="text-center text-on-surface-variant text-sm py-2">
          Sin dolor registrado para este ejercicio
        </div>
      )}
    </div>
  )
}

export default PainToggle