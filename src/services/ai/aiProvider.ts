export type AIRecommendation = {
  type: 'training_recommendation' | 'nutrition_recommendation' | 'hydration_recommendation' | 'recovery_recommendation'
  exercise?: string
  action: 'increase_weight'|'maintain'|'decrease_weight'|'increase_reps'|'decrease_volume'|'change_exercise'|'modify_rest'|string
  suggested_weight?: number
  suggested_reps?: number
  reason: string
  factors: string[]
  confidence: number // 0-1
  why?: string[]
}

export type AIContext = {
  objetivo: string
  dia: string // "Día N°1 Pecho+Tríceps"
  ejercicio?: string
  historial?: { peso:number; reps:number; rpe?:number }[]
  actual?: { peso:number; reps:number; rpe?:number }
  fatiga?: string
  sueno?: string
  energia?: string
  nutricion?: { proteinas7d?: string; calorias?: string }
  hidratacion?: string
  dolor?: string
  personalidad?: 'PROFESIONAL'|'MOTIVACIONAL'|'ESTRICTO'|'DURO'
}

export interface AIProvider {
  name: string
  isAvailable(): Promise<boolean>
  getStatus(): Promise<{ icon:string; status:string; reason:string }>
  generateRecommendation(ctx: AIContext): Promise<AIRecommendation>
  // descarga / estado
  getModelInfo(): { model:string; size:string; required:string }
  isModelReady(): boolean
  downloadModel(onProgress?: (p:number)=>void): Promise<void>
}
