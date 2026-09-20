export default function ResultPanel({ today, sessionStatus }:{ today:string; sessionStatus:string }){
  let r: null | { exPct:number; setPct:number; completedEx:number; plannedEx:number; completedSets:number; plannedSets:number; totalVol:number; totalReps:number; durMin:number; survey:{sessionRating:number;pain:number}; highlights:string[] } = null
  try{ const raw = localStorage.getItem(`althea:result:${today}`); if(raw) {r = JSON.parse(raw)} }catch{ /* noop */ }
  if(!r) {return (
    <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 ">
      <div className="font-body-md text-[15px] text-on-surface font-medium">{sessionStatus==='COMPLETED' ? 'Entrenamiento completado — 100%' : 'Entrenamiento parcial'}</div>
      <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Sesión guardada en historial.</div>
    </div>
  )}
  const stats = [
    { k:'Ejercicios', v:`${r.completedEx}/${r.plannedEx}` },
    { k:'Series', v:`${r.completedSets}/${r.plannedSets}` },
    { k:'Cumplimiento', v:`${r.exPct}%` },
    { k:'Duración', v:`${r.durMin} min` },
    { k:'Volumen', v:`${r.totalVol} kg` },
    { k:'Reps', v:`${r.totalReps}` },
  ]
  return (
    <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6  space-y-3 fade-in">
      <div>
        <div className="font-headline-lg text-lg font-semibold text-on-surface">Esto es lo que hiciste</div>
        <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">{sessionStatus==='COMPLETED' ? 'Sesión completada — 100%' : `Sesión parcial — ${r.exPct}%`} · Valoración {r.survey.sessionRating}/5{r.survey.pain ? ' · Dolor reportado' : ''}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s)=>(
          <div key={s.k} className="bg-surface-container-high/30 border border-outline-variant/40 rounded-lg p-3 text-center">
            <div className="font-label-caps text-[10px] uppercase text-outline tracking-wider">{s.k}</div>
            <div className="font-headline-sm text-[20px] font-semibold text-on-surface">{s.v}</div>
          </div>
        ))}
      </div>
      {r.highlights.length>0 && (
        <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-3 space-y-1">
          <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Logros y progreso</div>
          {r.highlights.slice(0,5).map((h,i)=>(<p key={i} className="font-body-sm text-[13px] text-primary">{h}</p>))}
        </div>
      )}
    </div>
  )
}
