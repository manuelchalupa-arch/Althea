import type { AIRecommendation } from './aiProvider'

const allowedActions = new Set(['increase_weight','maintain','decrease_weight','increase_reps','decrease_volume','change_exercise','modify_rest'])

export function parseRecommendation(raw:string): AIRecommendation | null {
  try{
    // extrae JSON aunque venga con texto extra
    const m = raw.match(/\{[\s\S]*\}/)
    if(!m) return null
    const j = JSON.parse(m[0])
    if(j.type !== 'training_recommendation' && j.type !== 'nutrition_recommendation' && j.type !== 'hydration_recommendation' && j.type !== 'recovery_recommendation') return null
    if(!allowedActions.has(j.action) && j.action!=='maintain') return null
    if(typeof j.reason !== 'string' || j.reason.length<5) return null
    const rec: AIRecommendation = {
      type: j.type || 'training_recommendation',
      exercise: j.exercise || '',
      action: j.action,
      suggested_weight: typeof j.suggested_weight==='number' ? j.suggested_weight : undefined,
      suggested_reps: typeof j.suggested_reps==='number' ? j.suggested_reps : undefined,
      reason: j.reason.slice(0,300),
      factors: Array.isArray(j.why) ? j.why.slice(0,5) : (Array.isArray(j.factors)? j.factors.slice(0,5): []),
      confidence: typeof j.confidence==='number' ? Math.max(0,Math.min(1,j.confidence)) : 0.6,
      why: Array.isArray(j.why) ? j.why : undefined
    }
    return rec
  }catch{ return null }
}

export function toCoachCard(rec: AIRecommendation): { text:string; why:string[] }{
  const w = rec.suggested_weight ? `${rec.suggested_weight} kg` : ''
  let text = rec.reason
  if(rec.action==='increase_weight' && w) text = `Hoy podés intentar ${w} — ${rec.reason}`
  return { text, why: rec.factors || rec.why || [] }
}
