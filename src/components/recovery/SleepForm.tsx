import { useState, useEffect } from 'react'
import { db } from '@/services/storage/db'
import { Moon, Sun, Save, CheckCircle } from 'lucide-react'
import { AltheaButton, AltheaCard } from '@/components/althea'

export function SleepForm() {
  const today = new Date().toISOString().slice(0, 10)
  const [hours, setHours] = useState<number>(7)
  const [quality, setQuality] = useState<number>(7)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const loadSleep = async () => {
      const recovery = await db.recoveryChecks.get(today)
      if (recovery) {
        if (recovery.sleepHours !== undefined) {
          setHours(recovery.sleepHours)
        }
        if (recovery.sleepQuality !== undefined) {
          setQuality(recovery.sleepQuality)
        }
      }
    }
    loadSleep()
  }, [today])

  const save = async () => {
    const data = {
      id: today,
      localDate: today,
      energy: 7,
      fatigue: 3,
      stress: 3,
      sleepHours: hours,
      sleepQuality: quality,
      soreness: 3,
      motivation: 7,
      digestion: 7,
      hydration: 7,
      score: 75,
      color: 'green' as const,
      notes,
      isDemo: false,
    }
    await db.recoveryChecks.put(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="text-primary text-xl" size={24} />
          <div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sueño</div>
            <div className="font-headline-md text-xl font-bold text-on-surface">
              {hours}h · Calidad: {quality}/10
            </div>
          </div>
        </div>
        {saved && <CheckCircle className="text-success text-lg" size={20} />}
      </div>

      <div className="space-y-3">
        <label className="block">
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <span>Horas dormidas</span>
            <span>{hours}h</span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={hours}
            onChange={e => setHours(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </label>

        <label className="block">
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <span>Calidad del sueño</span>
            <span>{quality}/10</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={quality}
            onChange={e => setQuality(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </label>

        <label className="block">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Notas (opcional)
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="¿Cómo dormiste? ¿Despertares? ¿Siestas?"
            rows={2}
            maxLength={300}
            className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"
          />
        </label>
      </div>

      <AltheaButton onClick={save} className="w-full">
        {saved ? (
          <>
            <Save className="mr-2" size={16} /> Guardado
          </>
        ) : 'Guardar'}
      </AltheaButton>
    </div>
  )
}

export default SleepForm