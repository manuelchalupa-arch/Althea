import type { AIProvider, AIContext, AIRecommendation } from './aiProvider'
import { recommendLoad } from './localEngine'
import type { SetLog } from '@/types'
import { resolveGoal, type TrainingGoal } from './goalEngine'
import type { ExperienceLevel } from '@/types'
import { applyPersonality, type CoachTone } from './coachPersonality'
import { check as safetyCheck, type SafetyContext } from './safetyLayer'
import { logDecision } from './decisionLogger'

export class FallbackAIProvider implements AIProvider {
  name = 'Determinístico'
  getModelInfo(){ return { model:'Motor determinístico v2', size:'0 MB', required:'0 MB' } }
  isModelReady(){ return true }
  async isAvailable(){ return true }
  async getStatus(){ return { icon:'🟡', status:'limited', reason:'IA local no disponible — usando motor determinístico v2' } }
  async downloadModel(){}
  async generateRecommendation(ctx: AIContext): Promise<AIRecommendation>{
    // 1. Safety check primero
    const safetyCtx: SafetyContext = {
      recovery: ctx.recovery ? { pain: ctx.recovery.pain ?? 0, fatigue: ctx.recovery.fatigue ?? 5, energy: ctx.recovery.energy ?? 5 } : undefined,
      sessionPain: ctx.sessionPain,
      painZone: ctx.painZone,
      userProfile: ctx.userProfile,
      qaHistory: ctx.qa ? Object.entries(ctx.qa).map(([key, v]) => ({ key, answer: v.answer })) : undefined,
    }
    const safety = await safetyCheck(safetyCtx)
    if (safety.requiresProfessional && safety.severity === 'critical') {
      await logDecision({
        type: 'safety',
        context: { exercise: ctx.ejercicio },
        decision: {
          what: 'Bloqueado por seguridad',
          why: safety.message,
          factors: ['safety_layer', safety.message],
          confidence: 1,
        },
        safetyFlags: safety.blockedActions,
      })
      return {
        type: 'training_recommendation',
        exercise: ctx.ejercicio || '',
        action: 'stop',
        reason: safety.message,
        factors: ['seguridad', safety.professionalReferral || 'profesional'].filter(Boolean),
        confidence: 1,
        why: [safety.message],
      }
    }

    // 2. Motor determinístico base
    const hist: SetLog[] = (ctx.historial||[]).map(h=> ({ weight: h.peso, reps: h.reps, rpe: h.rpe, completed: true, createdAt: new Date().toISOString(), id: '', sessionId: '', exerciseId: '', setNumber: 0 }))
    const rec = recommendLoad(hist)
    let action = rec.text.includes('Probar') ? 'increase_weight' : rec.text.includes('bajar') ? 'decrease_weight' : 'maintain'
    let reason = rec.reason
    const factors = [...(rec.factors||[])]

    // 3. Capa longitudinal: insights y score
    const warns = (ctx.insights||[]).filter(i=> i.level==='warn')
    if(warns.length>0){
      const top = warns[0]
      reason = `${top.title}. ${top.detail} ${rec.reason}`
      factors.unshift(`alerta: ${top.kind}`)
      if(top.kind==='overtrain' || top.kind==='pain') {action = 'decrease_volume'}
      if(top.kind==='pain') {reason += ' Sin diagnosticar: si el dolor es importante, consultá profesional.'}
    } else if((ctx.insights||[]).length===0 && (ctx.historial||[]).length===0){
      reason = 'Todavía no tengo suficientes datos tuyos para determinarlo. ' + rec.reason
      factors.push('sin datos suficientes')
    }
    if(ctx.score && ctx.score.score < 45){
      reason += ` Tu estado global está en ${ctx.score.score}/100: priorizá recuperación hoy.`
      factors.push(`score ${ctx.score.score}/100`)
      if(action==='increase_weight') {action = 'maintain'}
    }

    // 4. Goal-driven adjustment
    const goal = (ctx.userProfile?.trainingGoal as TrainingGoal) || 'hypertrophy'
    const tone = (ctx.personalidad || 'ABUELITOS') as CoachTone
    const goalLogic = applyPersonality(resolveGoal(goal, ctx.userProfile?.experienceLevel as ExperienceLevel), tone)
    if (goalLogic.progressionRate === 'conservative' && action === 'increase_weight') {
      action = 'maintain'
      factors.push('objetivo conservador')
      reason += ' Tu perfil prioriza técnica y progresión gradual.'
    }

    const m = rec.text.match(/(\d+\.?\d*) kg/)
    const confidence = warns.length > 0 ? 0.7 : safety.severity === 'warning' ? 0.55 : 0.6

    // 5. Log decision
    await logDecision({
      type: 'training',
      context: { exercise: ctx.ejercicio, goal, level: ctx.userProfile?.experienceLevel, tone },
      decision: {
        what: `${action}: ${reason.slice(0, 100)}`,
        why: reason,
        factors,
        confidence,
      },
    })

    return {
      type:'training_recommendation',
      exercise: ctx.ejercicio||'',
      action,
      suggested_weight: m? Number(m[1]): undefined,
      reason,
      factors,
      confidence,
      why: factors
    }
  }
}
