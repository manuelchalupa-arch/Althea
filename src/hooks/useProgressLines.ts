import { useMemo } from 'react'

interface UseTableInitialOptions {
  logs: Record<number, any[]>
  currentIndex: number
}

export function useTableInitial({ logs, currentIndex }: UseTableInitialOptions) {
  return useMemo(() => {
    const arr = logs[currentIndex] || []
    const completed: Record<number, { weight: number; reps: number }> = {}
    const skipped: number[] = []
    arr.forEach((v: unknown, i: number) => {
      if (!v) {return}
      const s = v as { skipped?: boolean; weight?: number; reps?: number }
      if (s.skipped) {skipped.push(i)}
      else {completed[i] = { weight: Number(s.weight ?? 0), reps: Number(s.reps ?? 0) }}
    })
    return { completed, skipped }
  }, [logs, currentIndex])
}

export function useProgressMetrics(
  exercises: Array<{ plannedSets?: number; sets: number }>,
  done: Record<number, boolean>,
  skipped: Record<number, boolean>,
  logs: Record<number, any[]>
) {
  return useMemo(() => {
    const progress = exercises.length
      ? Math.round(
          Object.keys(done).filter((k) => done[Number(k)]).length /
            exercises.length *
            100
        )
      : 0

    const completedSets = Object.keys(logs).reduce(
      (sum, k) => sum + (logs[Number(k)]?.length ?? 0),
      0
    )
    const totalSets = exercises.reduce(
      (sum, ex) => sum + (ex.plannedSets ?? ex.sets),
      0
    )

    return { progress, completedSets, totalSets }
  }, [exercises, done, skipped, logs])
}

export function useNextCoach(
  exercises: Array<{ exId: string; name: string; weight: number; reps: number }>,
  currentIndex: number,
  done: Record<number, boolean>,
  logs: Record<number, any[]>
) {
  // This would return a function to load next coach recommendation
  // Placeholder for now
  return useMemo(() => async (nextIdx: number) => {}, [exercises, currentIndex])
}