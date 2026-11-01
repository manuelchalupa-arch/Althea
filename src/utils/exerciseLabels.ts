// Etiquetas en español para los valores en inglés del catálogo.
// El dato guardado sigue en inglés (compatibilidad con la API); esto es solo presentación.
const BODY_PART: Record<string, string> = {
  arms: 'Brazos', back: 'Espalda', cardio: 'Cardio', chest: 'Pecho',
  core: 'Core', legs: 'Piernas', shoulders: 'Hombros',
}

const CATEGORY: Record<string, string> = {
  strength: 'Fuerza', hypertrophy: 'Hipertrofia', cardio: 'Cardio',
  stretching: 'Estiramiento', plyometrics: 'Pliometría',
  warmup: 'Calentamiento', mobility: 'Movilidad',
}

const EQUIPMENT: Record<string, string> = {
  lever: 'Palanca', band: 'Banda', bodyweight: 'Peso corporal', barbell: 'Barra',
  cable: 'Polea', dumbbell: 'Mancuernas', kettlebell: 'Pesa rusa', sled: 'Trineo',
  smith: 'Máquina Smith', 'ez-bar': 'Barra EZ', machine: 'Máquina', other: 'Otro',
  // Semillas ya en español (minúscula): solo se capitalizan al mostrar.
  barra: 'Barra', máquina: 'Máquina', mancuernas: 'Mancuernas', mancuerna: 'Mancuerna',
  paralelas: 'Paralelas', polea: 'Polea', 'barra fija': 'Barra fija', banco: 'Banco',
  'banco scott': 'Banco Scott', 'peso corporal': 'Peso corporal', rueda: 'Rueda',
  banda: 'Banda', pelota: 'Pelota', 'foam roller': 'Rodillo',
}

const DIFFICULTY: Record<string, string> = {
  beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado',
}

const label = (map: Record<string, string>, value?: string) => {
  if (!value) { return value || '' }
  const key = value.trim().toLowerCase()
  return map[key] ?? value
}

export const displayBodyPart = (v?: string) => label(BODY_PART, v)
export const displayCategory = (v?: string) => label(CATEGORY, v)
export const displayEquipment = (v?: string) => label(EQUIPMENT, v)
export const displayDifficulty = (v?: string) => label(DIFFICULTY, v)
