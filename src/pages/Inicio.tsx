import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate, formatAgendaDate } from '@/utils/cycle'
import { recoveryScore, recoveryColor } from '@/utils/calc'
import { Play, ChevronRight, Droplets, Moon, Heart, Dumbbell, Info, Cpu } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { detectCapabilities } from '@/services/ai/capabilities'

export default function Inicio(){
  const nav = useNavigate()
  const todayStr = new Date().toISOString().slice(0,10)
  const { dayName, dayNum, month } = formatAgendaDate(todayStr)
  const [cycle, setCycle] = useState(getCycleFromProfile(null))
  const [exNames, setExNames] = useState<{id:string; name:string; sets:number; reps:number; weight:number}[]>([])
  const [showCoachWhy, setShowCoachWhy] = useState(false)
  const [hydration, setHydration] = useState(1900)
  const [coachRec,setCoachRec]=useState<any>(null)
  const [coachCap,setCoachCap]=useState<any>(null)
  const [showModify,setShowModify]=useState(false)
  const [showReject,setShowReject]=useState(false)
  const [modifyChoice,setModifyChoice]=useState('Tiempo disponible')
  const [rejectMotive,setRejectMotive]=useState('No tengo tiempo')
  const [hasActiveSession,setHasActiveSession]=useState(false)
  const [briefScore,setBriefScore]=useState<number|null>(null)
  const [briefWarn,setBriefWarn]=useState<string|null>(null)
  useEffect(()=>{
    import('@/services/ai/globalScore').then(({ buildGlobalScore })=> buildGlobalScore().then((g)=> setBriefScore(g.score)).catch(()=>{}))
    import('@/services/ai/coachInsights').then(({ buildInsights })=> buildInsights().then((all)=>{ const w = all.find((i)=> i.level==='warn'); setBriefWarn(w ? w.title : null) }).catch(()=>{}))
  },[])
  const [showChangeDay,setShowChangeDay]=useState(false)
  const [changeReason,setChangeReason]=useState('Cambio de horarios')
  const [changeComment,setChangeComment]=useState('')
  const [overrideDay,setOverrideDay]=useState<number|null>(()=>{
    const v=localStorage.getItem(`session:override:${todayStr}`)
    return v ? Number(v) : null
  })
  const [weekOffset,setWeekOffset]=useState(0)
  const [dayStatus,setDayStatus]=useState<Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean}>>({})
  const [selectedDate,setSelectedDate]=useState<string>(todayStr)
  const [previewList,setPreviewList]=useState<{id:string;name:string;sets:number;reps:number;weight:number;restSec?:number;seriesType?:string}[]>([])
  const [previewName,setPreviewName]=useState('')

  const loadDay = async (cycleToUse:any, dayN:number | null)=>{
    const { getDayExercises } = await import('@/utils/routine')
    const list = await getDayExercises(dayN, cycleToUse)
    setExNames(list.map(x=> ({id:x.exId, name:x.name, sets:x.sets, reps:x.reps, weight:x.weight})))
  }
  const isoOf = (d:Date)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const weekKeys = useMemo(()=>{
    const base = new Date(todayStr+'T12:00:00')
    const dowMon0 = (base.getDay()+6)%7
    const mon = new Date(base); mon.setDate(base.getDate()-dowMon0+weekOffset*7)
    return Array.from({length:7},(_,i)=>{ const dt=new Date(mon); dt.setDate(mon.getDate()+i); return isoOf(dt) })
  },[todayStr, weekOffset])

  useEffect(()=>{
    const loadWeek = async ()=>{
      const sessions = await db.table('trainingSessions').toArray().catch(()=>[]) as any[]
      const byDate: Record<string,any> = {}
      for(const s of sessions){
        const k = s.calendarDate || s.localDate
        if(!k) continue
        const prev = byDate[k]
        if(!prev || String(s.updatedAt||'') > String(prev.updatedAt||'')) byDate[k] = s
      }
      const map: Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean}> = {}
      for(const iso of weekKeys){
        const dow = new Date(iso+'T12:00:00').getDay()
        const n = cycle.weekMap[dow] ?? null
        const nm = n ? cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}` : null
        const sess = byDate[iso]
        map[iso] = {
          planned: n != null,
          dayN: n, dayName: nm,
          sessionStatus: sess?.sessionStatus || null,
          overridden: !!localStorage.getItem(`session:override:${iso}`),
        }
      }
      setDayStatus(map)
    }
    loadWeek()
  },[cycle, weekKeys, overrideDay])

  useEffect(()=>{
    const dow = new Date(selectedDate+'T12:00:00').getDay()
    const n = cycle.weekMap[dow] ?? null
    if(n == null){ setPreviewList([]); setPreviewName('Descanso'); return }
    setPreviewName(cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}`)
    import('@/utils/routine').then(({getDayExercises})=> getDayExercises(n, cycle).then(setPreviewList).catch(()=>setPreviewList([])))
  },[selectedDate, cycle])

  const dayCellClass = (iso:string)=>{
    const st = dayStatus[iso]
    const base = 'rounded-lg border p-1.5 text-center transition min-w-0 '
    const sel = selectedDate===iso ? 'ring-2 ring-info ' : ''
    if(!st) return base + sel + 'bg-bg border-border'
    if(st.sessionStatus==='COMPLETED') return base + sel + 'st-completed border'
    if(st.sessionStatus==='PARTIAL') return base + sel + 'st-partial border'
    if(st.sessionStatus==='CANCELLED') return base + sel + 'st-cancelled border'
    if(st.sessionStatus==='ABANDONED') return base + sel + 'st-abandoned border'
    if(st.sessionStatus==='IN_PROGRESS' || st.sessionStatus==='PAUSED' || st.sessionStatus==='COMPLETING' || st.sessionStatus==='READY') return base + sel + 'st-active border'
    if(st.planned) return base + sel + 'bg-surface border-primary/60'
    return base + sel + 'bg-bg border-border opacity-70'
  }
  const wdLabel = (iso:string)=> new Date(iso+'T12:00:00').toLocaleDateString('es',{weekday:'short'}).replace('.','').toUpperCase()
  const wdNum = (iso:string)=> Number(iso.slice(8,10))

  useEffect(()=>{
    ensureSeeded()
    db.userProfile.get('me').then(p=>{
      const c = getCycleFromProfile(p as any)
      setCycle(c)
      const override = localStorage.getItem(`session:override:${todayStr}`)
      const n = override ? Number(override) : getTrainingDayForDate(todayStr, c).n
      loadDay(c, n)
    })
    const h = Number(localStorage.getItem('hydration:'+todayStr) || '1900')
    setHydration(h)
    import('@/services/training/sessionStore').then(({ getActiveSession })=> getActiveSession().then((s)=> setHasActiveSession(!!s && s.calendarDate===todayStr)).catch(()=>{})).catch(()=>{})
    buildTrainingContext('ex-001','Press banca').then(ctx=> aiService.generateRecommendation(ctx).then(setCoachRec).catch(()=>{}))
    detectCapabilities().then(setCoachCap)
  },[])

  const rawAgenda = getTrainingDayForDate(todayStr, cycle)
  const effectiveN = overrideDay ?? rawAgenda.n
  const effectiveInfo = effectiveN ? { n: effectiveN, name: cycle.trainingDays.find(d=>d.n===effectiveN)?.name || rawAgenda.name, isRest: false } : rawAgenda
  const agenda:any = effectiveInfo
  const isRest = !effectiveN ? true : (overrideDay ? false : rawAgenda.isRest)
  const isOverridden = overrideDay !== null && overrideDay !== rawAgenda.n

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Header agenda */}
      <div className="px-4 pt-6 pb-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-title tracking-tight">{dayName} {dayNum}</div>
            <div className="text-subtitle text-textMuted -mt-1">{month}</div>
          </div>
          <div className="text-aux text-textMuted text-right">
            <div>HOY</div>
            <div className="w-2 h-2 bg-action rounded-full ml-auto mt-1"></div>
          </div>
        </div>

        {/* Chip Día N° + Cambiar día */}
        <div className="mt-4 rounded-xl bg-accentDark border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-aux text-info font-medium tracking-widest">{isRest ? 'DÍA DE DESCANSO' : `DÍA DE ENTRENAMIENTO N.º ${agenda.n}`}{isOverridden && <span className="ml-2 text-aux bg-info/20 text-info px-2 py-0.5 rounded-full">cambiado hoy</span>}</div>
              <div className="text-section text-textMain">{isRest ? 'Recuperación' : agenda.name}</div>
              {isOverridden && <div className="text-aux text-textMuted">Programado: DÍA N.º {rawAgenda.n} {rawAgenda.name} → Hoy: N.º {effectiveN}</div>}
            </div>
            <span className="text-aux bg-surface border border-border px-3 py-1 rounded-full hidden sm:block">{!isRest ? `${exNames.length} ejercicios` : 'Descanso'}</span>
          </div>
          <button onClick={()=>setShowChangeDay(true)} className="mt-3 w-full py-2 rounded-xl bg-surface border border-border text-aux flex items-center justify-center gap-1">
            Cambiar día de entrenamiento
          </button>
        </div>
        {/* Tira semanal: días de entrenamiento y descanso */}
        <div className="mt-3 rounded-xl bg-surface border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={()=>setWeekOffset(o=>o-1)} aria-label="Semana anterior" className="px-3 py-1 rounded-lg bg-bg border border-border text-body">‹</button>
            <span className="text-aux">{weekOffset===0 ? 'Esta semana' : weekOffset>0 ? `+${weekOffset} sem` : `${-weekOffset} sem atrás`}</span>
            <button onClick={()=>{ setWeekOffset(o=>o+1) }} aria-label="Semana siguiente" className="px-3 py-1 rounded-lg bg-bg border border-border text-body">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekKeys.map((iso)=>{
              const st = dayStatus[iso]
              const isToday = iso===todayStr
              return (
                <button key={iso} onClick={()=>setSelectedDate(iso)} aria-label={`${wdLabel(iso)} ${wdNum(iso)}${st?.planned ? ', entrenamiento' : ', descanso'}${st?.sessionStatus ? `, ${st.sessionStatus}` : ''}`} className={dayCellClass(iso)}>
                  <div className="text-aux leading-none">{wdLabel(iso)}</div>
                  <div className={`text-body leading-tight mt-0.5 ${isToday ? 'font-bold underline' : 'font-medium'}`}>{wdNum(iso)}</div>
                  <div className="text-aux leading-none mt-0.5 truncate">
                    {st?.sessionStatus==='COMPLETED' ? '✓' : st?.sessionStatus==='PARTIAL' ? '◐' : st?.sessionStatus==='CANCELLED' ? '✕' : st?.sessionStatus==='ABANDONED' ? '○' : (st?.sessionStatus==='IN_PROGRESS' || st?.sessionStatus==='PAUSED') ? '●' : st?.planned ? '·' : '–'}
                    {st?.overridden ? ' ↻' : ''}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-aux text-textMuted">
            <span>✓ completado</span><span>◐ parcial</span><span>✕ cancelado</span><span>○ abandonado</span><span>● en curso</span><span>· planificado</span><span>– descanso</span><span>↻ modificado</span>
          </div>
        </div>

        {/* Previsualización de rutina del día seleccionado (solo plan, no inicia sesión) */}
        <div className="mt-3 rounded-xl bg-surface border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-aux font-medium">PREVISUALIZACIÓN · {wdLabel(selectedDate)} {wdNum(selectedDate)}</span>
            {selectedDate===todayStr && <span className="text-aux bg-elevated border border-border px-2 py-0.5 rounded-full">HOY</span>}
          </div>
          <div className="text-subtitle mt-0.5">{previewName || '—'}</div>
          {dayStatus[selectedDate]?.sessionStatus && (
            <div className="text-aux mt-1">Estado registrado: {dayStatus[selectedDate]?.sessionStatus}{dayStatus[selectedDate]?.overridden ? ' · día modificado' : ''}</div>
          )}
          {previewList.length===0 ? (
            <p className="text-aux text-textMuted mt-1">Descanso — sin ejercicios planificados.</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {previewList.map((ex,i)=>(
                <li key={ex.id} className="flex items-baseline gap-2 text-body text-sm">
                  <span className="text-aux w-4 shrink-0">{i+1}</span>
                  <span className="flex-1 min-w-0 truncate">{ex.name}</span>
                  <span className="text-aux shrink-0">{ex.sets}×{ex.reps}{ex.weight ? ` · ${ex.weight}kg` : ''}{ex.restSec ? ` · ⏱${ex.restSec}s` : ''}{ex.seriesType && ex.seriesType!=='Normal' ? ` · ${ex.seriesType}` : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-aux text-textMuted mt-2">Solo plan — no inicia entrenamiento. Se comienza exclusivamente con ENTRENAR.</p>
        </div>
      </div>

      {briefScore !== null && (
        <div className="px-4 max-w-lg lg:max-w-3xl mx-auto">
          <Link to="/coach" className="block rounded-xl bg-surface border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-aux">COACH · ESTADO {briefScore}/100</span>
              <ChevronRight size={16} className="text-textMuted"/>
            </div>
            {briefWarn ? <p className="text-body text-sm mt-1">{briefWarn}</p> : <p className="text-aux mt-1">Todo estable por acá.</p>}
          </Link>
        </div>
      )}
      {/* Contenido principal */}
      <div className="px-4 max-w-lg lg:max-w-3xl mx-auto space-y-3">
        {isRest ? (
          <>
            <div className="rounded-xl bg-surface border border-border p-3">
              <div className="text-subtitle">Día de descanso</div>
              <p className="text-muted mt-1">Aprovechá para recuperar. La agenda sigue siendo útil.</p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg bg-bg border border-border p-3">
                  <div className="text-aux flex items-center gap-1"><Moon size={14}/> Sueño</div>
                  <div className="text-subtitle">7h 20m</div>
                </div>
                <div className="rounded-lg bg-bg border border-border p-3">
                  <div className="text-aux flex items-center gap-1"><Heart size={14}/> Energía</div>
                  <div className="text-subtitle">82%</div>
                </div>
                <div className="rounded-lg bg-bg border border-border p-3">
                  <div className="text-aux">Fatiga</div>
                  <div className="text-subtitle text-action">Baja</div>
                </div>
                <div className="rounded-lg bg-bg border border-border p-3">
                  <div className="text-aux flex items-center gap-1"><Droplets size={14}/> Agua</div>
                  <div className="text-subtitle">{hydration} / 2500 ml</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-surface border border-border p-3 flex justify-between items-center">
              <div>
                <div className="text-aux">PRÓXIMO ENTRENAMIENTO</div>
                <div className="text-subtitle">Día N.º {cycle.trainingDays[0]?.n} — {cycle.trainingDays[0]?.name}</div>
              </div>
              <ChevronRight size={18} className="text-textMuted"/>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-surface border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-aux">Hoy · {exNames.length} ejercicios · {exNames.reduce((a,e)=>a+e.sets,0)} series</span>
                <span className="text-aux text-info">{agenda.n ? `Rutina ${agenda.name}` : 'Sin rutina'}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {exNames.slice(0,4).map(ex=>(
                  <div key={ex.id} className="flex items-center gap-2 text-body text-sm">
                    <span className="w-1.5 h-1.5 bg-action rounded-full"></span>{ex.name} <span className="text-aux">· {ex.sets}×{ex.reps}</span>
                  </div>
                ))}
                {exNames.length>4 && <div className="text-aux text-center">+{exNames.length-4} más</div>}
              </div>
              <button onClick={async()=>{
                const rawList = JSON.parse(localStorage.getItem('rutinas:list')||'null')
                const activeId = localStorage.getItem('rutina:activeId')
                const active:any = rawList?.find((r:any)=>r.id===activeId) || rawList?.[0]
                const n = effectiveN
                const { getDayExercises } = await import('@/utils/routine')
                const list = await getDayExercises(n, cycle)
                const { createReadySession } = await import('@/services/training/sessionMachine')
                const changedRaw = localStorage.getItem(`session:changed:${todayStr}`)
                const changed = changedRaw ? JSON.parse(changedRaw) : null
                const weekNumber = (()=>{ try{
                  const start = new Date((cycle as any).startDate || todayStr)
                  const now = new Date(todayStr)
                  return Math.max(1, Math.floor((now.getTime()-start.getTime())/(7*86400000))+1)
                }catch{ return 1 } })()
                await createReadySession({
                  calendarDate: todayStr,
                  routineId: active?.id || 'r1',
                  routineName: active?.name || 'Rutina',
                  plannedDay: rawAgenda.n ?? null,
                  plannedDayName: rawAgenda.name ?? null,
                  actualDay: n ?? null,
                  actualDayName: agenda.name ?? null,
                  exercises: list.map((x:any)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl })),
                  dayChangeReason: changed?.changeReason || (isOverridden ? 'Cambio de día desde Inicio' : undefined),
                  dayChangeComment: changed?.changeComment,
                  weekNumber,
                })
                window.dispatchEvent(new Event('routineChange'))
                nav('/entrenar')
              }} className="mt-3 w-full py-2.5 rounded-xl bg-action text-textMain font-medium flex items-center justify-center gap-2"><Play size={16}/> {hasActiveSession ? 'CONTINUAR' : 'ENTRENAR'}</button>
            </div>
          </>
        )}

        <div className="text-aux text-center py-2">
          Agenda inteligente · Hoy domina, resto secundario · <Link to="/rutina" className="text-info underline">Configurar ciclo</Link>
        </div>
      </div>

      {showChangeDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowChangeDay(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-3 max-h-[85vh] overflow-auto">
            <h3 className="text-subtitle">Cambiar entrenamiento de hoy</h3>
            {rawAgenda.isRest ? (
              <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3">
                <div className="text-aux text-amber-300 flex items-center gap-1"><BrandIcon name="alert" size={14}/> Este día estaba configurado como descanso.</div>
                <p className="text-aux mt-1">Estás intentando entrenar en un día no planificado. Esto puede reducir recuperación.</p>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3">
                <div className="text-aux text-amber-300 flex items-center gap-1"><BrandIcon name="alert" size={14}/> Hoy estaba programado {rawAgenda.name}.</div>
                <p className="text-aux">Este cambio altera la distribución semanal prevista.</p>
              </div>
            )}
            <p className="text-aux">Seleccioná qué día querés realizar:</p>
            {cycle.trainingDays.map(d=>(
              <button
                key={d.n}
                onClick={()=>{
                  // guarda motivo estructurado
                  const obs={ date: todayStr, plannedDay: rawAgenda.n, plannedName: rawAgenda.name, actualDay: d.n, actualName: d.name, changeReason, changeComment, changedByUser:true, at: new Date().toISOString()}
                  localStorage.setItem(`session:override:${todayStr}`, String(d.n))
                  localStorage.setItem(`session:changed:${todayStr}`, JSON.stringify(obs))
                  localStorage.setItem(`session:observation:${todayStr}`, JSON.stringify(obs))
                  setOverrideDay(d.n)
                  loadDay(cycle, d.n)
                  buildTrainingContext().then(ctx=> aiService.generateRecommendation({...ctx, dia: `Día N°${d.n} ${d.name}`} as any).then(setCoachRec).catch(()=>{}))
                  window.dispatchEvent(new Event('routineChange'))
                  setShowChangeDay(false)
                }}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between ${effectiveN===d.n?'bg-action text-textMain border-action':'bg-surface border-border text-body'}`}
              >
                <span>DÍA N.º {d.n} — {d.name}</span>
                {effectiveN===d.n && <span className="text-aux">● actual</span>}
              </button>
            ))}
            <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
              <div className="text-aux">¿Por qué vas a entrenar hoy? / ¿Por qué cambias?</div>
              <select value={changeReason} onChange={e=>setChangeReason(e.target.value)} className="w-full bg-bg border border-border rounded-xl p-2 text-body">
                <option>Cambio de horarios</option><option>No pude entrenar el día original</option><option>Me siento recuperado</option><option>Necesidad personal</option><option>Disponibilidad de gimnasio</option><option>Reprogramación</option><option>Otro</option>
              </select>
              <textarea value={changeComment} onChange={e=>setChangeComment(e.target.value)} placeholder="Observación / explicación" rows={2} className="w-full bg-bg border border-border rounded-xl p-2 text-body"/>
            </div>
            <button onClick={()=>{
              localStorage.removeItem(`session:override:${todayStr}`)
              localStorage.removeItem(`session:changed:${todayStr}`)
              setOverrideDay(null)
              const n = rawAgenda.n
              loadDay(cycle, n)
              window.dispatchEvent(new Event('routineChange'))
              setShowChangeDay(false)
            }} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Volver al programado ({rawAgenda.n? `N.º ${rawAgenda.n} ${rawAgenda.name}` : 'Descanso'})</button>
            <button onClick={()=>setShowChangeDay(false)} className="w-full py-2 rounded-xl bg-bg border border-border text-aux">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseQuickRow({ex}:{ex:{id:string; name:string; sets:number; reps:number; weight:number}}){
  const [weight,setWeight]=useState(ex.weight)
  const [reps,setReps]=useState(ex.reps)
  const [saved,setSaved]=useState(false)
  const save = async ()=>{
    const { db } = await import('@/services/storage/db')
    const { v4: uuid } = await import('uuid')
    const today = new Date().toISOString().slice(0,10)
    let session = await db.sessions.where('localDate').equals(today).first()
    if(!session){ session = { id: uuid(), localDate: today, startedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await db.sessions.put(session) }
    await db.setLogs.put({ id: uuid(), sessionId: session.id, exerciseId: ex.id, setNumber: 1, weight, reps, completed:true, createdAt: new Date().toISOString() })
    setSaved(true); setTimeout(()=>setSaved(false),1500)
  }
  return (
    <div className="rounded-lg bg-bg border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accentDark flex items-center justify-center"><Dumbbell size={14} className="text-textMain"/></div>
        <div className="flex-1">
          <div className="text-body font-medium">{ex.name}</div>
          <div className="text-aux">Anterior: {ex.weight}kg × {ex.reps} · Objetivo: {(ex.weight+2.5).toFixed(1)}kg</div>
        </div>
        <span className={`text-aux px-2 py-1 rounded-full border ${saved?'bg-action text-textMain border-action':'bg-surface border-border text-textMuted'}`}>{saved?'Guardado':'Pendiente'}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <input type="number" value={weight} onChange={e=>setWeight(Number(e.target.value))} className="bg-surface border border-border rounded-lg p-2 text-body" placeholder="Peso"/>
        <input type="number" value={reps} onChange={e=>setReps(Number(e.target.value))} className="bg-surface border border-border rounded-lg p-2 text-body" placeholder="Reps"/>
        <button onClick={save} className="py-2 rounded-lg bg-action text-textMain">Guardar</button>
      </div>
    </div>
  )
}

function CoachInput(){
  const [q,setQ]=useState('')
  const [ans,setAns]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)
  const ask = async ()=>{
    if(!q.trim()) return
    const allowed = /(entren|ejercicio|rutina|serie|repetic|peso|progres|músculo|musculo|variante|nutric|macro|prote|carbo|grasa|recuper|sueño|sueno|hidrat|dolor|descanso|periodiz|frecuencia|volumen|aplicac|coach)/i
    if(!allowed.test(q)){
      setAns('Solo puedo ayudarte con entrenamiento, nutrición, progreso y las funciones de esta aplicación.')
      return
    }
    setLoading(true)
    try{
      const { aiService } = await import('@/services/ai/aiService')
      const { buildTrainingContext } = await import('@/services/ai/contextBuilder')
      const ctx:any = await buildTrainingContext()
      // dolor / variante detection
      if(/molesta|dolor|cambiar|no puedo|modificar|otro grupo/i.test(q)){
        ctx.dolor = q
      }
      const rec = await aiService.generateRecommendation({...ctx, ejercicio: q } as any)
      // si pide variante, sugiere ExerciseGym
      let extra = ''
      if(/cambiar|variante|no quiero|molesta/i.test(q)){
        extra = ' Alternativa: Press inclinado con mancuernas (mismo grupo pecho) — ver Biblioteca.'
      }
      setAns((rec.reason || 'Recomendación generada') + extra)
      localStorage.setItem('coach:lastQ', q)
    }catch{ setAns('Usando motor determinístico: mantené técnica y ajustá 2.5kg según RPE.')}
    finally{ setLoading(false) }
  }
  return (
    <div className="mt-3 rounded-xl bg-bg border border-border p-3">
      <div className="text-aux">¿Qué querés hacer hoy? (solo entrenamiento/nutrición)</div>
      <div className="flex gap-2 mt-2">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder='Ej: "Hoy no quiero hacer este ejercicio porque me molesta"' className="flex-1 bg-surface border border-border rounded-xl p-2 text-body" />
        <button onClick={ask} disabled={loading} className="px-3 rounded-xl bg-action text-textMain disabled:opacity-50">{loading?'...':'Enviar'}</button>
      </div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {['Quiero cambiar este ejercicio','Hoy no puedo hacer este ejercicio','Quiero entrenar otro grupo','Modificar rutina'].map(s=>(
          <button key={s} onClick={()=>setQ(s)} className="text-aux bg-surface border border-border px-2 py-1 rounded-full">{s}</button>
        ))}
      </div>
      {ans && <p className="text-body mt-2 bg-surface border border-border rounded-lg p-2">{ans}</p>}
    </div>
  )
}
