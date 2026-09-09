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
    const action = rec.text.includes('Probar') ? 'increase_weight' : rec.text.includes('bajar') ? 'decrease_weight' : 'maintain'
    const m = rec.text.match(/(\d+\.?\d*) kg/)
    return {
      type:'training_recommendation',
      exercise: ctx.ejercicio||'',
      action,
      suggested_weight: m? Number(m[1]): undefined,
      reason: rec.reason,
      factors: rec.factors||[],
      confidence: 0.6,
      why: rec.factors
    }
  }
}
