import { db } from '@/services/storage/db'
import { exportJSON as newExportJSON, exportCSV as newExportCSV, downloadBlob as newDownloadBlob, importJSON as newImportJSON, generateImportPreview, type ImportOptions, type ImportPreview, type ImportResult, type ExportData, type ExportMetadata } from './exportImport'

export async function exportJSON(){
  return newExportJSON()
}
export async function exportCSV(){
  return newExportCSV()
}
export function downloadBlob(blob:Blob, name:string){
  return newDownloadBlob(blob, name)
}
export async function exportPDF(){
  const logs = await db.setLogs.toArray()
  const sessions = await db.sessions.toArray()
  const html = `<html><head><title>Train PWA - Historial</title><style>body{font-family:Roboto,sans-serif;padding:20px} h1{color:#1E3A5F} table{width:100%;border-collapse:collapse} th,td{border:1px solid #263034;padding:6px;font-size:12px} th{background:#1F272A;color:#F1F5F3}</style></head><body><h1>Train PWA — Historial</h1><p>Sesiones: ${sessions.length} · Series: ${logs.length} · ${new Date().toLocaleDateString('es')}</p><table><tr><th>Fecha</th><th>Ejercicio</th><th>Peso</th><th>Reps</th></tr>${logs.slice(-100).map(l=>`<tr><td>${l.createdAt.slice(0,10)}</td><td>${l.exerciseId}</td><td>${l.weight}</td><td>${l.reps}</td></tr>`).join('')}</table><p>Generado localmente, sin enviar datos.</p></body></html>`
  const blob = new Blob([html], {type:'text/html'})
  const url = URL.createObjectURL(blob)
  const w = window.open(url,'_blank')
  if(w) {setTimeout(()=> w.print(), 500)}
  else {newDownloadBlob(blob, `trainpwa-historial-${new Date().toISOString().slice(0,10)}.html`)}
}
export async function importJSON(file:File, options?: ImportOptions){
  return newImportJSON(file, options)
}
export { generateImportPreview, type ImportOptions, type ImportPreview, type ImportResult, type ExportData, type ExportMetadata }
