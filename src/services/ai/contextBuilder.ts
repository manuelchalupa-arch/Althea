import type { AIContext } from './aiProvider'
import { db } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate } from '@/utils/cycle'
import { SYSTEM_PROMPT, PERSONALITY_INSTRUCTION } from './systemPrompt'

// Memoria estructurada reducida — no envía todo el historial
export async function buildTrainingContext(exerciseId?:string, exerciseName?:string): Promise<AIContext>{
  const today = new Date().toISOString().slice(0,10)
  const profile:any = await db.userProfile.get('me')
  const cycle = getCycleFromProfile(profile)
  const diaInfo = getTrainingDayForDate(today, cycle)
  const dia = diaInfo.isRest ? 'Descanso' : `Día N°${diaInfo.n} ${diaInfo.name}`
  const objetivo = profile?.goal ?? 'hipertrofia'
  const personalidad = (profile?.coachIntensity ?? 'profesional').toUpperCase() as AIContext['personalidad']

  // últimas 3 sesiones del ejercicio
  let historial:{peso:number;reps:number;rpe?:number}[] = []
  if(exerciseId){
    const logs = await db.setLogs.where('exerciseId').equals(exerciseId).reverse().limit(3).toArray()
    historial = logs.reverse().map(l=> ({ peso:l.weight, reps:l.reps, rpe:l.rpe }))
  }

  // recuperación hoy
  const rec:any = await db.recoveryChecks.get(today) || JSON.parse(localStorage.getItem('recovery:'+today)||'null')
  const fatiga = rec ? (rec.fatigue>7?'alta': rec.fatigue>4?'moderada':'baja') : 'moderada'
  const sueno = rec ? `${rec.sleepHours}h` : '7h 20m'
  const energia = rec ? `${rec.energy}/10` : '8/10'

  // hidratación hoy
  const hyd = Number(localStorage.getItem('hydration:'+today) || localStorage.getItem('hydrationToday') || '1500')
  const hidratacion = `Hoy ${hyd} ml / 2500 ml`

  // dolor último + post
  const pain = localStorage.getItem('lastPain') || localStorage.getItem(`post:${today}`) || 'sin dolor'
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

  return {
    objetivo,
    dia,
    ejercicio: exerciseName || exerciseId,
    historial,
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
  const tono = PERSONALITY_INSTRUCTION[ctx.personalidad||'PROFESIONAL'] || PERSONALITY_INSTRUCTION.PROFESIONAL
  return `${SYSTEM_PROMPT}

PERSONALIDAD ACTUAL: ${ctx.personalidad} — ${tono}

CONTEXTO REDUCIDO DEL USUARIO (no enviar más):
Objetivo: ${ctx.objetivo}
Día: ${ctx.dia}
Ejercicio: ${ctx.ejercicio||'general'}
Historial: [${hist}]
Fatiga: ${ctx.fatiga} | Sueño: ${ctx.sueno} | Energía: ${ctx.energia} | Hidratación: ${ctx.hidratacion} | Dolor: ${ctx.dolor}
${ctx.nutricion ? `Nutrición: ${JSON.stringify(ctx.nutricion)}` : ''}
${ctx.hidratacion ? `Hidratación: ${ctx.hidratacion}` : ''}

INSTRUCCIÓN: Genera 1 recomendación breve, profesional y motivadora en español, con lista de por qué. Si corresponde a ejercicio, usa solo ExerciseGymGifsDB y menciona gifUrl alternativo si es change_exercise. Si es nutrición, usa solo Codulia y menciona macros por 100g/ml + porción real. No inventes valores no registrados. Devuelve SOLO JSON como en ejemplos.`
}
