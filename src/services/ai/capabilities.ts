export type AIStatus = 'available' | 'limited' | 'unavailable'
export type AIStatusInfo = { status: AIStatus; icon:'🟢'|'🟡'|'🔴'; reason:string; webgpu:boolean; wasm:boolean }

export async function detectCapabilities(): Promise<AIStatusInfo>{
  const webgpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu
  // WASM siempre disponible en browsers modernos, pero chequeamos
  const wasm = typeof WebAssembly !== 'undefined'
  let ramOk = true
  try{
    const nm:any = navigator as any
    if(nm.deviceMemory) ramOk = nm.deviceMemory >= 4
    // storage estimate
    if(navigator.storage?.estimate){
      const est = await navigator.storage.estimate()
      const quota = est.quota || 0
      if(quota && quota < 500*1024*1024) ramOk = false
    }
  }catch{}

  if(webgpu && wasm && ramOk) return { status:'available', icon:'🟢', reason:'WebGPU disponible', webgpu, wasm }
  if(wasm && ramOk) return { status:'limited', icon:'🟡', reason:'WebGPU no disponible — usará WASM (más lento)', webgpu, wasm }
  // Si no hay WebGPU ni WASM suficiente, fallback determinístico
  return { status:'unavailable', icon:'🔴', reason:'Dispositivo sin WebGPU/WASM suficiente — motor determinístico', webgpu, wasm }
}

export function humanSize(bytes:number){
  if(bytes<1024) return bytes+' B'
  if(bytes<1024*1024) return (bytes/1024).toFixed(1)+' KB'
  return (bytes/1024/1024).toFixed(1)+' MB'
}
