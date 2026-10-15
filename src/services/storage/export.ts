// Fachada de export/import. Delega en `exportImport.ts`, que serializa el
// modelo vigente (trainingSessions / sessionExercises / setRecords / …).
//
// `exportPDF` se retiró (DEAD-001): leía `db.setLogs` y `db.sessions`, que desde
// el esquema v5 son capa legacy de solo lectura y ya no registran sesiones, así
// que exportaba una tabla vacía. El PDF real lo genera `reportPdf.downloadReportPdf`
// desde Progreso → «Generar informe descargable».
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
export async function importJSON(file:File, options?: ImportOptions){
  return newImportJSON(file, options)
}
export { generateImportPreview, type ImportOptions, type ImportPreview, type ImportResult, type ExportData, type ExportMetadata }
