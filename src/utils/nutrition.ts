// Cálculos nutricionales — documentado: Mifflin-St Jeor para TMB, factores actividad estándar
// No diagnóstico, estimado/orientativo
export type ActivityLevel = 'sedentario'|'poco_activo'|'moderado'|'muy_activo'|'extremadamente_activo'
const FACTORS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  poco_activo: 1.375,
  moderado: 1.55,
  muy_activo: 1.725,
  extremadamente_activo: 1.9
}

export function calcIMC(weightKg:number, heightCm:number){
  const h = heightCm/100
  const bmi = weightKg / (h*h)
  const cat = bmi < 18.5 ? 'Bajo peso' : bmi < 25 ? 'Peso normal' : bmi < 30 ? 'Sobrepeso' : 'Obesidad'
  return { bmi: bmi.toFixed(1), bmiCat: cat }
}

// Mifflin-St Jeor: 10*W + 6.25*H -5*A + s (s=+5 M, -161 F, -78 X promedio)
export function calcTMB(weightKg:number, heightCm:number, age?:number, sex?:string){
  if(!weightKg || !heightCm) return null
  const a = age || 30
  const s = sex==='M' ? 5 : sex==='F' ? -161 : -78
  return Math.round(10*weightKg + 6.25*heightCm -5*a + s)
}

export function calcTDEE(tmb:number | null, activity: ActivityLevel, trainingDays:number){
  if(!tmb) return null
  // ajusta levemente por frecuencia: +50 kcal por día extra sobre 3
  const extra = Math.max(0, trainingDays -3)*50
  return Math.round(tmb * FACTORS[activity] + extra)
}

export function calorieGoal(tdee:number | null, goalPrimary?:string){
  if(!tdee) return null
  const g = (goalPrimary||'').toLowerCase()
  if(g.includes('grasa') || g.includes('perder') || g.includes('bajar')) return Math.round(tdee * 0.85) // -15% déficit moderado
  if(g.includes('masa') || g.includes('ganar')) return Math.round(tdee * 1.10) // +10% superávit moderado
  return tdee // mantenimiento
}

export function proteinRange(weightKg:number, goalPrimary?:string){
  if(!weightKg) return null
  const g = (goalPrimary||'').toLowerCase()
  let low=1.6, high=2.2
  if(g.includes('fuerza')) { low=1.8; high=2.2 }
  else if(g.includes('grasa')) { low=1.8; high=2.4 }
  else if(g.includes('masa')) { low=1.8; high=2.2 }
  return { low: Math.round(weightKg*low), high: Math.round(weightKg*high), text: `${Math.round(weightKg*low)}–${Math.round(weightKg*high)} g/día` }
}
