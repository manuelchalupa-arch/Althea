import type { AIProvider } from './aiProvider'
import { FallbackAIProvider } from './fallbackAIProvider'
import { generateUnifiedRecommendation } from './unifiedPipeline'

// Fachada — la app solo habla con AIProvider.
//
// Arquitectura final del Coach:
//   Coach → contexto real → Groq mediante proxy (chatService) → fallback
//   determinístico local (FallbackAIProvider / generateUnifiedRecommendation).
// Sin modelos descargables: no hay descarga de pesos, ni runtime ONNX, ni
// dependencia de @huggingface/transformers.
class AIService implements AIProvider {
  private fallback = new FallbackAIProvider()
  name = 'Coach IA'
  getModelInfo(){ return this.fallback.getModelInfo() }
  isModelReady(){ return this.fallback.isModelReady() }
  async downloadModel(){ /* sin modelo descargable: no-op */ }
  async isAvailable(){ return this.fallback.isAvailable() }
  async getStatus(){ return this.fallback.getStatus() }
  async generateRecommendation(ctx:any){
    try{
      return await this.fallback.generateRecommendation(ctx)
    }catch{
      return generateUnifiedRecommendation(ctx)
    }
  }
}

export const aiService: AIProvider = new AIService() as any
