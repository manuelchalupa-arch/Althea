import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { detectCapabilities, type AIStatusInfo } from '@/services/ai/capabilities'
import { buildCycleFromRecommendation } from '@/utils/cycle'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { getNutritionMethod } from '@/services/ai/nutritionMethodsDB'
import type { NutritionMethodRecommendation } from '@/services/ai/nutritionMethods'
import { Info, Download, Cpu, HardDrive } from 'lucide-react'

export default function Coach(){
  const [rec,setRec]=useState<any>(null)
  const [cap,setCap]=useState<AIStatusInfo|null>(null)
  const [modelStatus,setModelStatus]=useState<string>(localStorage.getItem('qwen:status')||'not-installed')
  const [progress,setProgress]=useState<number>(Number(localStorage.getItem('qwen:progress')||'0'))
  const [loading,setLoading]=useState(false)
  const [showWhy,setShowWhy]=useState(false)
  const [intensity,setIntensity]=useState('ABUELITOS')
  const [briefScore,setBriefScore]=useState<{score:number;factors:{label:string;delta:number;estado:string}[]} | null>(null)
  const [briefInsights,setBriefInsights]=useState<{id:string;kind:string;level:string;title:string;detail:string;evidence:string;question?:{key:string;text:string}}[]>([])
  const [qaMap,setQaMap]=useState<Record<string,{question:string;answer:string;date:string}>>({})
  const [qaDraft,setQaDraft]=useState<Record<string,string>>({})
  const [downloading,setDownloading]=useState(false)
  // ─── Coach IA v2: nuevos estados ───
  const [safetyStatus,setSafetyStatus]=useState<{severity:string;message:string;referral?:string}|null>(null)
  const [progressData,setProgressData]=useState<{trend?:string;rate?:number;confidence?:number}|null>(null)
  const [recoveryData,setRecoveryData]=useState<{lastScore?:number;trend?:string;consecutiveLow?:number}|null>(null)
  const [nutritionData,setNutritionData]=useState<{tdee?:number;calorieGoal?:number;proteinPerKg?:number;gap?:string|null}|null>(null)
  const [methodRec,setMethodRec]=useState<{primary:string;secondary:string[];complementary:string[];justification:string;confidence:number;mixed?:any}|null>(null)
  const [applyingMethod,setApplyingMethod]=useState(false)
  const [activeMethod,setActiveMethod]=useState<{name:string;days?:number;split?:string}|null>(null)
  const [activeNutritionMethod,setActiveNutritionMethod]=useState<string | null>(null)
  const [nutritionMethodRec,setNutritionMethodRec]=useState<NutritionMethodRecommendation | null>(null)

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
    import('@/services/ai/systemPrompt').then(({ mapTone })=>{
      try{
        const stored = localStorage.getItem('coachIntensity')
        const mapped = mapTone(stored)
        setIntensity(mapped)
        localStorage.setItem('coachIntensity', mapped)
      }catch{ /* noop */ }
    })
    import('@/services/ai/globalScore').then(({ buildGlobalScore })=> buildGlobalScore().then((g)=> setBriefScore({ score: g.score, factors: g.factors })).catch(()=>{}))
    import('@/services/ai/coachInsights').then(({ buildInsights })=> buildInsights().then(setBriefInsights).catch(()=>{}))
    import('@/services/ai/coachMemory').then(({ getAllAnswers })=> getAllAnswers().then(setQaMap).catch(()=>{}))
    // ─── Coach IA v2: cargar datos extendidos ───
    import('@/services/ai/safetyLayer').then(({ check })=> check({}).then(r=>{ if(r.severity!=='info') setSafetyStatus({ severity:r.severity, message:r.message, referral:r.professionalReferral }) }).catch(()=>{}))
    import('@/services/ai/progressAnalyzer').then(({ analyzeGlobal })=> analyzeGlobal().then(p=> setProgressData({ trend:p.trend, rate:p.rate, confidence:p.confidence })).catch(()=>{}))
    import('@/services/ai/recoveryAnalyzer').then(({ analyzeRecovery })=> analyzeRecovery().then(r=> setRecoveryData({ lastScore:r.lastScore ?? undefined, trend:r.trend, consecutiveLow:r.consecutiveLow })).catch(()=>{}))
    import('@/services/ai/nutritionEngine').then(({ analyzeNutrition })=> db.userProfile.get('me').then(p=> analyzeNutrition(p||{}).then(n=> setNutritionData({ tdee:n.tdee ?? undefined, calorieGoal:n.calorieGoal ?? undefined, proteinPerKg:n.proteinPerKg ?? undefined, gap:n.gap })).catch(()=>{})).catch(()=>{}))
    // ─── Coach IA v2: Method selection ───
    import('@/services/ai/methodSelector').then(({ selectMethods })=> db.userProfile.get('me').then(p=>{ const r=selectMethods(p||{} as any); setMethodRec({ primary:r.primary, secondary:r.secondary, complementary:r.complementary, justification:r.justification, confidence:r.confidence, mixed:r.mixed }) }).catch(()=>{})).catch(()=>{})
    // ─── Load active method ───
    import('@/services/ai/trainingMethodsDB').then(({ getMethod })=> db.userProfile.get('me').then(p=>{ const c=(p as any)?.cycle; if(c?.methodId){ const m=getMethod(c.methodId); setActiveMethod({ name:m?.nameEs||c.methodId, days:c.trainingDays?.length, split:m?.structure?.splitType }) } }).catch(()=>{})).catch(()=>{})
    // ─── Load nutrition method ───
    import('@/services/ai/nutritionMethodSelector').then(({ selectNutritionMethods })=> db.userProfile.get('me').then(p=>{ const r=selectNutritionMethods(p||{} as any); setNutritionMethodRec(r) }).catch(()=>{})).catch(()=>{})
    db.userProfile.get('me').then(p=>{ if((p as any)?.activeNutritionMethod) setActiveNutritionMethod((p as any).activeNutritionMethod) }).catch(()=>{})
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

  const applyMethod = async ()=>{
    if(!methodRec) return
    setApplyingMethod(true)
    try{
      const profile = await db.userProfile.get('me') as any
      const availableDays = profile?.schedule?.availableDays || profile?.availableDays || [1,3,5]
      const cycle = buildCycleFromRecommendation({ primary: methodRec.primary as TrainingMethodId, mixed: methodRec.mixed, justification: methodRec.justification }, availableDays)
      await db.userProfile.put({ ...(profile || {}), cycle, updatedAt: new Date().toISOString() })
      alert(`Método "${methodRec.primary}" aplicado. Ciclo actualizado con ${cycle.trainingDays.length} días.`)
    }catch(e:any){ alert('Error: '+(e.message||e)) }
    finally{ setApplyingMethod(false) }
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

      <div className="rounded-xl bg-surface border border-border p-4 space-y-2">
        <div className="text-aux tracking-widest">SEGUIMIENTO</div>
        {briefScore ? (
          <>
            <div className="text-subtitle">Estado actual: {briefScore.score}/100</div>
            <div className="space-y-0.5">{briefScore.factors.map((f)=>(
              <div key={f.label} className="text-aux">{f.label}: {f.delta>=0?'+':''}{f.delta} — {f.estado}</div>
            ))}</div>
          </>
        ) : <p className="text-aux text-textMuted">Calculando tu estado con datos reales…</p>}
        {briefInsights.filter((i)=> i.level==='warn').slice(0,3).map((i)=>(
          <div key={i.id} className="rounded-xl bg-amber-900/20 border border-amber-800 p-2">
            <div className="text-body text-sm font-medium">{i.title}</div>
            <div className="text-aux mt-0.5">{i.detail}</div>
            <div className="text-aux text-textMuted mt-0.5">{i.evidence}</div>
          </div>
        ))}
        {briefInsights.filter((i)=> !!i.question && !qaMap[(i.question as { key: string }).key]).map((i)=>{
          const q = i.question
          if(!q) return null
          return (
          <div key={'q-'+i.id} className="rounded-xl bg-bg border border-border p-2">
            <div className="text-body text-sm">{q.text}</div>
            <div className="flex gap-1 mt-1">
              <input value={qaDraft[q.key]||''} onChange={(e)=> setQaDraft({...qaDraft, [q.key]: e.target.value})} placeholder="Tu respuesta…" maxLength={300} className="flex-1 bg-surface border border-border rounded-xl p-2 text-body" />
              <button onClick={async()=>{ const v=(qaDraft[q.key]||'').trim(); if(!v) return; const { saveAnswer } = await import('@/services/ai/coachMemory'); const saved = await saveAnswer(q.key, q.text, v); setQaMap({...qaMap, [q.key]: { question: saved.question, answer: saved.answer, date: saved.date }}) }} className="px-3 rounded-xl bg-action text-textMain">Guardar</button>
            </div>
          </div>
          )
        })}
        {/* ─── Coach IA v2: Safety ─── */}
        {safetyStatus && (
          <div className={`rounded-xl border p-2 ${safetyStatus.severity==='critical'?'bg-red-900/30 border-red-700':'bg-amber-900/20 border-amber-700'}`}>
            <div className="text-body text-sm font-medium">{safetyStatus.severity==='critical'?'⚠ Seguridad':'⚡ Alerta'}</div>
            <div className="text-aux mt-0.5">{safetyStatus.message}</div>
            {safetyStatus.referral && <div className="text-aux text-textMuted">Derivar a: {safetyStatus.referral}</div>}
          </div>
        )}
      </div>

      {/* ─── Coach IA v2: Progreso + Recuperación + Nutrición ─── */}
      {(progressData || recoveryData || nutritionData) && (
        <div className="rounded-xl bg-surface border border-border p-4 space-y-2">
          <div className="text-aux tracking-widest">ANÁLISIS V2</div>
          {progressData && (
            <div className="flex items-center gap-2 text-aux">
              <span className="text-body text-sm">Progreso:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${progressData.trend==='improving'?'bg-success/20 text-success':progressData.trend==='declining'?'bg-danger/20 text-danger':'bg-warning/20 text-warning'}`}>
                {progressData.trend==='improving'?'↑ Mejorando':progressData.trend==='declining'?'↓ Estancado':'→ Manteniendo'}
              </span>
              {progressData.rate != null && <span className="text-aux text-xs">({progressData.rate>0?'+':''}{Math.round(progressData.rate*10)/10} kg/sem)</span>}
            </div>
          )}
          {recoveryData && (
            <div className="flex items-center gap-2 text-aux">
              <span className="text-body text-sm">Recuperación:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${recoveryData.trend==='improving'?'bg-success/20 text-success':recoveryData.trend==='declining'?'bg-danger/20 text-danger':'bg-warning/20 text-warning'}`}>
                {recoveryData.lastScore!=null?`${recoveryData.lastScore}/100`: '?'} — {recoveryData.trend==='improving'?'↑':recoveryData.trend==='declining'?'↓':'→'}
              </span>
              {recoveryData.consecutiveLow != null && recoveryData.consecutiveLow > 2 && <span className="text-aux text-xs">⚠ {recoveryData.consecutiveLow} días bajos</span>}
            </div>
          )}
          {nutritionData && (
            <div className="flex items-center gap-2 text-aux">
              <span className="text-body text-sm">Nutrición:</span>
              {nutritionData.tdee != null && <span className="text-aux text-xs">TDEE: {Math.round(nutritionData.tdee)} kcal</span>}
              {nutritionData.calorieGoal != null && <span className="text-aux text-xs">Obj: {Math.round(nutritionData.calorieGoal)} kcal</span>}
              {nutritionData.proteinPerKg != null && <span className="text-aux text-xs">Prot: {nutritionData.proteinPerKg.toFixed(1)}g/kg</span>}
              {nutritionData.gap && <span className="text-aux text-xs">⚠ {nutritionData.gap}</span>}
            </div>
          )}
        </div>
      )}

      {/* ─── Coach IA v2: Active Method ─── */}
      {activeMethod && (
        <div className="rounded-xl bg-elevated border border-info p-3 flex items-center gap-3">
          <div className="text-aux tracking-widest text-info text-xs shrink-0">ACTIVO</div>
          <div className="text-body text-sm font-medium">{activeMethod.name}</div>
          {activeMethod.days && <div className="text-aux text-xs">· {activeMethod.days}d/semana · {activeMethod.split || '—'}</div>}
        </div>
      )}

      {/* ─── Nutrition Method Active + Recommended ─── */}
      {activeNutritionMethod && (
        <div className="rounded-xl bg-elevated border border-info p-3 flex items-center gap-3">
          <div className="text-aux tracking-widest text-info text-xs shrink-0">NUTRICIÓN</div>
          <div className="text-body text-sm font-medium">{getNutritionMethod(activeNutritionMethod as any)?.nameEs || activeNutritionMethod}</div>
          <div className="text-aux text-xs">Activo</div>
        </div>
      )}
      {nutritionMethodRec && (
        <div className="rounded-xl bg-surface border border-border p-4 space-y-2">
          <div className="text-aux tracking-widest">ESTRATEGIA NUTRICIONAL</div>
          <div className="text-body text-sm font-medium">{getNutritionMethod(nutritionMethodRec.primary)?.nameEs || nutritionMethodRec.primary}</div>
          {nutritionMethodRec.secondary.length > 0 && (
            <div className="text-aux text-xs">Secundarios: {nutritionMethodRec.secondary.map(id => getNutritionMethod(id)?.nameEs || id).join(', ')}</div>
          )}
          {nutritionMethodRec.mixed && (
            <div className="rounded-lg bg-bg border border-border p-2 mt-1">
              <div className="text-aux text-xs font-medium">Estrategia Mixta:</div>
              <div className="text-aux text-xs mt-0.5">{nutritionMethodRec.mixed.strategy?.timingStrategy}</div>
            </div>
          )}
          <div className="text-aux text-xs text-textMuted mt-1">{nutritionMethodRec.justification}</div>
          <div className="text-aux text-xs">Confianza: {Math.round(nutritionMethodRec.confidence * 100)}%</div>
          <button onClick={async()=>{
            try{
              const profile = await db.userProfile.get('me') as any
              await db.userProfile.put({ ...(profile || {}), activeNutritionMethod: nutritionMethodRec.primary, updatedAt: new Date().toISOString() })
              setActiveNutritionMethod(nutritionMethodRec.primary)
              alert(`Estrategia "${getNutritionMethod(nutritionMethodRec.primary)?.nameEs || nutritionMethodRec.primary}" activada.`)
            }catch(e:any){ alert('Error: '+(e.message||e)) }
          }} disabled={activeNutritionMethod === nutritionMethodRec.primary}
            className="w-full py-2 rounded-xl bg-action text-textMain text-sm font-medium disabled:opacity-50 mt-1">
            {activeNutritionMethod === nutritionMethodRec.primary ? 'Ya activo' : 'Activar esta estrategia'}
          </button>
        </div>
      )}

      {/* ─── Coach IA v2: Method Selection ─── */}
      {methodRec && (
        <div className="rounded-xl bg-surface border border-border p-4 space-y-2">
          <div className="text-aux tracking-widest">MÉTODO DE ENTRENAMIENTO</div>
          <div className="text-body text-sm font-medium">{methodRec.primary}</div>
          {methodRec.secondary.length > 0 && (
            <div className="text-aux text-xs">Secundarios: {methodRec.secondary.join(', ')}</div>
          )}
          {methodRec.complementary.length > 0 && (
            <div className="text-aux text-xs">Complementarios: {methodRec.complementary.join(', ')}</div>
          )}
          {methodRec.mixed && (
            <div className="rounded-lg bg-bg border border-border p-2 mt-1">
              <div className="text-aux text-xs font-medium">Método Mixto:</div>
              <div className="text-aux text-xs mt-0.5">{methodRec.mixed.structure?.distribution}</div>
            </div>
          )}
          <div className="text-aux text-xs text-textMuted mt-1">{methodRec.justification}</div>
          <div className="text-aux text-xs">Confianza: {Math.round(methodRec.confidence * 100)}%</div>
          <button onClick={applyMethod} disabled={applyingMethod}
            className="w-full py-2 rounded-xl bg-action text-textMain text-sm font-medium disabled:opacity-50 mt-1">
            {applyingMethod ? 'Aplicando…' : 'Aplicar este método al ciclo'}
          </button>
        </div>
      )}

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
          <option value="PADELERO">Pádelero — comprensivo y motivador</option>
          <option value="ABUELITOS">Coach de abuelitos — equilibrado y exigente amable</option>
          <option value="ARNOLD">Arnold — directo y firme</option>
          <option value="PSYCHO">Psycho Killer — disciplina máxima</option>
        </select>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 text-aux">
        <p>Motor determinístico calcula volumen/tonelaje/promedios. IA solo contextualiza, breve y práctica, JSON validado.</p>
      </div>
    </div>
  )
}
