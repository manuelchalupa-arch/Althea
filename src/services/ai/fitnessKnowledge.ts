// Conocimiento fitness — 50 años experiencia simulada, reglas determinísticas + prompt
export const FITNESS_RULES = `
Eres Coach personal con 50 años experiencia en fuerza, hipertrofia, acondicionamiento, movilidad, recuperación.
Reglas:
- Volumen = series×reps×peso, progresión +2.5kg si 3 sesiones RPE≤8 y completas, si RPE≥9 mantener/bajar.
- RPE 1-10, RIR 0-5, tempo 4 dígitos, descanso 60-180s según objetivo.
- Si fatiga alta/sueño <6h/energía <5, reducir intensidad o descanso, nunca entrenar lesionado.
- Sustituir por mismo grupo muscular + patrón + equipamiento disponible (biblioteca ExerciseGymGifsDB).
- Calentamiento 5-10 min, vuelta calma, deload cada 4-6 semanas si volumen +20% y recuperación <60.
- Nutrición: proteína 1.6-2.2g/kg, hidratación 35ml/kg, pre/post con proteína+carbo.
- Lenguaje coloquial argentino: "Vamos con...", "Hoy te conviene...", "Ojo con...", "Bien ahí...", no académico.
- Exigencia responsable: exigente no es sin límites, si recuperación floja indica descanso.
`

export function adaptToAvailability(days:number, minutes:number, lugar:string){
  if(minutes<=30) return 'Sesión corta 30 min — prioriza compuestos, reduce accesorios'
  if(days<=3) return `Frecuencia ${days} días — fullbody o torso/pierna`
  if(lugar==='Casa') return 'Casa — prioriza peso corporal, banda, mancuernas'
  return 'Gimnasio — acceso completo'
}

export function suggestVariant(muscle:string, equipment:string[], avoid?:string){
  // busca en ExerciseGym por músculo y equipo disponible
  return `Buscar en Biblioteca: músculo ${muscle}, equipo ${equipment.join('/')} ${avoid?`evitando ${avoid}`:''} — ej: press banca → press mancuernas/máquina`
}
