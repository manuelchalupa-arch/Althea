import BrandIcon from '@/components/brand/BrandIcon'
import * as Gym from '@/services/exerciseGym'

const INCOMPLETE_REASONS = ['Dolor / molestia','Falta de tiempo','Cansancio excesivo','Falta de equipamiento','Lesión','Otro']

/* ── Modify Modal ── */
export function ModifyModal({ show, onClose, exerciseName, mod, setMod, onApply }:{
  show:boolean; onClose:()=>void; exerciseName:string;
  mod:{weight:number;reps:number;sets:number;seriesType?:string}; setMod:(m:any)=>void; onApply:()=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Modificar {exerciseName}</h3>
        <div className="grid grid-cols-3 gap-2">
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Peso<input type="number" value={mod.weight} onChange={e=>setMod({...mod, weight:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Reps<input type="number" value={mod.reps} onChange={e=>setMod({...mod, reps:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series<input type="number" value={mod.sets} onChange={e=>setMod({...mod, sets:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
        </div>
        <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Tipo de serie
          <select onChange={e=> setMod({...mod, seriesType: e.target.value} as any)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
            <option>Normal</option><option>Ascendente</option><option>Descendente</option><option>Piramidal</option><option>DropSet</option><option>Otra</option>
          </select>
        </label>
        <button onClick={onApply} className="w-full py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Aplicar</button>
      </div>
    </div>
  )
}

/* ── Viewer Modal ── */
export function ViewerModal({ viewer, onClose }:{ viewer:any; onClose:()=>void }){
  if(!viewer) {return null}
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-4 flex justify-between"><span className="font-headline-lg text-base font-semibold text-on-surface">{viewer.name}</span><button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button></div>
        <div className="p-4">
          <div className="rounded bg-surface-container-low border border-outline-variant flex items-center justify-center min-h-[300px] p-2">
            {viewer.gifUrl ? <img src={viewer.gifUrl} alt={viewer.name} className="max-w-full max-h-[60vh] object-contain"/> : <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Sin GIF</span>}
          </div>
          <div className="font-label-caps text-[10px] uppercase text-on-surface-variant mt-2">{viewer.muscle} · {viewer.equipment}</div>
          <ol className="list-decimal list-inside font-body-md text-[15px] text-on-surface mt-1">{viewer.instructions?.slice(0,4).map((s:string,i:number)=><li key={i}>{s}</li>)}</ol>
        </div>
      </div>
    </div>
  )
}

/* ── Swap Modal ── */
export function SwapModal({ show, onClose, muscleName, swapLoading, swapOptions, swapExplain, setSwapExplain, onSwap, swapReason, setSwapReason, swapComment, setSwapComment }:{
  show:boolean; onClose:()=>void; muscleName?:string;
  swapLoading:boolean; swapOptions:any[]; swapExplain:string|null; setSwapExplain:(id:string|null)=>void;
  onSwap:(exercise:any)=>void; swapReason:string; setSwapReason:(v:string)=>void; swapComment:string; setSwapComment:(v:string)=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">Cambiar ejercicio — {muscleName || 'mismo grupo'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button>
        </div>
        <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Elegí una alternativa del mismo grupo muscular</p>
        <div className="space-y-2 max-h-60 overflow-auto">
          {swapLoading && <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Calculando similitud…</p>}
          {!swapLoading && swapOptions.length===0 && <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Sin alternativas en este grupo muscular.</p>}
          {!swapLoading && swapOptions.length>0 && <div className="font-label-caps text-[10px] uppercase text-secondary tracking-wider font-semibold">Mejor reemplazo · {swapOptions[0].score}%</div>}
          {!swapLoading && swapOptions.slice(0,1).map((r:any)=>(
            <div key={r.exercise.id} className="rounded bg-surface-container-high border border-primary/40 p-3">
              <button onClick={()=> onSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                <div className="flex-1 min-w-0"><div className="font-body-md text-[15px] text-on-surface font-medium truncate">{r.exercise.name}</div><div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                <span className="font-headline-sm text-[20px] font-semibold text-on-surface shrink-0">{r.score}%</span>
              </button>
              <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="font-label-caps text-[10px] text-secondary underline mt-1">Por qué este %</button>
              {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f:any)=>(<li key={f.key} className="font-label-caps text-[10px] uppercase text-on-surface-variant">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
            </div>
          ))}
          {!swapLoading && swapOptions.length>1 && <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider font-medium pt-1">Otras alternativas</div>}
          {!swapLoading && swapOptions.slice(1).map((r:any)=>(
            <div key={r.exercise.id} className="rounded bg-surface-container border border-outline-variant p-3">
              <button onClick={()=> onSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                <div className="flex-1 min-w-0"><div className="font-body-md text-[15px] text-on-surface font-medium truncate">{r.exercise.name}</div><div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                <span className="font-headline-sm text-[20px] font-semibold text-on-surface shrink-0">{r.score}%</span>
              </button>
              <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="font-label-caps text-[10px] text-secondary underline mt-1">Por qué este %</button>
              {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f:any)=>(<li key={f.key} className="font-label-caps text-[10px] uppercase text-on-surface-variant">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
            </div>
          ))}
        </div>
        <select value={swapReason} onChange={(e)=>setSwapReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
          <option value="">Motivo del cambio…</option>
          {['Molestia / dolor','Falta de equipamiento','Prefiero otra variante','Recomendación del coach','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
        </select>
        <textarea value={swapComment} onChange={(e)=>setSwapComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        <button onClick={onClose} className="w-full py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
      </div>
    </div>
  )
}

/* ── Skip Reason Modal ── */
export function SkipReasonModal({ show, onClose, exerciseName, skipReason, setSkipReason, onConfirm }:{
  show:boolean; onClose:()=>void; exerciseName?:string;
  skipReason:string; setSkipReason:(v:string)=>void; onConfirm:()=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Saltar {exerciseName}</h3>
        <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Motivo (opcional)</p>
        <textarea value={skipReason} onChange={e=>setSkipReason(e.target.value)} placeholder="Ej: molestia en hombro, sin equipamiento, fatiga..." rows={3} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar salto</button>
          <button onClick={()=>{onClose(); setSkipReason('')}} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Cancel Modal ── */
export function CancelModal({ show, onClose, reason, setReason, comment, setComment, onConfirm }:{
  show:boolean; onClose:()=>void;
  reason:string; setReason:(v:string)=>void; comment:string; setComment:(v:string)=>void; onConfirm:()=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Cancelar entrenamiento</h3>
        <p className="font-body-sm text-[13px] text-on-surface-variant">La cancelación requiere justificación y queda registrada.</p>
        <select value={reason} onChange={(e)=>setReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
          <option value="">Seleccioná motivo…</option>
          {['Falta de tiempo','Cansancio','Indisposición','Cambio de planes','Falta de equipamiento','Falta de disponibilidad','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
        </select>
        <textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar cancelación</button>
          <button onClick={onClose} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Volver</button>
        </div>
      </div>
    </div>
  )
}

/* ── Abandon Modal ── */
export function AbandonModal({ show, onClose, reason, setReason, comment, setComment, onConfirm }:{
  show:boolean; onClose:()=>void;
  reason:string; setReason:(v:string)=>void; comment:string; setComment:(v:string)=>void; onConfirm:()=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Abandonar entrenamiento</h3>
        <p className="font-body-sm text-[13px] text-on-surface-variant">Se conservan las series y ejercicios ya registrados. El abandono queda como dato histórico.</p>
        <select value={reason} onChange={(e)=>setReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
          <option value="">Seleccioná motivo…</option>
          {['Falta de tiempo','Cansancio','Dolor/molestia','Indisposición','Cambio de planes','Falta de equipamiento','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
        </select>
        <textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar abandono</button>
          <button onClick={onClose} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Volver</button>
        </div>
      </div>
    </div>
  )
}

/* ── Add Extra Exercise Modal ── */
export function AddExtraModal({ show, onClose, options, reason, setReason, comment, setComment, onAdd }:{
  show:boolean; onClose:()=>void; options:Gym.Exercise[];
  reason:string; setReason:(v:string)=>void; comment:string; setComment:(v:string)=>void; onAdd:(ex:Gym.Exercise)=>void
}){
  if(!show) {return null}
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">Agregar ejercicio EXTRA</h3>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button>
        </div>
        <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">No planificado · quedará marcado EXTRA con su motivo.</p>
        <select value={reason} onChange={(e)=>setReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
          <option value="">Motivo del agregado…</option>
          {['Quiero trabajar más este grupo','Me siento con energía','Recomendación del coach','Recuperar ejercicio pendiente','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
        </select>
        <textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        <div className="space-y-2 max-h-60 overflow-auto">
          {options.map((opt)=>(
            <button key={opt.id} onClick={()=>onAdd(opt)} className="w-full text-left p-3 rounded bg-surface-container border border-outline-variant flex items-center gap-3 hover:bg-surface-container-high/40 transition">
              {opt.gifUrl ? <img src={opt.gifUrl} alt={opt.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
              <div>
                <div className="font-body-md text-[15px] text-on-surface font-medium">{opt.name}</div>
                <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{opt.muscle} · {opt.equipment}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Finish Modal ── */
export function FinishModal({ show, onClose, summary, rutinaName, weekNumber, plannedDayN, plannedName, actualDayN, dayName, exs, logs, pendingReasons, setPendingReasons, skipReasons, musclePct, volumeAlerts, progressLines, finishSurvey, setFinishSurvey, finishError, isSaving, onConfirm, session, sessionId, setSession, setSessionStatus }:{
  show:boolean; onClose:()=>void; summary:any;
  rutinaName:string; weekNumber:number; plannedDayN:number|null; plannedName:string; actualDayN:number|null; dayName:string;
  exs:any[]; logs:Record<number,any[]>; pendingReasons:Record<number,{reason:string;comment:string}>; setPendingReasons:(fn:(p:Record<number,{reason:string;comment:string}>)=>Record<number,{reason:string;comment:string}>)=>void;
  skipReasons:Record<number,string>; musclePct:{m:string;pct:number}[]; volumeAlerts:string[]; progressLines:Record<string,string>;
  finishSurvey:any; setFinishSurvey:(fn:(p:any)=>any)=>void; finishError:string; isSaving:boolean; onConfirm:()=>void;
  session:any; sessionId:string; setSession:(s:any)=>void; setSessionStatus:(s:any)=>void
}){
  if(!show) {return null}
  const s = summary
  const setSurvey = (k:string,v:any)=> setFinishSurvey((p:any)=> ({...p,[k]:v}))
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">Finalizar entrenamiento</h3>
          <span className="px-3 py-1 rounded-full bg-secondary-container/20 border border-secondary/30 text-secondary font-label-caps text-[10px] uppercase">COMPLETING</span>
        </div>

        <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-3">
          <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider mb-2">RESUMEN</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Rutina</span><span className="font-body-md text-[15px] text-on-surface text-right">{rutinaName}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Semana</span><span className="font-body-md text-[15px] text-on-surface text-right">{weekNumber}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día planificado</span><span className="font-body-md text-[15px] text-on-surface text-right">{plannedDayN!=null ? `N°${plannedDayN} ${plannedName}` : '—'}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día realizado</span><span className="font-body-md text-[15px] text-on-surface text-right">{actualDayN!=null ? `N°${actualDayN} ${dayName}` : dayName}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios planificados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.plannedEx}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios completados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.completedEx}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios no realizados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.pendingIdx.length}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios omitidos</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.skippedIdx.length}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios modificados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.modified}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios reemplazados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.replaced}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series planificadas</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.plannedSets}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series realizadas</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.completedSets}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Repeticiones</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.totalReps}</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Volumen</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.totalVol} kg</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Duración</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.durMin} min</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.exPct}%</span>
            <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.setPct}%</span>
          </div>
          {(s.pendingIdx.length===0 && s.skippedIdx.length===0)
            ? <p className="font-label-caps text-[10px] text-primary mt-2">Todos los ejercicios planificados fueron registrados.</p>
            : <p className="font-label-caps text-[10px] text-secondary mt-2">Entrenamiento parcial — {s.exPct}% · El entrenamiento tiene ejercicios pendientes.</p>}
        </div>

        {s.pendingIdx.length>0 && (
          <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-3">
            <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Ejercicios pendientes — ¿Qué ocurrió?</div>
            {s.pendingIdx.map((i:number)=>(
              <div key={i} className="rounded bg-surface-container-high/30 border border-outline-variant/30 p-3 space-y-2">
                <div className="font-body-md text-[15px] text-on-surface font-medium">{exs[i]?.name} no fue realizado.</div>
                <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">Planificado: {exs[i]?.sets} series · Realizado: {((logs[i]||[]).filter(Boolean) as any[]).length} series</div>
                <select value={pendingReasons[i]?.reason || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: e.target.value, comment: p[i]?.comment || '' }}))} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                  <option value="">Seleccioná motivo…</option>
                  {INCOMPLETE_REASONS.map((r)=> <option key={r} value={r}>{r}</option>)}
                </select>
                <textarea value={pendingReasons[i]?.comment || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: p[i]?.reason || '', comment: e.target.value }}))} placeholder="Observación / explicación" rows={2} maxLength={500} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              </div>
            ))}
          </div>
        )}

        {s.skippedIdx.length>0 && (
          <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
            <div className="font-label-caps text-[10px] uppercase text-on-surface-variant font-semibold tracking-wider">Omitidos durante la sesión (con motivo)</div>
            {s.skippedIdx.map((i:number)=> <p key={i} className="font-body-sm text-[13px] text-on-surface-variant">{exs[i]?.name} — {skipReasons[i] || pendingReasons[i]?.comment || 'sin motivo'}</p>)}
          </div>
        )}

        {musclePct.length>0 && (
          <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
            <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider mb-1">Trabajo muscular real</div>
            {musclePct.map((x)=>(
              <div key={x.m} className="flex items-center gap-2 text-sm">
                <span className="font-label-caps text-[10px] uppercase text-on-surface-variant w-24 capitalize">{x.m}</span>
                <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden"><div className="h-2 bg-primary rounded-full" style={{width: `${x.pct}%`}}/></div>
                <span className="font-body-md text-[15px] text-on-surface w-10 text-right">{x.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {volumeAlerts.length>0 && (
          <div className="rounded bg-secondary-container/20 border border-secondary/30 p-3 space-y-1">
            <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Alertas de volumen / frecuencia</div>
            {volumeAlerts.map((a,i)=> <p key={i} className="font-body-sm text-[13px] text-on-surface-variant">{a}</p>)}
          </div>
        )}

        {Object.keys(progressLines).length>0 && (
          <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
            <div className="font-label-caps text-[10px] uppercase text-on-surface-variant font-semibold tracking-wider mb-1">Progreso vs anterior</div>
            {Object.entries(progressLines).map(([k,v])=> <p key={k} className="font-body-sm text-[13px] text-on-surface-variant">{v}</p>)}
          </div>
        )}

        <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-3">
          <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Encuesta rápida</div>
          <div>
            <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">¿Cómo estuvo la sesión?</label>
            <div className="flex gap-2">
              {[{ v:2, label:'Fácil' },{ v:3, label:'Normal' },{ v:4, label:'Difícil' }].map(({ v, label })=>(
                <button key={v} onClick={()=> setSurvey('sessionRating', v)}
                  className={`flex-1 py-2 rounded border transition text-sm font-medium ${Number(finishSurvey.sessionRating)===v ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-high/30 border-outline-variant text-on-surface-variant'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">¿Dolor muscular?</label>
            <div className="flex gap-1.5">
              {[{ v:0, label:'No' },{ v:1, label:'Sí' }].map(({ v, label })=>(
                <button key={v} onClick={()=> setSurvey('pain', v)}
                  className={`flex-1 py-1.5 rounded border transition text-sm font-medium ${Number(finishSurvey.pain)===v ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-high/30 border-outline-variant text-on-surface-variant'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {finishSurvey.pain === 1 && (
            <>
              <div>
                <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">Zona del dolor</label>
                <select value={finishSurvey.painZone || ''} onChange={e=> setSurvey('painZone', e.target.value)} className="w-full bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                  <option value="">Seleccionar zona</option>
                  {['Hombros','Pecho','Espalda','Brazos','Abdomen','Glúteos','Piernas','Rodillas','Lumbar','Cuello','Otro'].map((z)=><option key={z} value={z.toLowerCase()}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">Detalle del dolor</label>
                <textarea value={finishSurvey.painDetail || ''} onChange={e=> setSurvey('painDetail', e.target.value)} placeholder="Descripción (opcional)" rows={2} className="w-full bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              </div>
            </>
          )}
          <input value={finishSurvey.comment || ''} onChange={(e)=> setSurvey('comment', e.target.value)} placeholder="Observación (opcional)" maxLength={200} className="w-full bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
        </div>

        {finishError && <p className="text-sm text-red-400">{finishError}</p>}

        <button onClick={onConfirm} disabled={isSaving} className="w-full py-3 px-5 rounded bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm disabled:opacity-50">
          {isSaving ? 'Guardando…' : ((s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'Confirmar — COMPLETED' : `Confirmar — PARTIAL (${s.exPct}%)`)}
        </button>
        <button onClick={async()=>{ try{ const store = await import('@/services/training/sessionStore'); const targetId = session?.sessionId || sessionId; if(targetId){ const cur = await store.getSession(targetId).catch(()=>null); if(cur && cur.sessionStatus==='COMPLETING'){ const nx = await store.transitionSession(targetId,'IN_PROGRESS'); setSession(nx); setSessionStatus('IN_PROGRESS') } } }catch{ /* noop */ } onClose() }} className="w-full py-2.5 rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/50 font-label-caps text-[10px] uppercase text-on-surface-variant">Volver al entrenamiento</button>
      </div>
    </div>
  )
}
