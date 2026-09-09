import type { AIProvider } from './aiProvider'
import { QwenProvider, qwenProvider } from './qwenProvider'
import { FallbackAIProvider } from './fallbackAIProvider'
import { detectCapabilities } from './capabilities'

// Fachada — la app solo habla con AIProvider
class AIService implements AIProvider {
  private qwen = qwenProvider
  private fallback = new FallbackAIProvider()
  private active: AIProvider = this.fallback
  name = 'Coach IA'
  constructor(){
    this.resolveActive()
  }
  private async resolveActive(){
    const cap = await detectCapabilities()
    const ready = localStorage.getItem('qwen:status')==='ready'
    if(cap.status!=='unavailable' && ready){
      // intenta cargar qwen en background sin bloquear
      this.qwen.downloadModel().then(()=> this.active=this.qwen).catch(()=> this.active=this.fallback)
      this.active = this.qwen
    } else {
      this.active = this.fallback
    }
  }
  getModelInfo(){ return this.qwen.getModelInfo() }
  isModelReady(){ return this.qwen.isModelReady() }
  async downloadModel(p?:(n:number)=>void){ await this.qwen.downloadModel(p); this.active=this.qwen }
  async isAvailable(){ return this.active.isAvailable() }
  async getStatus(){
    const q = await this.qwen.getStatus()
    if(q.status==='available') return q
    return this.fallback.getStatus()
  }
  async generateRecommendation(ctx:any){
    try{
      return await this.active.generateRecommendation(ctx)
    }catch{
      return this.fallback.generateRecommendation(ctx)
    }
  }
}

export const aiService: AIProvider = new AIService() as any
export { QwenProvider }
