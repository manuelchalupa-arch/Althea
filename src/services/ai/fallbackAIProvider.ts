import type { AIProvider, AIContext, AIRecommendation } from './aiProvider'
import { generateUnifiedRecommendation } from './unifiedPipeline'

export class FallbackAIProvider implements AIProvider {
  name = 'Determinístico'
  getModelInfo(){ return { model:'Motor determinístico v2', size:'0 MB', required:'0 MB' } }
  isModelReady(){ return true }
  async isAvailable(){ return true }
  async getStatus(){ return { icon:'🟡', status:'limited', reason:'IA local no disponible — usando motor determinístico v2' } }
  async downloadModel(){}
  async generateRecommendation(ctx: AIContext): Promise<AIRecommendation>{
    return generateUnifiedRecommendation(ctx)
  }
}
