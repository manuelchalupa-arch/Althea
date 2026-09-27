// Normalización grupos musculares → API ExerciseGymGifsDB
// UI (es) → muscle API (en)
// Grupo Piernas = familia completa (quads, hamstrings, glutes, calves, abductors, adductors) — no solo quads
export const GROUP_MAP: Record<string,string> = {
  'pecho':'pectorals',
  'pectorales':'pectorals',
  'pectoral':'pectorals',
  'espalda':'lats',
  'dorsales':'lats',
  'dorsal':'lats',
  'espalda alta':'upper-back',
  'biceps':'biceps',
  'bíceps':'biceps',
  'triceps':'triceps',
  'tríceps':'triceps',
  'hombros':'delts',
  'hombro':'delts',
  'deltoides':'delts',
  'delts':'delts',
  'piernas':'__piernas__', // marcador familia (ver parseDayMuscles)
  'pierna':'__piernas__',
  'cuadriceps':'quads',
  'cuádriceps':'quads',
  'quadriceps':'quads',
  'isquiotibiales':'hamstrings',
  'isquios':'hamstrings',
  'femorales':'hamstrings',
  'hamstrings':'hamstrings',
  'gluteos':'glutes',
  'glúteos':'glutes',
  'gluteo':'glutes',
  'glutes':'glutes',
  'pantorrillas':'calves',
  'gemelos':'calves',
  'calves':'calves',
  'abdominales':'abs',
  'abdomen':'abs',
  'abdominals':'abs',
  'abs':'abs',
  'core':'abs',
  'antebrazos':'forearms',
  'forearms':'forearms',
  'trapecios':'traps',
  'traps':'traps',
  'cardio':'cardio',
  'movilidad':'cardio',
}
export const PIERNA_FAMILY = ['quads','hamstrings','glutes','calves','abductors','adductors']

// Sinónimos extra para búsqueda libre
const SEPARATORS = /[\s,+\/]+|y|con|e|&/i

export function normalizeToken(tok:string): string | null {
  const key = tok.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  // quita acentos para lookup
  const plain = key.replace(/[^a-z]/g,'')
  // busca directo
  for(const [k,v] of Object.entries(GROUP_MAP)){
    const nk = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'')
    if(nk===plain) {return v}
  }
  // alias sin acento
  return GROUP_MAP[key] || null
}

export function parseDayMuscles(text:string): string[] {
  if(!text) {return []}
  const lower = text.toLowerCase()
  const cleaned = lower.replace(/día de|dia de|día|dia|entrenamiento|musculo|músculo/g,' ')
  const found = new Set<string>()
  const rawTokens = cleaned.split(/[,+\/;]+/)
  rawTokens.forEach(chunk=>{
    chunk.split(/\s+y\s+|\s+e\s+|\s*\+\s*|\s+/).forEach(tok=>{
      const n = normalizeToken(tok)
      if(n) {
        if(n==='__piernas__'){ PIERNA_FAMILY.forEach(m=>found.add(m)) } else {found.add(n)}
      }
    })
  })
  const lowerNoAccent = lower.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  for(const [k,v] of Object.entries(GROUP_MAP)){
    const nk = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    if(lowerNoAccent.includes(nk)){
      if(v==='__piernas__'){ PIERNA_FAMILY.forEach(m=>found.add(m)) }
      else if(!found.has(v)) {found.add(v)}
    }
  }
  return Array.from(found)
}

// Para mostrar al usuario el grupo interpretado
export function displayMuscle(muscle:string){
  const rev:Record<string,string> = {
    pectorals:'Pecho', lats:'Espalda', biceps:'Bíceps', triceps:'Tríceps', delts:'Hombros',
    quads:'Cuádriceps', hamstrings:'Isquios', glutes:'Glúteos', calves:'Pantorrillas',
    abs:'Abdominales', forearms:'Antebrazos', traps:'Trapecios', cardio:'Cardio',
    'upper-back':'Espalda alta', 'abductors':'Abductores', 'adductors':'Aductores'
  }
  return rev[muscle] || muscle
}
