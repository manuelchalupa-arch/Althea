// Push máx 2/día — stub web Notification API (sin VAPID requerido para in-app)
// F4 real usaría Service Worker Push con backend VAPID; aquí control frecuencia + suppress si completado
export type PushType = 'seguimiento'|'pre-entreno'|'agua'|'cuestionario'|'recuperacion'|'comoEstas'|'proteina'|'entrenamiento'
const KEY = 'notifLog'
const LEGACY_CAPPED: PushType[] = ['seguimiento', 'pre-entreno']

function todayStr(){ return new Date().toISOString().slice(0,10) }
function getLog():{date:string; count:number; types:string[]}[] {
  try{ return JSON.parse(localStorage.getItem(KEY)||'[]') }catch{ return [] }
}
function setLog(v:any){ localStorage.setItem(KEY, JSON.stringify(v)) }

export function canSend(type:PushType): boolean {
  // Tipos del scheduler: sin tope legacy (el scheduler marca cada horario disparado); solo respeta duplicados del mismo tipo legacy.
  if(!LEGACY_CAPPED.includes(type)) return true
  const today = todayStr()
  const log = getLog().find(x=>x.date===today)
  if(!log) return true
  if(log.count >=2) return false
  if(log.types.includes(type)) return false
  // suppress si sesión ya completada
  if(type==='pre-entreno' && localStorage.getItem('session:todayCompleted')==='1') return false
  return true
}

export async function sendNotification(type:PushType, title:string, body:string, onClick?:()=>void){
  if(!canSend(type)) return false
  if(typeof Notification === 'undefined') return false
  if(Notification.permission !== 'granted'){
    const p = await Notification.requestPermission()
    if(p!=='granted') return false
  }
  const n = new Notification(title, { body, icon:'/icons/icon-192.png' })
  if(onClick) n.onclick = (e)=>{ e.preventDefault(); try{ window.focus() }catch{ /* noop */ } onClick() }
  const log = getLog()
  let entry = log.find(x=>x.date===todayStr())
  if(!entry){ entry={date:todayStr(), count:0, types:[]}; log.push(entry) }
  entry.count++; entry.types.push(type); setLog(log)
  return true
}

export function schedulePreEntreno(trainingTime:string){
  // trainingTime "18:00" → notif 45 min antes si es hoy y aún no entrenó
  const [h,m]=trainingTime.split(':').map(Number)
  const now=new Date(); const target=new Date(); target.setHours(h,m-45,0,0)
  const delay = target.getTime()-now.getTime()
  if(delay>0 && delay< 24*60*60*1000){
    setTimeout(()=> sendNotification('pre-entreno','En 45 min entrenás','Revisá la rutina y preparate.'), delay)
  }
}
