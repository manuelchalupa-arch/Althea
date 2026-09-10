import { db } from '@/services/storage/db'

export type DayEx = { id:string; name:string; sets:number; reps:number; weight:number; muscle?:string; gifUrl?:string; imageDataUrl?:string; exId:string; restSec?:number; seriesType?:string }

export async function getDayExercises(dayN:number | null, cycle:any): Promise<DayEx[]> {
  if(!dayN) return []
  // intenta desde rutinas:list activa
  try{
    const rawList = JSON.parse(localStorage.getItem('rutinas:list')||'null')
    const activeId = localStorage.getItem('rutina:activeId')
    const active:any = rawList?.find((r:any)=>r.id===activeId) || rawList?.[0]
    if(active?.dayExercises?.[dayN] && active.dayExercises[dayN].length>0){
      const arr = active.dayExercises[dayN]
      // intenta resolver nombres desde db.exercises si falta
      const exs = await db.exercises.bulkGet(arr.map((x:any)=>x.exId)).catch(()=>[])
      return arr.map((it:any,i:number)=>{
        const ex:any = (exs as any)?.[i]
        return { id: it.exId, exId: it.exId, name: ex?.name || it.name || it.exId, sets: it.sets, reps: it.reps, weight: it.weight, muscle: ex?.groupMain || (it as any).muscle, gifUrl: (it as any).gifUrl, imageDataUrl: (it as any).imageDataUrl, restSec: (it as any).restSec, seriesType: (it as any).seriesType }
      })
    }
  }catch{}
  // fallback a routineDays (legacy)
  try{
    const days = await db.routineDays.toArray()
    const day = days.find(d=> d.weekday === new Date().getDay())
    if(day){
      const items = await db.routineExercises.where('routineDayId').equals(day.id).toArray()
      if(items.length){
        const exs = await db.exercises.bulkGet(items.map(i=>i.exerciseId))
        return items.map((it,i)=> ({ id: it.exerciseId, exId: it.exerciseId, name: (exs[i] as any)?.name ?? it.exerciseId, sets: it.targetSets, reps: it.targetReps, weight: it.targetWeight, muscle: (exs[i] as any)?.groupMain, restSec: (it as any).restSec }))
      }
    }
  }catch{}
  // SIN fallback genérico pecho — devuelve vacío para que el usuario agregue en Rutina
  return []
}

export function muscleForDayName(dayName:string): string {
  const lower = dayName.toLowerCase()
  if(lower.includes('pecho')) return 'pecho'
  if(lower.includes('espalda')) return 'espalda'
  if(lower.includes('hombro')) return 'hombros'
  if(lower.includes('pierna')) return 'piernas'
  if(lower.includes('biceps') || lower.includes('bíceps')) return 'biceps'
  if(lower.includes('triceps') || lower.includes('tríceps')) return 'triceps'
  if(lower.includes('abdomen') || lower.includes('abdominal')) return 'abdominales'
  return 'general'
}
