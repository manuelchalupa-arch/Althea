import type { AIProvider, AIContext, AIRecommendation } from './aiProvider'
import { recommendLoad } from './localEngine'

export class FallbackAIProvider implements AIProvider {
  name = 'Determinístico'
  getModelInfo(){ return { model:'Motor determinístico', size:'0 MB', required:'0 MB' } }
  isModelReady(){ return true }
  async isAvailable(){ return true }
  async getStatus(){ return { icon:'🟡', status:'limited', reason:'IA local no disponible — usando motor determinístico' } }
  async downloadModel(){}
  async generateRecommendation(ctx: AIContext): Promise<AIRecommendation>{
    const hist = (ctx.historial||[]).map(h=> ({ weight:h.peso, reps:h.reps, rpe:h.rpe })) as any
    // @ts-ignore hist shape compatible with localEngine
    const rec:any = recommendLoad(hist as any)
    let action = rec.text.includes('Probar') ? 'increase_weight' : rec.text.includes('bajar') ? 'decrease_weight' : 'maintain'
    let reason = rec.reason
    const factors = [...(rec.factors||[])]
    // Capa longitudinal: la recomendación CAMBIA según datos reales (insights/score).
    const warns = (ctx.insights||[]).filter(i=> i.level==='warn')
    if(warns.length>0){
      const top = warns[0]
      reason = `${top.title}. ${top.detail} ${rec.reason}`
      factors.unshift(`alerta: ${top.kind}`)
      if(top.kind==='overtrain' || top.kind==='pain') action = 'decrease_volume'
      if(top.kind==='pain') reason += ' Sin diagnosticar: si el dolor es importante, consultá profesional.'
    } else if((ctx.insights||[]).length===0 && (ctx.historial||[]).length===0){
      reason = 'Todavía no tengo suficientes datos tuyos para determinarlo. ' + rec.reason
      factors.push('sin datos suficientes')
    }
    if(ctx.score && ctx.score.score < 45){
      reason += ` Tu estado global está en ${ctx.score.score}/100: priorizá recuperación hoy.`
      factors.push(`score ${ctx.score.score}/100`)
      if(action==='increase_weight') action = 'maintain'
    }
    const m = rec.text.match(/(\d+\.?\d*) kg/)
    return {
      type:'training_recommendation',
      exercise: ctx.ejercicio||'',
      action,
      suggested_weight: m? Number(m[1]): undefined,
      reason,
      factors,
      confidence: warns.length>0 ? 0.7 : 0.6,
      why: factors
    }
  }
}
