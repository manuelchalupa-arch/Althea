import { useState, useEffect } from 'react'
import * as Gym from '@/services/exerciseGym'

export function ExerciseHeader({ name, muscle, secondary }: { name:string; muscle?:string; secondary?:string[] }){
  const secs = secondary || []
  const pcts = secs.length===0 ? [{n:muscle||'General', p:100}] : secs.length===1 ? [{n:muscle, p:60},{n:secs[0], p:40}] : [{n:muscle,p:60},{n:secs[0],p:30},{n:secs[1],p:10}]
  return (
    <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-2">
      <div className="font-body-md text-[15px] text-on-surface font-medium">{name}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {pcts.filter(x=>x.n).map(x=> (
          <span key={x.n} className={`px-2 py-0.5 rounded-full border font-label-caps text-[10px] uppercase ${x.p>=60?'bg-primary-container/20 border-primary/40 text-primary':'bg-surface-container-high/30 border-outline-variant/40 text-on-surface-variant'}`}>{x.n}: {x.p}%</span>
        ))}
      </div>
    </div>
  )
}

export function ExerciseHeaderInline({ exId, fallbackMuscle }:{ exId:string; fallbackMuscle?:string }){
  const [info,setInfo]=useState<any>(null)
  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      if(exId.includes('/')){
        try{
          const [m,slug]=exId.split('/')
          const ex:any = await Gym.fetchOne(m,slug).catch(()=>null)
          if(ex && !cancelled) {setInfo(ex)}
        }catch{}
      } else {
        try{
          const res=await Gym.fetchByMuscle('pectorals').catch(()=>null) as any
          const found=res?.exercises.find((e:any)=> e.id===exId)
          if(found && !cancelled) {setInfo(found)}
        }catch{}
      }
    }
    load()
    return ()=>{ cancelled=true }
  },[exId])
  const muscle = info?.muscle || fallbackMuscle || 'General'
  const secondary = info?.secondaryMuscles || []
  const pcts = secondary.length===0 ? [{n:muscle, p:100}] : secondary.length===1 ? [{n:muscle,p:60},{n:secondary[0],p:40}] : [{n:muscle,p:60},{n:secondary[0],p:30},{n:secondary[1],p:10}]
  return (
    <span className="inline-flex flex-wrap gap-1">
      {pcts.filter(x=>x.n).map(x=> (
        <span key={x.n} className="px-1.5 py-0.5 rounded-full bg-surface-container-high/30 border border-outline-variant/40 font-label-caps text-[10px] uppercase text-on-surface-variant">{x.n}: {x.p}%</span>
      ))}
    </span>
  )
}
