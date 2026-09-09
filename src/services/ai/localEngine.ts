import type { SetLog } from '@/types'
import { recoveryScore } from '@/utils/calc'

export type Recommendation = {
  id:string; type:'load'|'volume'|'deload'; text:string; reason:string; factors:string[]; decision:'pending'|'accepted'|'rejected'|'modified'
}

// Reglas determinísticas — sin IA externa
export function recommendLoad(history: SetLog[]): Recommendation {
  if(history.length===0) return { id:'rec-load', type:'load', text:'Carga inicial conservadora 20 kg × 8', reason:'Sin historial', factors:['sin historial'], decision:'pending' }
  const last = history[history.length-1]
  const avg = history.slice(-3).reduce((a,x)=>a+x.weight,0)/Math.min(3,history.length)
  const avgRpe = history.slice(-3).map(x=>x.rpe??7).reduce((a,b)=>a+b,0)/Math.min(3,history.length)
  if(history.length>=3 && history.slice(-3).every(h=> h.reps>=8 && (h.rpe??7) <=8)){
    return { id:'rec-load', type:'load', text:`Probar ${last.weight+2.5} kg × 8`, reason:'3 sesiones con reps completas y RPE ≤8', factors:['reps completas','RPE bajo','volumen estable'], decision:'pending' }
  }
  if(avgRpe >= 9) return { id:'rec-load', type:'load', text:`Mantener ${last.weight} kg o bajar a ${Math.max(0,last.weight-2.5)} kg`, reason:'RPE medio ≥9, fatiga alta', factors:['RPE alto','riesgo'], decision:'pending' }
  return { id:'rec-load', type:'load', text:`Mantener ${avg.toFixed(1)} kg`, reason:`Promedio últimas 3: ${avg.toFixed(1)} kg`, factors:['promedio'], decision:'pending' }
}

export function shouldDeload(volumeLast3Weeks:number[], recoveryScores:number[]): Recommendation | null {
  const highVolume = volumeLast3Weeks.length>=3 && volumeLast3Weeks[2] > volumeLast3Weeks[0]*1.2
  const lowRecovery = recoveryScores.slice(-3).filter(s=> s < 60).length >=2
  if(highVolume && lowRecovery){
    return { id:'rec-deload', type:'deload', text:'Se recomienda semana de descarga (-40% volumen)', reason:'Volumen +20% en 3 semanas + recuperación <60 dos días', factors:['volumen acumulado','recuperación baja'], decision:'pending' }
  }
  return null
}

export function variantForPain(exerciseId:string, pain:'mild'|'moderate'|'severe'): string[] {
  if(pain==='severe') return ['Detener ejercicio, consultar profesional']
  const map:Record<string,string[]> = {
    'ex-001': ['ex-002','ex-003'], // press banca → mancuernas → máquina
    'ex-006': ['ex-007'], // sentadilla → prensa
  }
  return map[exerciseId] ?? ['Buscar en Biblioteca por mismo patrón/músculo']
}
