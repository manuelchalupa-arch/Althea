import { useState, useEffect, useCallback } from 'react'
import { useProfileStore } from '@/stores/profile'
import { db } from '@/services/storage/db'
import { getTodayHydration } from '@/services/recovery/recoveryService'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { AltheaButton, AltheaCard } from '@/components/althea'

const QUICK_AMOUNTS = [100, 250, 500]

export function HydrationWidget() {
  const { hydrationToday, addWater, setHydrationToday } = useProfileStore()
  const [goal, setGoal] = useState<number>(2500)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const loadGoal = async () => {
      const profile = await db.userProfile.toArray()
      if (profile[0]?.hydrationGoalMl) {
        setGoal(profile[0].hydrationGoalMl)
      }
    }
    const syncFromDexie = async () => {
      const total = await getTodayHydration()
      setHydrationToday(total)
    }
    loadGoal()
    syncFromDexie()
  }, [setHydrationToday])

  const progress = Math.min(hydrationToday / goal, 1)
  const remaining = Math.max(goal - hydrationToday, 0)

  const handleAddWater = useCallback(async (ml: number) => {
    addWater(ml)
    await db.hydrationLogs.put({
      id: crypto.randomUUID(),
      localDate: new Date().toISOString().slice(0, 10),
      amountMl: ml,
      time: new Date().toISOString(),
      isDemo: false,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [addWater])

  const handleCustomWater = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const ml = parseInt(formData.get('customWater') as string, 10)
    if (!isNaN(ml) && ml > 0) {
      await handleAddWater(ml)
      e.currentTarget.reset()
    }
  }, [handleAddWater])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hidratación</div>
        {saved && (
          <CheckCircle className="text-success text-lg" size={20} />
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Botella vertical: llenado proporcional al consumo real */}
        <div className="relative w-20 h-44 shrink-0" role="img" aria-label={`Botella: ${hydrationToday} de ${goal} mililitros`}>
          <div className="absolute inset-x-3 top-0 h-4 rounded-t-lg border-2 border-b-0 border-outline-variant bg-surface-container-low/90" />
          <div className="absolute inset-x-0 top-3 bottom-0 rounded-b-2xl rounded-t-md border-2 border-outline-variant bg-surface-container-low/90 overflow-hidden">
            <div
              className="absolute bottom-0 inset-x-0 bg-primary/70 transition-all duration-500 ease-out"
              style={{ height: `${Math.min(progress, 1) * 100}%` }}
            />
          </div>
          <div className="absolute inset-0 top-3 flex items-center justify-center">
            <div className="bg-black/55 rounded-lg px-1.5 py-0.5 text-center">
              <div className="font-headline-md text-sm font-bold text-white leading-tight">{(hydrationToday / 1000).toFixed(1)} L</div>
              <div className="text-[9px] font-mono text-white/90">de {(goal / 1000).toFixed(1)} L</div>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="font-headline-md text-xl font-bold text-on-surface">
            {hydrationToday} <span className="text-sm font-normal text-on-surface-variant">/ {goal} ml</span>
          </div>
          <div className="text-[10px] font-label-md font-semibold uppercase tracking-widest text-on-surface-variant">
            {remaining > 0 ? `${remaining} ml restantes` : 'Objetivo alcanzado'}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {QUICK_AMOUNTS.map(ml => (
          <AltheaButton
            key={ml}
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => handleAddWater(ml)}
          >
            +{ml} ml
          </AltheaButton>
        ))}
      </div>

      <form onSubmit={handleCustomWater} className="flex gap-2">
        <input
          name="customWater"
          type="number"
          placeholder="Cantidad (ml)"
          min="1"
          max="2000"
          className="flex-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"
        />
        <AltheaButton type="submit" size="sm" className="whitespace-nowrap">
          Agregar
        </AltheaButton>
      </form>

      {remaining > goal * 0.8 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/15 border border-warning/30 p-3 text-warning">
          <AlertCircle size={18} />
          <span className="font-body-sm">Queda mucho por beber. Tu objetivo: {goal} ml</span>
        </div>
      )}
    </div>
  )
}

export default HydrationWidget