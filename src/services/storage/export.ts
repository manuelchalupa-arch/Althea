import { db } from '@/services/storage/db'

export async function exportJSON(){
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    customExercises: await db.table('customExercises').toArray().catch(()=>[]),
    routines: await db.routines.toArray(),
    routineDays: await db.routineDays.toArray(),
    routineExercises: await db.routineExercises.toArray(),
    sessions: await db.sessions.toArray(),
    setLogs: await db.setLogs.toArray(),
    userProfile: await db.userProfile.toArray(),
  }
  return new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
}
export async function exportCSV(){
  const logs = await db.setLogs.toArray()
  const header = 'id,sessionId,exerciseId,setNumber,weight,reps,rpe,rir,createdAt\n'
  const rows = logs.map(l=> [l.id,l.sessionId,l.exerciseId,l.setNumber,l.weight,l.reps,l.rpe??'',l.rir??'',l.createdAt].join(',')).join('\n')
  return new Blob([header+rows],{type:'text/csv'})
}
export function downloadBlob(blob:Blob, name:string){
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url)
}
export async function exportPDF(){
  const logs = await db.setLogs.toArray()
  const sessions = await db.sessions.toArray()
  const html = `<html><head><title>Train PWA - Historial</title><style>body{font-family:Roboto,sans-serif;padding:20px} h1{color:#1E3A5F} table{width:100%;border-collapse:collapse} th,td{border:1px solid #263034;padding:6px;font-size:12px} th{background:#1F272A;color:#F1F5F3}</style></head><body><h1>Train PWA — Historial</h1><p>Sesiones: ${sessions.length} · Series: ${logs.length} · ${new Date().toLocaleDateString('es')}</p><table><tr><th>Fecha</th><th>Ejercicio</th><th>Peso</th><th>Reps</th></tr>${logs.slice(-100).map(l=>`<tr><td>${l.createdAt.slice(0,10)}</td><td>${l.exerciseId}</td><td>${l.weight}</td><td>${l.reps}</td></tr>`).join('')}</table><p>Generado localmente, sin enviar datos.</p></body></html>`
  const blob = new Blob([html], {type:'text/html'})
  const url = URL.createObjectURL(blob)
  const w = window.open(url,'_blank')
  if(w) setTimeout(()=> w.print(), 500)
  else downloadBlob(blob, `trainpwa-historial-${new Date().toISOString().slice(0,10)}.html`)
}
export async function importJSON(file:File){
  const txt = await file.text()
  const data = JSON.parse(txt)
  if(data.exercises) await db.exercises.bulkPut(data.exercises)
  if(data.customExercises) await db.table('customExercises').bulkPut(data.customExercises)
  if(data.sessions) await db.sessions.bulkPut(data.sessions)
  if(data.setLogs) await db.setLogs.bulkPut(data.setLogs)
  if(data.routines) await db.routines.bulkPut(data.routines)
  if(data.routineDays) await db.routineDays.bulkPut(data.routineDays)
  if(data.routineExercises) await db.routineExercises.bulkPut(data.routineExercises)
  if(data.userProfile) await db.userProfile.bulkPut(data.userProfile)
  // localStorage keys (Codulia key, wger cache, etc.) se mantienen
}
