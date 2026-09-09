import type { AIProvider, AIContext, AIRecommendation } from './aiProvider'
import { buildPrompt } from './contextBuilder'
import { parseRecommendation } from './recommendationParser'
import { FallbackAIProvider } from './fallbackAIProvider'

const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX'
const MODEL_SIZE = 'q4f16 ~340-380 MB · q4 ~320 MB' // real
const REQUIRED = '~400 MB descarga + ~1.0 GB RAM (WebGPU) / ~0.9 GB (WASM)'

type Status = 'not-installed'|'downloading'|'installing'|'ready'
let status: Status = (localStorage.getItem('qwen:status') as Status) || 'not-installed'
let progress = 0
let pipe:any = null
let device: 'webgpu'|'wasm' = 'webgpu'

function setStatus(s:Status){ status=s; localStorage.setItem('qwen:status', s) }

export class QwenProvider implements AIProvider {
  name = 'Qwen3-0.6B'
  fallback = new FallbackAIProvider()
  getModelInfo(){ return { model:`${MODEL_ID} (${MODEL_SIZE})`, size:'~340 MB', required: REQUIRED } }
  isModelReady(){ return status==='ready' && !!pipe }
  async getStatus(){
    const cap = await (await import('./capabilities')).detectCapabilities()
    if(status==='ready' && pipe) return { icon:'🟢', status:'available', reason:`Qwen3-0.6B listo (${device})` }
    if(status==='downloading') return { icon:'🟡', status:'limited', reason:`Descargando ${progress}%` }
    if(cap.status==='unavailable') return { icon:'🔴', status:'unavailable', reason: cap.reason }
    return { icon: cap.icon as any, status: cap.status, reason: cap.reason + (status==='not-installed'?' — modelo no instalado':'') }
  }
  async isAvailable(){
    const s = await this.getStatus()
    return s.status!=='unavailable'
  }
  async downloadModel(onProgress?:(p:number)=>void):Promise<void>{
    if(status==='ready' && pipe) return
    setStatus('downloading'); progress=0
    const onProg = (p:any)=>{
      // transformers progress: {status, progress, file}
      if(p.progress) { progress = Math.round(p.progress); onProgress?.(progress); localStorage.setItem('qwen:progress', String(progress)) }
    }
    try{
      const { pipeline, env } = await import('@huggingface/transformers')
      // cache a Cache API
      env.allowLocalModels = false
      // intenta WebGPU primero
      const cap = await (await import('./capabilities')).detectCapabilities()
      device = cap.webgpu ? 'webgpu' : 'wasm'
      const dtype = device==='webgpu' ? 'q4f16' : 'q4'
      setStatus('installing')
      pipe = await pipeline('text-generation', MODEL_ID, {
        device: device as any,
        dtype: dtype as any,
        progress_callback: onProg
      } as any)
      setStatus('ready'); progress=100; onProgress?.(100)
    }catch(e){
      setStatus('not-installed')
      throw e
    }
  }

  async generateRecommendation(ctx: AIContext): Promise<AIRecommendation>{
    // privacidad: solo contexto reducido
    if(ctx.dolor?.includes('severe') || ctx.dolor?.includes('Importante')){
      return { type:'training_recommendation', exercise:ctx.ejercicio||'', action:'decrease_weight', reason:'Dolor importante registrado — no aumentar carga. Consultá profesional y considerá variante.', factors:['dolor importante','seguridad'], confidence:0.9 }
    }
    if(!pipe){
      // si no está listo, intenta fallback determinístico sin romper
      return this.fallback.generateRecommendation(ctx)
    }
    const prompt = buildPrompt(ctx)
    try{
      const out:any = await pipe(prompt, { max_new_tokens: 180, temperature: 0.3, top_p: 0.9, do_sample: false })
      const text = Array.isArray(out) ? out[0]?.generated_text ?? '' : out.generated_text ?? String(out)
      // el pipeline devuelve prompt+completion; extrae JSON
      const rec = parseRecommendation(text)
      if(rec) return rec
      // si no parsea, fallback con texto truncado
      return { type:'training_recommendation', exercise:ctx.ejercicio||'', action:'maintain', reason: text.slice(0,180) || 'Mantener carga y controlar técnica.', factors:[prompt.slice(0,60)], confidence:0.5 }
    }catch{
      return this.fallback.generateRecommendation(ctx)
    }
  }
}

export const qwenProvider = new QwenProvider()
