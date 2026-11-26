import { useState } from 'react'
import { db } from '@/services/storage/db'
import type { PainLog } from '@/types'
import { todayKey } from '@/utils/dates'
// Mismas zonas que PainToggle: un solo vocabulario para dolor.
import { BODY_ZONES } from '@/features/training/components/PainToggle'

type Props = {
  exerciseId: string
  exerciseName: string
  /** Se llama UNA vez después de responder (No o Sí ya registrado). */
  onAnswered: () => void
}

/**
 * Consulta de dolor POST-ejercicio: aparece una sola vez, cuando el ejercicio
 * terminó y antes de pasar al siguiente. Nunca entre series. No registra
 * ausencia de dolor si el usuario no respondió.
 */
export default function ExercisePainPrompt({ exerciseId, exerciseName, onAnswered }: Props) {
  const [answer, setAnswer] = useState<'no' | 'si' | 'si-picking' | null>(null)
  const [zone, setZone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const answerNo = async () => {
    setAnswer('no')
    try {
      const today = todayKey()
      const existing = await db.painLogs.where({ exerciseId, localDate: today }).first().catch(() => null)
      if (!existing) {
        const log: PainLog = {
          id: crypto.randomUUID(),
          localDate: today,
          level: 'none',
          zone: '',
          exerciseId,
          moment: new Date().toISOString(),
          notes: '',
          createdAt: new Date().toISOString(),
        }
        await db.painLogs.put(log)
      }
    } catch { /* best-effort: no bloquea el entrenamiento */ }
    void onAnswered()
  }

  const answerYes = async () => {
    if (saving) { return }
    if (!zone) { return } // zona obligatoria para registrar
    setSaving(true)
    try {
      const today = todayKey()
      const finalZone = zone === 'otra' ? (notes.trim() || 'otra') : zone
      // Sin duplicados: un solo registro de dolor por ejercicio y día.
      const existing = await db.painLogs.where({ exerciseId, localDate: today }).first().catch(() => null)
      if (!existing) {
        const log: PainLog = {
          id: crypto.randomUUID(),
          localDate: today,
          // shortcut: el flujo solo pregunta zona (no intensidad); nivel fijo.
          level: 'mild',
          zone: finalZone,
          exerciseId,
          moment: new Date().toISOString(),
          notes: notes.trim() || `${exerciseName} — durante la sesión`,
          createdAt: new Date().toISOString(),
        }
        await db.painLogs.put(log)
      }
    } catch { /* el registro es best-effort: no bloquea el entrenamiento */ }
    setSaving(false)
    setAnswer('si')
    onAnswered()
  }

  return (
    <div data-testid="pain-prompt" className="mx-3 mt-3 rounded-lg border border-secondary/40 bg-secondary-container/15 p-3 space-y-3">
      <div>
        <div className="font-label-caps text-[10px] uppercase text-secondary tracking-widest">Terminaste {exerciseName}</div>
        <p className="text-[15px] text-on-surface font-medium mt-1">¿Sentiste dolor durante este ejercicio?</p>
      </div>
      {answer === null && (
        <div className="flex gap-2">
          <button onClick={answerNo} aria-label="No sentí dolor" className="flex-1 min-h-[48px] rounded bg-surface-container border border-outline-variant text-on-surface font-label-caps text-[11px] uppercase font-bold">No</button>
          <button onClick={() => setAnswer('si-picking')} aria-label="Sí sentí dolor" className="flex-1 min-h-[48px] rounded bg-primary text-on-primary font-label-caps text-[11px] uppercase font-bold">Sí</button>
        </div>
      )}
      {answer === 'si-picking' && (
        <div className="space-y-2">
          <label className="block">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Zona o grupo muscular *</span>
            <select
              value={zone}
              onChange={e => setZone(e.target.value)}
              aria-label="Zona con dolor"
              className="w-full mt-1 bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"
            >
              <option value="">Elegir zona…</option>
              {BODY_ZONES.filter(z => z !== 'otra').map(z => <option key={z} value={z}>{z}</option>)}
              <option value="otra">Otra…</option>
            </select>
          </label>
          {zone === 'otra' && (
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describí la zona"
              maxLength={200}
              aria-label="Zona personalizada"
              className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"
            />
          )}
          <div className="flex gap-2">
            <button onClick={() => { setAnswer(null); setZone(''); setNotes('') }} className="flex-1 min-h-[48px] rounded border border-outline-variant text-on-surface-variant font-label-caps text-[11px] uppercase">Volver</button>
            <button onClick={answerYes} disabled={!zone || saving} className="flex-1 min-h-[48px] rounded bg-primary text-on-primary font-label-caps text-[11px] uppercase font-bold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar y seguir'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
