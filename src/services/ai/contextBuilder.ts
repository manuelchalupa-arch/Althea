import type { AIContext } from './aiProvider'
import { db } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate } from '@/utils/cycle'
import { SYSTEM_PROMPT, PERSONALITY_INSTRUCTION, VERACITY_RULES, mapTone } from './systemPrompt'
import { unifiedCompletedSets } from '@/services/history'

// Memoria estructurada reducida — no envía todo el historial
export async function buildTrainingContext(exerciseId?:string, exerciseName?:string): Promise<AIContext>{
  const today = new Date().toISOString().slice(0,10)
  const profile:any = await db.userProfile.get('me')
  const cycle = getCycleFromProfile(profile)
  const diaInfo = getTrainingDayForDate(today, cycle)
  const dia = diaInfo.isRest ? 'Descanso' : `Día N°${diaInfo.n} ${diaInfo.name}`
  const objetivo = profile?.goal ?? 'hipertrofia'
  let storedTone: string | null = null
  try { storedTone = localStorage.getItem('coachIntensity') } catch { /* noop */ }
  const personalidad = mapTone(storedTone || (profile as any)?.coachIntensity) as AIContext['personalidad']

  // últimas 3 sesiones del ejercicio — unión oficial+legacy (no solo setLogs)
  let historial:{peso:number;reps:number;rpe?:number}[] = []
  if(exerciseId){
    try{
      const all = await unifiedCompletedSets(exerciseId)
      all.sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      historial = all.slice(-3).map(l=> ({ peso:l.weight, reps:l.reps }))
    }catch{ /* noop */ }
  }

  // recuperación hoy
  const rec:any = await db.recoveryChecks.get(today) || JSON.parse(localStorage.getItem('recovery:'+today)||'null')
  const fatiga = rec ? (rec.fatigue>7?'alta': rec.fatigue>4?'moderada':'baja') : 'moderada'
  const sueno = rec ? `${rec.sleepHours}h` : '7h 20m'
  const energia = rec ? `${rec.energy}/10` : '8/10'

  // hidratación hoy
  const hyd = Number(localStorage.getItem('hydration:'+today) || localStorage.getItem('hydrationToday') || '1500')
  const hidratacion = `Hoy ${hyd} ml / 2500 ml`

  // dolor real: surveys post-entreno (zona/detalle) + QA de dolor, no keys legacy
  let pain = 'sin dolor'
  try{
    const surveys: any[] = await db.table('postWorkoutSurveys').toArray().catch(()=>[])
    const withPain = surveys.filter(s=> Number(s.pain) > 0).sort((a,b)=> String(a.calendarDate) < String(b.calendarDate) ? -1 : 1)
    const lastP = withPain[withPain.length-1]
    if(lastP) pain = `${lastP.calendarDate}: ${lastP.pain}/10${lastP.painZone ? ` en ${lastP.painZone}` : ''}${lastP.painDetail ? ` (${lastP.painDetail})` : ''}`
  }catch{ /* noop */ }
  // datos corporales
  const peso = profile?.weightKg ? `${profile.weightKg}kg` : 'no registrado'
  const altura = profile?.heightCm ? `${profile.heightCm}cm` : 'no registrado'
  const imc = (profile?.weightKg && profile?.heightCm) ? (profile.weightKg / Math.pow(profile.heightCm/100,2)).toFixed(1) : '—'
  // nutrición diaria (diario + calendario)
  let nutriDaily:any = null
  try{
    const diario = JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]')
    const cal = JSON.parse(localStorage.getItem('nutri:calendario')||'null')
    nutriDaily = { diarioCount: diario.length, calendario: cal ? 'generado' : 'no', objetivo, ultimoAlimento: diario[diario.length-1]?.name || '—' }
  }catch{}
  // hidratación tendencia
  const hydLogs = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(()=>[])
  const hydTrend = hydLogs.length ? `${hydLogs.reduce((a,b)=>a+b.amountMl,0)}ml hoy` : hidratacion
  // memoria coach + última observación + perfil completo
  let prefs:any = {}
  try{ prefs = JSON.parse(localStorage.getItem('coachPrefs')||'{}')}catch{}
  const decisiones = JSON.parse(localStorage.getItem('coachMemory')||'[]') as any[]
  const tendencia = decisiones.slice(-5).map(d=> `${d.type}:${d.motive||d.reason||''}`).join(' | ') || 'sin tendencia'
  let ultimaObs:any = null
  try{ ultimaObs = JSON.parse(localStorage.getItem(`observation:${today}`)||'null') }catch{}
  if(!ultimaObs){
    for(let i=1;i<=7;i++){
      const d=new Date(); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10)
      try{ const v=JSON.parse(localStorage.getItem(`observation:${k}`)||'null'); if(v){ ultimaObs=v; break}}catch{}
    }
  }
  const needs = (profile as any)?.needsDescription || (profile as any)?.needs || ''
  const excluded: string[] = (profile as any)?.excludedExercises || JSON.parse(localStorage.getItem('onboard:excluded')||'[]')
  const limitations = (profile as any)?.limitations || []
  const painAreas = (profile as any)?.painAreas || []
  // NUTRITION_CONTEXT
  let nutritionContext:any = null
  try{
    const { calcIMC: _imc, calcTMB: _tmb, calcTDEE: _tdee, calorieGoal: _cg, proteinRange: _pr } = await import('@/utils/nutrition')
    const w = (profile as any)?.weightKg, h = (profile as any)?.heightCm, age2 = (profile as any)?.age, sex2 = (profile as any)?.sex
    const act2 = (profile as any)?.activityLevel || 'moderado'
    if(w && h){
      const imc2 = _imc(w,h)
      const tmb2 = _tmb(w,h,age2,sex2)
      const tdee2 = _tdee(tmb2, act2 as any, 4)
      const cg2 = _cg(tdee2, (profile as any)?.goalPrimary || objetivo)
      const pr2 = _pr(w, (profile as any)?.goalPrimary || objetivo)
      // peso evolución
      const bodies:any[] = await db.table('bodyMeasurements').toArray().catch(()=>[])
      const sortedB = bodies.sort((a,b)=> a.localDate.localeCompare(b.localDate)).slice(-5)
      nutritionContext = {
        weight: w, height: h, bmi: imc2.bmi, bmiCategory: imc2.bmiCat,
        activityLevel: act2, estimatedBMR: tmb2, estimatedTDEE: tdee2,
        calorieGoal: cg2, proteinGoal: pr2?.text, proteinRange: pr2,
        weightHistory: sortedB.map(b=> ({date:b.localDate, weight:b.weightKg})),
        nutritionPreferences: (profile as any)?.restrictions || [],
        foodLogCount: (()=>{ try{ return JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]').length }catch{return 0}})()
      }
    }
  }catch{}

  // capa longitudinal: decisiones reales (Dexie+espejo), insights, score, respuestas
  let recentChanges: string[] = []
  let qa: Record<string, { question: string; answer: string; date: string }> = {}
  let insights: { title: string; detail: string; kind: string; level: string }[] = []
  let score: { score: number; factors: { label: string; delta: number; estado: string }[] } | undefined
  try{
    const { getAllDecisions, getAllAnswers } = await import('./coachMemory')
    const decs = await getAllDecisions()
    recentChanges = decs
      .filter(d=> ['swap','skip','modify'].includes(d.type))
      .slice(-8)
      .map(d=> `${d.date} ${d.type}:${d.exercise || ''}${d.motive ? ` (porque: ${d.motive})` : ''}${d.reason ? ` — ${d.reason}` : ''}`)
    const answers = await getAllAnswers()
    for(const k of Object.keys(answers)) qa[k] = { question: answers[k].question, answer: answers[k].answer, date: answers[k].date }
  }catch{ /* noop */ }
  try{
    const { buildInsights } = await import('./coachInsights')
    const all = await buildInsights()
    const warns = all.filter(i=> i.level==='warn').slice(0,3)
    const infos = all.filter(i=> i.level==='info').slice(0,2)
    insights = [...warns, ...infos].map(i=> ({ title: i.title, detail: i.detail, kind: i.kind, level: i.level }))
  }catch{ /* noop */ }
  try{
    const { buildGlobalScore } = await import('./globalScore')
    const g = await buildGlobalScore()
    score = { score: g.score, factors: g.factors }
  }catch{ /* noop */ }

  return {
    objetivo,
    dia,
    ejercicio: exerciseName || exerciseId,
    historial,
    cambiosRecientes: recentChanges,
    insights,
    score,
    qa,
    fatiga: ultimaObs?.motivos?.includes('Estaba cansado') ? 'alta (ayer cansado)' : fatiga,
    sueno,
    energia,
    hidratacion: hydTrend,
    dolor: ultimaObs?.motivos?.includes('Tenía alguna dolencia o molestia') ? (ultimaObs.dolorDetalle || 'molestia ayer') : pain,
    personalidad: personalidad as any,
    peso, altura, imc, nutriDaily,
    prefs, tendencia,
    ultimaObservacion: ultimaObs ? `${ultimaObs.motivos?.join(', ')} — ${ultimaObs.comentario||''}` : null,
    needs, excluded, limitations, painAreas,
    nutritionContext,
    // @ts-ignore extra fields para IA
    nivelExigencia: profile?.coachLevel || 3,
    exigencia: profile?.exigencia || {}
  } as any
}

export function buildPrompt(ctx:AIContext):string{
  const hist = ctx.historial?.map((h,i)=> `Sesión ${i+1}: ${h.peso}kg × ${h.reps} RPE${h.rpe??'?'}`).join(' | ') || 'sin historial'
  const tono = PERSONALITY_INSTRUCTION[ctx.personalidad||'ABUELITOS'] || PERSONALITY_INSTRUCTION.ABUELITOS
  const ins = (ctx.insights||[]).map(i=> `[${i.level.toUpperCase()}] ${i.title} — ${i.detail}`).join('\n') || 'Sin patrones detectados (datos insuficientes o todo estable).'
  const sc = ctx.score ? `Estado global: ${ctx.score.score}/100 (${ctx.score.factors.map(f=> `${f.label} ${f.delta>=0?'+':''}${f.delta}: ${f.estado}`).join(' · ')})` : 'Sin puntuación (sin datos suficientes).'
  const qaLines = Object.entries(ctx.qa||{}).map(([k,v])=> `${k}: preguntó "${v.question}" → respondió "${v.answer}" (${v.date})`).join('\n') || 'Sin respuestas registradas.'
  return `${SYSTEM_PROMPT}

${VERACITY_RULES}

PERSONALIDAD ACTUAL: ${ctx.personalidad} — ${tono}

CONTEXTO REDUCIDO DEL USUARIO (no enviar más):
Objetivo: ${ctx.objetivo}
Día: ${ctx.dia}
Ejercicio: ${ctx.ejercicio||'general'}
Historial: [${hist}]
Fatiga: ${ctx.fatiga} | Sueño: ${ctx.sueno} | Energía: ${ctx.energia} | Hidratación: ${ctx.hidratacion} | Dolor: ${ctx.dolor}
${ctx.nutricion ? `Nutrición: ${JSON.stringify(ctx.nutricion)}` : ''}
${ctx.hidratacion ? `Hidratación: ${ctx.hidratacion}` : ''}

MEMORIA LONGITUDINAL (datos reales):
${sc}
Patrones:
${ins}
Respuestas del usuario:
${qaLines}

INSTRUCCIÓN: Genera 1 recomendación breve en español con el tono indicado, con lista de por qué. Si corresponde a ejercicio, usa solo ExerciseGymGifsDB y menciona gifUrl alternativo si es change_exercise. Si es nutrición, usa solo Codulia y menciona macros por 100g/ml + porción real. No inventes valores no registrados. Devuelve SOLO JSON como en ejemplos.`
}
