import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'

interface UsePainAlertOptions {
  currentExercise: { muscle?: string } | null
  enabled: boolean
}

export function usePainAlert({ currentExercise, enabled = true }: UsePainAlertOptions) {
  const [painAlert, setPainAlert] = useState<{ zone: string; detail: string } | null>(null)

  useEffect(() => {
    if (!enabled || !currentExercise?.muscle) {return}

    let cancelled = false

    const run = async () => {
      try {
        const { painMatchesMuscle } = await import('@/services/ai/coachInsights')
        const { getAnswer } = await import('@/services/ai/coachMemory')
        const surveys = await db.postWorkoutSurveys.toArray().catch(() => [])

        for (const s of surveys) {
          if (cancelled) {return}
          const zone = String(s.painZone || s.painDetail || '').trim()
          if (!zone || Number(s.pain) <= 0) {continue}
          if (!painMatchesMuscle(zone, currentExercise.muscle || '')) {continue}

          const ans = await getAnswer(`pain:${zone.toLowerCase()}`).catch(() => null)
          if (!ans) {
            setPainAlert({ zone, detail: String(s.painDetail || '') })
            return
          }
        }
      } catch {
        /* noop */
      }
    }

    run()
    return () => { cancelled = true }
  }, [currentExercise, enabled])

  const dismissPainAlert = () => setPainAlert(null)

  return { painAlert, dismissPainAlert }
}