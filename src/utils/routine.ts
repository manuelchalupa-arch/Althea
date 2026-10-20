import { db } from '@/services/storage/db'
import { getLastExecutionByExercise } from '@/services/history'
import { getAllRoutines, getActiveRoutineId } from '@/services/storage/routineStore'
import { todayKey, weekdayOfKey } from '@/utils/dates'
import type { CycleConfig } from '@/utils/cycle'
import type { Exercise } from '@/types'

export type DayEx = {
  id: string
  name: string
  sets: number
  reps: number
  /** null = sin peso informado en el plan. Nunca se rellena con 0. */
  weight: number | null
  /** Plan por serie (reps/weight propios de cada serie), si la rutina lo define. */
  series?: { reps: number; weight: number | null }[]
  muscle?: string
  gifUrl?: string
  imageDataUrl?: string
  exId: string
  restSec?: number
  seriesType?: string
  tempo?: string
  rir?: number
  rpe?: number
  notes?: string
  routineExerciseId?: string
}

export async function getDayExercises(dayN:number | null, _cycle: CycleConfig): Promise<DayEx[]> {
  if(!dayN) {return []}
  // intenta desde routineStore (Dexie)
  try{
    const rawList = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    const active = rawList.find((r)=>r.id===activeId) || rawList[0]
    if(active?.dayExercises?.[dayN] && active.dayExercises[dayN].length>0){
      const arr = active.dayExercises[dayN]
      const exs = await db.exercises.bulkGet(arr.map((x)=>x.exId)).catch(()=>[])
      const results: DayEx[] = []
      for(let i=0;i<arr.length;i++){
        const it = arr[i]
        const ex = exs[i] as Exercise | undefined
        let weight = it.weight ?? null
        // Sugerencia desde el historial SOLO para el valor de nivel ejercicio y
        // únicamente cuando el plan no informó peso. Nunca escribe 0.
        if((!weight || weight===0) && it.exId && !it.series?.length){
          const last = await getLastExecutionByExercise(it.exId).catch(()=>null)
          if(last && last.sets.length>0){
            weight = Math.max(...last.sets.map(s=> s.weight || 0)) || null
          }
        }
        results.push({
          id: it.exId, exId: it.exId, name: ex?.name || it.name || it.exId,
          sets: it.series?.length || it.sets, reps: it.reps, weight,
          series: it.series?.length ? it.series : undefined,
          muscle: ex?.groupMain || it.muscle, gifUrl: it.gifUrl, imageDataUrl: undefined,
          restSec: it.restSec, seriesType: it.seriesType,
          tempo: it.tempo, rir: it.rir, rpe: it.rpe, notes: it.notes,
          routineExerciseId: it.routineExerciseId ?? it.id,
        })
      }
      return results
    }
  }catch{}
  // fallback a routineDays (legacy)
  try{
    const days = await db.routineDays.toArray()
    const day = days.find(d=> d.weekday === weekdayOfKey(todayKey()))
    if(day){
      const items = await db.routineExercises.where('routineDayId').equals(day.id).toArray()
      if(items.length){
        const exs = await db.exercises.bulkGet(items.map(i=>i.exerciseId))
        return items.map((it,i)=> ({ id: it.exerciseId, exId: it.exerciseId, name: (exs[i] as Exercise | undefined)?.name ?? it.exerciseId, sets: it.targetSets, reps: it.targetReps, weight: it.targetWeight ?? null, muscle: (exs[i] as Exercise | undefined)?.groupMain, restSec: it.restSec }))
      }
    }
  }catch{}
  return []
}
