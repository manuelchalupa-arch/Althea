import type { AIContext } from './aiProvider'
import { db } from '@/services/storage/db'
import { getDiaryEntries } from '@/services/storage/diaryStore'
import { getCycleFromProfile, getTrainingDayForDate } from '@/utils/cycle'
import { SYSTEM_PROMPT, PERSONALITY_INSTRUCTION, VERACITY_RULES, mapTone, TRAINING_GOAL_PROFILES, EXPERIENCE_INSTRUCTIONS, buildMethodContext, buildNutritionMethodContext, buildMethodCoachingPrompt } from './systemPrompt'
import { unifiedCompletedSets } from '@/services/history'
import { retrieveRelevant } from './knowledgeBase'
import { analyzeExercise, analyzeGlobal } from './progressAnalyzer'
import { analyzeRecovery } from './recoveryAnalyzer'
import { analyzeNutrition } from './nutritionEngine'
import type { UserProfile, RecoveryCheck } from '@/types'
import type { ActivityLevel } from '@/utils/nutrition'
import type { TrainingMethodId } from './trainingMethods'
import type { CoachMemoryEntry } from '@/services/storage/db'
import type { CoachDecision } from '@/services/ai/coachMemory'

// Memoria estructurada reducida — no envía todo el historial
export async function buildTrainingContext(exerciseId?:string, exerciseName?:string): Promise<AIContext>{
  const today = new Date().toISOString().slice(0,10)
  const profile = await db.userProfile.get('me') as UserProfile | undefined
  const cycle = getCycleFromProfile(profile ?? null)
  const diaInfo = getTrainingDayForDate(today, cycle)
  const dia = diaInfo.isRest ? 'Descanso' : `Día N°${diaInfo.n} ${diaInfo.name}`
  const objetivo = profile?.goal ?? 'hipertrofia'
  const personalidad = mapTone(profile?.coachTone || profile?.coachIntensity) as AIContext['personalidad']

  // últimas 3 sesiones del ejercicio — unión oficial+legacy (no solo setLogs)
  let historial:{peso:number;reps:number;rpe?:number}[] = []
  if(exerciseId){
    try{
      const all = await unifiedCompletedSets(exerciseId)
      all.sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      historial = all.slice(-3).map(l=> ({ peso:l.weight, reps:l.reps }))
    }catch{ /* noop */ }
  }

  // recuperación hoy (solo Dexie; sin dato → "no registrada")
  const rec = await db.recoveryChecks.get(today) as RecoveryCheck | undefined ?? undefined
  const fatiga = rec ? (rec.fatigue>7?'alta': rec.fatigue>4?'moderada':'baja') : 'no registrada'
  const sueno = rec ? `${rec.sleepHours}h` : 'no registrado'
  const energia = rec ? `${rec.energy}/10` : 'no registrada'

  // hidratación hoy (real; sin registros → 0, no se inventa)
  const hydLogs0 = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(()=>[])
  const hyd = hydLogs0.reduce((a,b)=>a+Number(b.amountMl||0),0)
  const hidratacion = hydLogs0.length ? `Hoy ${hyd} ml / 2500 ml` : 'Sin datos'

  // dolor real: surveys post-entreno (zona/detalle) + QA de dolor, no keys legacy
  let pain = 'sin dolor'
  try{
    const surveys = await db.postWorkoutSurveys.toArray().catch(()=>[])
    const withPain = surveys.filter(s=> Number(s.pain) > 0).sort((a,b)=> String(a.calendarDate) < String(b.calendarDate) ? -1 : 1)
    const lastP = withPain[withPain.length-1]
    if(lastP) {pain = `${lastP.calendarDate}: dolor${lastP.painZone ? ` en ${lastP.painZone}` : ''}${lastP.painDetail ? ` (${lastP.painDetail})` : ''}`}
  }catch{ /* noop */ }
  // datos corporales
  const peso = profile?.weightKg ? `${profile.weightKg}kg` : 'no registrado'
  const altura = profile?.heightCm ? `${profile.heightCm}cm` : 'no registrado'
  const imc = (profile?.weightKg && profile?.heightCm) ? (profile.weightKg / Math.pow(profile.heightCm/100,2)).toFixed(1) : '—'
  // nutrición diaria (diario + calendario)
  let nutriDaily: { diarioCount: number; calendario: string; objetivo: string; ultimoAlimento: string } | null = null
  try{
    const diario = await getDiaryEntries(today)
    nutriDaily = { diarioCount: diario.length, calendario: 'no', objetivo, ultimoAlimento: diario[diario.length-1]?.name || '—' }
  }catch{}
  // hidratación tendencia
  const hydLogs = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(()=>[])
  const hydTrend: string = hydLogs.length ? `${hydLogs.reduce((a,b)=>a+b.amountMl,0)}ml hoy` : hidratacion
  // memoria coach + última observación + perfil completo (solo Dexie)
  const { getPrefs: getCoachPrefs, getAllDecisions: getCoachDecisions } = await import('./coachMemory')
  const prefs: Record<string, unknown> = await getCoachPrefs().catch(() => ({}))
  const decisiones = await getCoachDecisions().catch(() => [])
  const tendencia = decisiones.slice(-5).map(d=> `${d.type}:${d.motive || d.reason || ''}`).join(' | ') || 'sin tendencia'
  let ultimaObs: { motivos?: string[]; dolorDetalle?: string; comentario?: string } | null = null
  try {
    const obsRows = await db.sessionObservations.orderBy('date').reverse().limit(8).toArray().catch(() => [])
    const found = obsRows.find(r => r && (r.motivos || r.comentario || r.dolorDetalle))
    if (found) { ultimaObs = { motivos: found.motivos, dolorDetalle: found.dolorDetalle, comentario: found.comentario } }
  } catch { /* noop */ }
  const needs = profile?.needsDescription || ''
  const excluded: string[] = profile?.excludedExercises || []
  const limitations = profile?.limitations || []
  const painAreas = profile?.painAreas || []
  // NUTRITION_CONTEXT
  let nutritionContext: { weight: number; height: number; bmi: number; bmiCategory: string; activityLevel: string; estimatedBMR: number; estimatedTDEE: number; calorieGoal: number; proteinGoal?: string; proteinRange?: any; weightHistory: { date: string; weight?: number }[]; nutritionPreferences: string[]; foodLogCount: number } | null = null
  try{
    const { calcIMC: _imc, calcTMB: _tmb, calcTDEE: _tdee, calorieGoal: _cg, proteinRange: _pr } = await import('@/utils/nutrition')
    const w = profile?.weightKg, h = profile?.heightCm, age2 = profile?.age, sex2 = profile?.sex
    const act2 = profile?.activityLevel || 'moderado'
    if(w && h){
      const imc2 = _imc(w,h)
      const tmb2 = _tmb(w,h,age2,sex2)
      const tdee2 = _tdee(tmb2, act2 as ActivityLevel, 4)
      const cg2 = _cg(tdee2, profile?.goalPrimary || objetivo)
      const pr2 = _pr(w, profile?.goalPrimary || objetivo)
      // peso evolución
      const bodies = await db.bodyMeasurements.toArray().catch(()=>[])
      const sortedB = bodies.sort((a,b)=> a.localDate.localeCompare(b.localDate)).slice(-5)
      nutritionContext = {
        weight: w, height: h, bmi: Number(imc2.bmi), bmiCategory: String(imc2.bmiCat),
        activityLevel: String(act2), estimatedBMR: Number(tmb2), estimatedTDEE: Number(tdee2),
        calorieGoal: Number(cg2), proteinGoal: pr2?.text, proteinRange: pr2,
        weightHistory: sortedB.map(b=> ({date:b.localDate, weight:b.weightKg})),
        nutritionPreferences: profile?.restrictions || [],
        foodLogCount: await getDiaryEntries(today).then(e => e.length).catch(() => 0)
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
    for(const k of Object.keys(answers)) {qa[k] = { question: answers[k].question, answer: answers[k].answer, date: answers[k].date }}
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

  // ─── Coach IA v2: knowledge base retrieval ───
  let knowledgeChunks: string[] = []
  try{
    const tags: string[] = [objetivo]
    if(exerciseId) {tags.push('ejercicio')}
    if(Number(rec?.soreness ?? (rec as { pain?: number })?.pain ?? 0) > 5) {tags.push('dolor', 'recuperación')}
    const chunks = await retrieveRelevant(tags, 3)
    knowledgeChunks = chunks.map(c => c.content.slice(0, 200))
  }catch{ /* noop */ }

  // ─── ET16: patrones observacionales (solo lectura, con evidencia) ───
  let patterns: { kind: string; statement: string; evidence: string[] }[] | undefined
  try {
    const { learnPatterns } = await import('./patternLearning')
    const learned = await learnPatterns()
    if (learned.length > 0) { patterns = learned.slice(0, 8) }
  } catch { /* noop */ }

  // ─── ET17: rutina, versión, sustituciones y mapa (solo lectura) ───
  let rutina: { name?: string; version?: number; planVersion?: number } | undefined
  let sustituciones: string[] | undefined
  let mapaMuscular: string | undefined
  try {
    const { getActiveRoutine } = await import('@/services/storage/routineStore')
    const active = await getActiveRoutine().catch(() => null)
    if (active) {
      rutina = { name: active.name, version: (active as { version?: number }).version }
      try {
        const { getActiveVersion, PROFILE_SCOPE } = await import('@/services/planning/cycleVersions')
        const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
        if (pv) { rutina.planVersion = pv.version }
      } catch { /* noop */ }
    }
  } catch { /* noop */ }
  try {
    const allSE = await db.sessionExercises.toArray().catch(() => [])
    const swaps = allSE
      .filter(se => (se as { status?: string }).status === 'REPLACED' && (se as { replacement?: { originalExerciseId?: string } }).replacement)
      .slice(-5)
      .map(se => {
        const r = (se as { replacement: { originalExerciseId: string }; exerciseId: string }).replacement
        return `${r.originalExerciseId} → ${se.exerciseId}`
      })
    if (swaps.length > 0) { sustituciones = swaps }
  } catch { /* noop */ }
  try {
    const { muscleLoadOf } = await import('@/services/training/metrics')
    const { buildMuscleResolver } = await import('@/services/training/muscleAttribution')
    const { fetchPartMap } = await import('@/services/exerciseGym')
    const partMap = await fetchPartMap().catch(() => ({} as Record<string, string>))
    const resolver = await buildMuscleResolver(partMap).catch(() => null)
    if (resolver) {
      const cut = new Date(); cut.setDate(cut.getDate() - 30)
      const cutStr = cut.toISOString().slice(0, 10)
      const { unifiedAllCompletedSets } = await import('@/services/history')
      const all = await unifiedAllCompletedSets().catch(() => [])
      const items = all.filter(s => s.createdAt.slice(0, 10) >= cutStr)
        .map(s => ({ exerciseId: s.exerciseId, volume: s.weight * s.reps }))
      const load = muscleLoadOf(items, resolver.muscleOf)
      if (load.loads.length > 0) {
        mapaMuscular = load.loads.slice(0, 3).map(m => `${m.muscle} ${m.pct}%`).join(', ')
      }
    }
  } catch { /* noop */ }

  // ─── Coach IA v2: progress analyzer ───
  let progressData: { trend?: string; rate?: number; confidence?: number } | undefined
  try{
    const progress = exerciseId ? await analyzeExercise(exerciseId) : await analyzeGlobal()
    progressData = { trend: progress.trend, rate: progress.rate, confidence: progress.confidence }
  }catch{ /* noop */ }

  // ─── Coach IA v2: recovery analyzer ───
  let recoveryData: { lastScore?: number; trend?: string; consecutiveLow?: number } | undefined
  try{
    const recAnalysis = await analyzeRecovery()
    recoveryData = { lastScore: recAnalysis.lastScore ?? undefined, trend: recAnalysis.trend, consecutiveLow: recAnalysis.consecutiveLow }
  }catch{ /* noop */ }

  // ─── Coach IA v2: nutrition analysis ───
  let nutritionAnalysis: { tdee?: number; calorieGoal?: number; proteinPerKg?: number; gap?: string | null } | undefined
  try{
    const nutAnalysis = await analyzeNutrition(profile || {})
    nutritionAnalysis = { tdee: nutAnalysis.tdee ?? undefined, calorieGoal: nutAnalysis.calorieGoal ?? undefined, proteinPerKg: nutAnalysis.proteinPerKg ?? undefined, gap: nutAnalysis.gap }
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
    personalidad: personalidad as AIContext['personalidad'],
    peso, altura, imc, nutriDaily,
    prefs, tendencia,
    ultimaObservacion: ultimaObs ? `${ultimaObs.motivos?.join(', ')} — ${ultimaObs.comentario||''}` : null,
    needs, excluded, limitations, painAreas,
    nutritionContext,
    nivelExigencia: profile?.coachLevel || 3,
    exigencia: profile?.exigencia || {},
    // ─── Coach IA v2: nuevos campos ───
    userProfile: profile || {},
    knowledgeChunks,
    progress: progressData,
    patterns,
    rutina,
    sustituciones,
    mapaMuscular,
    recovery: recoveryData,
    nutritionAnalysis,
    sessionPain: undefined,
    painZone: undefined,
  }
}

export function buildPrompt(ctx:AIContext):string{
  const hist = ctx.historial?.map((h,i)=> `Sesión ${i+1}: ${h.peso}kg × ${h.reps} RPE${h.rpe??'?'}`).join(' | ') || 'sin historial'
  const tono = PERSONALITY_INSTRUCTION[ctx.personalidad||'ABUELITOS'] || PERSONALITY_INSTRUCTION.ABUELITOS
  const ins = (ctx.insights||[]).map(i=> `[${i.level.toUpperCase()}] ${i.title} — ${i.detail}`).join('\n') || 'Sin patrones detectados (datos insuficientes o todo estable).'
  const sc = ctx.score ? `Estado global: ${ctx.score.score}/100 (${ctx.score.factors.map(f=> `${f.label} ${f.delta>=0?'+':''}${f.delta}: ${f.estado}`).join(' · ')})` : 'Sin puntuación (sin datos suficientes).'
  const qaLines = Object.entries(ctx.qa||{}).map(([k,v])=> `${k}: preguntó "${v.question}" → respondió "${v.answer}" (${v.date})`).join('\n') || 'Sin respuestas registradas.'
  // ─── Coach IA v2: perfiles de entrenamiento ───
  const goal = (ctx.userProfile?.trainingGoal as string) || ctx.objetivo || 'hypertrophy'
  const goalProfile = TRAINING_GOAL_PROFILES[goal] || TRAINING_GOAL_PROFILES.hypertrophy
  const experience = (ctx.userProfile?.experienceLevel as string) || 'intermediate'
  const expInstruction = EXPERIENCE_INSTRUCTIONS[experience] || EXPERIENCE_INSTRUCTIONS.intermediate
  // knowledge chunks
  const kbChunk = (ctx.knowledgeChunks||[]).length > 0 ? `\nCONOCIMIENTO RELEVANTE:\n${(ctx.knowledgeChunks||[]).join('\n')}` : ''
  // progress
  const progressLine = ctx.progress ? `\nPROGRESO: tendencia=${ctx.progress.trend||'desconocido'}, rate=${ctx.progress.rate||0}, conf=${ctx.progress.confidence||0}` : ''
  // recovery
  const recoveryLine = ctx.recovery ? `\nRECUPERACIÓN: último score=${ctx.recovery.lastScore||'?'}, tendencia=${ctx.recovery.trend||'desconocida'}, días bajos=${ctx.recovery.consecutiveLow||0}` : ''
  // nutrition analysis
  const nutAnalysisLine = ctx.nutritionAnalysis ? `\nNUTRICIÓN: TDEE=${ctx.nutritionAnalysis.tdee||'?'}, objetivo calórico=${ctx.nutritionAnalysis.calorieGoal||'?'}, proteína/kg=${ctx.nutritionAnalysis.proteinPerKg||'?'}, gap=${ctx.nutritionAnalysis.gap||'sin gap'}` : ''
  // ─── Coach IA v2: method context ───
  const methodId = ctx.userProfile?.cycle?.methodId as TrainingMethodId | undefined
  const methodContext = buildMethodContext(methodId)
  const methodLine = methodContext ? `\n${methodContext}` : ''
  // ─── Coach IA v2: nutrition method context ───
  const nutritionMethodId = (ctx.userProfile?.activeNutritionMethod as string) || ctx.userProfile?.cycle?.nutritionMethodId as string | undefined
  const nutritionMethodContext = buildNutritionMethodContext(nutritionMethodId as unknown as import('./nutritionMethods').NutritionMethodId)
  const nutritionMethodLine = nutritionMethodContext ? `\n${nutritionMethodContext}` : ''
  // ─── Method coaching style ───
  const methodCoaching = buildMethodCoachingPrompt(methodId)
  const methodCoachingLine = methodCoaching ? `\n${methodCoaching}` : ''
  return `${SYSTEM_PROMPT}

${VERACITY_RULES}

PERFIL DE ENTRENAMIENTO: ${goalProfile}
NIVEL: ${expInstruction}
${methodLine}
${methodCoachingLine}
${nutritionMethodLine}

PERSONALIDAD ACTUAL: ${ctx.personalidad} — ${tono}

CONTEXTO REDUCIDO DEL USUARIO (no enviar más):
Objetivo: ${ctx.objetivo}
Día: ${ctx.dia}
Ejercicio: ${ctx.ejercicio||'general'}
Historial: [${hist}]
Fatiga: ${ctx.fatiga} | Sueño: ${ctx.sueno} | Energía: ${ctx.energia} | Hidratación: ${ctx.hidratacion} | Dolor: ${ctx.dolor}
${ctx.nutricion ? `Nutrición: ${JSON.stringify(ctx.nutricion)}` : ''}
${ctx.hidratacion ? `Hidratación: ${ctx.hidratacion}` : ''}
${kbChunk}${progressLine}${recoveryLine}${nutAnalysisLine}

MEMORIA LONGITUDINAL (datos reales):
${sc}
Patrones:
${ins}
${ctx.patterns?.length ? `Patrones observados:\n${ctx.patterns.map(p => `[${p.kind}] ${p.statement}`).join('\n')}` : ''}
${ctx.rutina?.name ? `Rutina activa: ${ctx.rutina.name}${ctx.rutina.version ? ` (v${ctx.rutina.version})` : ''}${ctx.rutina.planVersion ? `, planificación v${ctx.rutina.planVersion}` : ''}` : ''}
${ctx.sustituciones?.length ? `Sustituciones recientes: ${ctx.sustituciones.join(' | ')}` : ''}
${ctx.mapaMuscular ? `Mapa muscular 30d: ${ctx.mapaMuscular}` : ''}
Respuestas del usuario:
${qaLines}

INSTRUCCIÓN: Genera 1 recomendación breve en español con el tono indicado, con lista de por qué. Explicá siempre con estas etiquetas: Dato: (lo registrado), Cálculo: (métrica derivada), Te recomiendo: (acción propuesta), Mi opinión: (juicio explícito como opinión). Si no hay datos suficientes, decilo. Nunca modifiques rutinas, objetivos ni históricos: solo recomendá y esperá la decisión del usuario. Si corresponde a ejercicio, usa solo ExerciseGymGifsDB y menciona gifUrl alternativo si es change_exercise. Si es nutrición, usa solo Codulia y menciona macros por 100g/ml + porción real. No inventes valores no registrados. Devuelve SOLO JSON como en ejemplos.`
}
