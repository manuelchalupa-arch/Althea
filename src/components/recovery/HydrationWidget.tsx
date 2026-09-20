import { useState, useEffect, useCallback } from 'react'
import { useProfileStore } from '@/stores/profile'
import { db } from '@/services/storage/db'
import { getTodayHydration } from '@/services/recovery/recoveryService'
import { Droplet, CheckCircle, AlertCircle } from 'lucide-react'
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
        <div className="flex items-center gap-2">
          <Droplet className="text-primary text-xl" size={24} />
          <div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hidratación</div>
            <div className="font-headline-md text-xl font-bold text-on-surface">
              {hydrationToday} / {goal} ml
            </div>
          </div>
        </div>
        {saved && (
          <CheckCircle className="text-success text-lg" size={20} />
        )}
      </div>

      <div className="w-full h-3 bg-surface-container-high/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-label-md font-semibold uppercase tracking-widest text-on-surface-variant">
        <span>{Math.round(progress * 100)}%</span>
        <span>{remaining > 0 ? `${remaining} ml restantes` : 'Objetivo alcanzado'}</span>
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