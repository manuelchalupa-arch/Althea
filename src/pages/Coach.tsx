import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { detectCapabilities, type AIStatusInfo } from '@/services/ai/capabilities'
import { Info, Download, Cpu, HardDrive } from 'lucide-react'

export default function Coach(){
  const [rec,setRec]=useState<any>(null)
  const [cap,setCap]=useState<AIStatusInfo|null>(null)
  const [modelStatus,setModelStatus]=useState<string>(localStorage.getItem('qwen:status')||'not-installed')
  const [progress,setProgress]=useState<number>(Number(localStorage.getItem('qwen:progress')||'0'))
  const [loading,setLoading]=useState(false)
  const [showWhy,setShowWhy]=useState(false)
  const [intensity,setIntensity]=useState(localStorage.getItem('coachIntensity')||'profesional')
  const [downloading,setDownloading]=useState(false)

  const refresh = async ()=>{
    const c = await detectCapabilities()
    setCap(c)
    const s = await aiService.getStatus().catch(()=>({icon:'🔴',status:'unavailable',reason:'offline'} as any))
    // @ts-ignore status union
    if(s.status==='available') setModelStatus('ready')
  }

  useEffect(()=>{
    refresh()
    buildTrainingContext().then(ctx=> aiService.generateRecommendation(ctx).then(setRec).catch(()=>{}))
  },[])

  const doDownload = async ()=>{
    setDownloading(true)
    try{
      await aiService.downloadModel((p)=> setProgress(p))
      setModelStatus('ready')
      // regenera recomendación con Qwen
      const ctx = await buildTrainingContext()
      const r = await aiService.generateRecommendation(ctx)
      setRec(r)
    }catch(e:any){ alert('Error descarga: '+(e.message||e)) }
    finally{ setDownloading(false); refresh() }
  }

  const [showModify,setShowModify]=useState(false)
  const [showReject,setShowReject]=useState(false)
  const [modifyChoice,setModifyChoice]=useState('Tiempo disponible')
  const [rejectMotive,setRejectMotive]=useState('No tengo tiempo')
  const saveDecision = async (d:'accept'|'modify'|'reject', motive?:string)=>{
    const { saveDecision: save } = await import('@/services/ai/coachMemory')
    const today=new Date().toISOString().slice(0,10)
    const ctx:any = await buildTrainingContext()
    save({ date: today, type: d, exercise: rec?.exercise, reason: rec?.reason, motive, contextSnapshot: ctx })
    if(d==='accept'){
      const { v4: uuid } = await import('uuid')
      let session = await db.sessions.where('localDate').equals(today).first()
      if(!session){ session = { id: uuid(), localDate: today, startedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await db.sessions.put(session) }
      alert('¡Aceptado! Entrenamiento confirmado y registrado en calendario.')
    } else if(d==='reject'){
      alert(`Rechazo registrado: ${motive}. No insistiré hoy. ${motive?.includes('tiempo') ? 'Te propongo sesión corta 30 min mañana.' : ''}`)
    }
  }

  const info = aiService.getModelInfo()

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-3">
      <h1 className="text-section">Coach IA</h1>

      {/* Estado IA local */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-aux">COACH IA</span>
          <span className="text-aux">{cap ? `${cap.icon} ${cap.status}` : 'detectando...'}</span>
        </div>
        <div className="text-aux"><b>Modelo:</b> {info.model}</div>
        <div className="text-aux flex gap-2"><HardDrive size={12}/> Tamaño: {info.size} · Requerido: {info.required}</div>
        <div className="text-aux flex gap-2"><Cpu size={12}/> {cap?.reason || '—'} {cap?.webgpu ? '· WebGPU' : cap?.wasm ? '· WASM' : ''}</div>
        <div className="rounded-lg bg-bg border border-border p-2 text-aux">
          Estado: <b>{modelStatus==='ready' ? 'Listo' : modelStatus==='downloading' ? `Descargando ${progress}%` : modelStatus==='installing' ? 'Instalando…' : 'No instalado'}</b>
          {downloading && <div className="h-2 bg-surface border border-border rounded-full mt-2 overflow-hidden"><div className="h-full bg-action" style={{width:`${progress}%`}}/></div>}
        </div>
        {modelStatus!=='ready' && cap?.status!=='unavailable' && (
          <button onClick={doDownload} disabled={downloading} className="w-full py-3 rounded-xl bg-action text-textMain font-medium flex items-center justify-center gap-2 disabled:opacity-50"><Download size={16}/> {downloading ? `Descargando ${progress}%` : 'DESCARGAR MODELO'}</button>
        )}
        {cap?.status==='unavailable' && <p className="text-aux text-amber-300"> IA local no disponible en este dispositivo — se usa motor determinístico offline.</p>}
        <p className="text-aux text-textMuted">No incluye modelo en bundle. Se cachea en CacheStorage/IndexedDB, no se re-descarga.</p>
      </div>

      <div className="rounded-xl bg-accentDark border border-border p-4">
        <div className="text-aux tracking-widest text-info">RECOMENDACIÓN</div>
        {loading ? <p className="text-body mt-1">Generando…</p> : (
          <>
            <p className="text-body mt-1">{rec?.reason ? (rec.suggested_weight ? `Hoy podés intentar ${rec.suggested_weight} kg — ${rec.reason}` : rec.reason) : 'Mantener carga prevista. Completaste el objetivo anterior.'}</p>
            <div className="text-aux mt-1">Confianza {(rec?.confidence??0.6)*100|0}% · {rec?.exercise || 'agenda'}</div>
            <button onClick={()=>setShowWhy(!showWhy)} className="mt-2 text-aux text-info flex items-center gap-1"><Info size={12}/> ¿Por qué?</button>
            {showWhy && <p className="text-aux mt-2 bg-bg border border-border rounded-lg p-2">{rec?.factors?.join(' · ') || rec?.why?.join(' · ') || 'Volumen y RPE estables, sin dolor'}</p>}
            <div className="mt-3 flex gap-1">
              <button onClick={()=>saveDecision('accept')} className="flex-1 py-2 rounded-lg bg-action text-textMain">ACEPTAR</button>
              <button onClick={()=>setShowModify(true)} className="flex-1 py-2 rounded-lg bg-surface border border-border text-aux">MODIFICAR</button>
              <button onClick={()=>setShowReject(true)} className="flex-1 py-2 rounded-lg bg-bg border border-border text-aux">RECHAZAR</button>
            </div>

            {showModify && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowModify(false)}>
                <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-3">
                  <h3 className="text-subtitle">¿Qué querés modificar?</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['Tiempo disponible','Intensidad','Ejercicios','Cantidad','Dificultad','Equipamiento'].map(o=>(
                      <button key={o} onClick={()=>setModifyChoice(o)} className={`p-2 rounded-xl border text-aux ${modifyChoice===o?'bg-action text-textMain border-action':'bg-surface border-border'}`}>{o}</button>
                    ))}
                  </div>
                  <button onClick={async()=>{
                    const ctx:any = await buildTrainingContext()
                    const { aiService } = await import('@/services/ai/aiService')
                    const r:any = await aiService.generateRecommendation({...ctx, ejercicio: `${ctx.ejercicio} - modificar ${modifyChoice}`} as any)
                    setRec(r); setShowModify(false)
                    await saveDecision('modify', modifyChoice)
                    alert(`Genial — adapto por ${modifyChoice.toLowerCase()}. Nueva recomendación lista.`)
                  }} className="w-full py-3 rounded-xl bg-action text-textMain">Generar nueva recomendación</button>
                  <button onClick={()=>setShowModify(false)} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Cerrar</button>
                </div>
              </div>
            )}
            {showReject && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowReject(false)}>
                <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-3">
                  <h3 className="text-subtitle">¿Por qué rechazás?</h3>
                  {['No tengo tiempo','No tengo energía','No puedo hacer esos ejercicios','No tengo equipamiento','No quiero entrenar hoy','Otro'].map(m=>(
                    <button key={m} onClick={()=>setRejectMotive(m)} className={`w-full p-2 rounded-xl border text-left text-aux ${rejectMotive===m?'bg-action text-textMain border-action':'bg-surface border-border'}`}>{m}</button>
                  ))}
                  <button onClick={async()=>{ await saveDecision('reject', rejectMotive); setShowReject(false)}} className="w-full py-3 rounded-xl bg-action text-textMain">Confirmar rechazo</button>
                  <button onClick={()=>setShowReject(false)} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Cerrar</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Personalidad (via prompt, sin reentrenar modelo)</div>
        <select value={intensity} onChange={e=>{ setIntensity(e.target.value); localStorage.setItem('coachIntensity', e.target.value)}} className="w-full mt-2 bg-bg border border-border rounded-xl p-3 text-body">
          <option value="profesional">PROFESIONAL — directo y técnico</option>
          <option value="motivacional">MOTIVACIONAL — enérgico</option>
          <option value="duro">ESTRICTO — exigente</option>
          <option value="extremo">DURO — agresivo filtrado</option>
        </select>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 text-aux">
        <p>Motor determinístico calcula volumen/tonelaje/promedios. IA solo contextualiza, breve y práctica, JSON validado.</p>
      </div>
    </div>
  )
}
