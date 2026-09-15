// NUTRITION SAFETY — Detección de condiciones que requieren supervisión profesional
import type { NutritionMethodId, NutritionUserProfile } from './nutritionMethods'
import { getNutritionMethod } from './nutritionMethodsDB'

export interface NutritionSafetyAlert {
  id: string
  severity: 'info' | 'warning' | 'critical'
  category: 'contraindication' | 'risk_group' | 'medical' | 'medication' | 'pregnancy' | 'tca' | 'age' | 'combination'
  message: string
  professionalReferral: string
  blockedMethods?: NutritionMethodId[]
  requiresModification?: boolean
  modificationSuggestion?: string
}

// ─── Contraindicaciones absolutas por método ───
const METHOD_CONTRAINDICATIONS: Record<string, { conditions: string[]; message: string; referral: string }> = {
  keto: {
    conditions: ['diabetes_type1', 'pancreatitis', 'porphyria', 'carnitine_deficiency', 'carnitine_palmitoyltransferase_deficiency', 'carnitine_translocase_deficiency', 'beta_oxidation_defects', 'pyruvate_carboxylase_deficiency', 'porphyria'],
    message: 'La dieta cetogénica está contraindicada para tu condición médica. Puede causar complicaciones metabólicas serias.',
    referral: 'médico especialista / endocrinólogo',
  },
  whole30: {
    conditions: ['eating_disorder', 'diabetes_type1', 'kidney_disease', 'pregnancy', 'breastfeeding'],
    message: 'Whole30 es demasiado restrictivo para tu situación. Puede interferir con tratamientos médicos.',
    referral: 'nutricionista / médico',
  },
  intermittent_fasting: {
    conditions: ['pregnancy', 'breastfeeding', 'eating_disorder', 'diabetes_type1', 'hypoglycemia_prone'],
    message: 'El ayuno intermitente puede ser riesgoso en tu situación. Requiere supervisión profesional.',
    referral: 'nutricionista / médico',
  },
}

// ─── Grupos de riesgo por método ───
const METHOD_RISK_GROUPS: Record<string, { riskGroups: string[]; message: string; referral: string; severity: 'warning' | 'critical' }> = {
  keto: {
    riskGroups: ['diabetes_type2', 'kidney_disease', 'liver_disease', 'gallbladder_disease', 'pancreatic_insufficiency', 'hypertension'],
    message: 'La dieta cetogénica puede ser riesgosa para tu condición. Requiere monitoreo médico.',
    referral: 'endocrinólogo / nefrólogo',
    severity: 'warning',
  },
  high_protein: {
    riskGroups: ['kidney_disease', 'liver_disease', 'gout'],
    message: 'La alta ingesta proteica puede ser contraproducente para tu condición.',
    referral: 'nutricionista / nefrólogo',
    severity: 'warning',
  },
  dash: {
    riskGroups: ['kidney_disease'],
    message: 'La dieta DASH puede requerir ajustes según tu función renal.',
    referral: 'nutricionista / nefrólogo',
    severity: 'warning',
  },
}

// ─── Verificar condiciones médicas del usuario ───
export function checkMedicalConditions(
  profile: NutritionUserProfile,
  selectedMethod: NutritionMethodId,
): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []
  const conditions = profile.healthConditions || []
  const method = getNutritionMethod(selectedMethod)

  // 1. Contraindicaciones absolutas
  const contra = METHOD_CONTRAINDICATIONS[selectedMethod]
  if (contra) {
    for (const condition of conditions) {
      if (contra.conditions.includes(condition)) {
        alerts.push({
          id: `contra-${selectedMethod}-${condition}`,
          severity: 'critical',
          category: 'contraindication',
          message: contra.message,
          professionalReferral: contra.referral,
          blockedMethods: [selectedMethod],
        })
      }
    }
  }

  // 2. Grupos de riesgo
  const risk = METHOD_RISK_GROUPS[selectedMethod]
  if (risk) {
    for (const condition of conditions) {
      if (risk.riskGroups.includes(condition)) {
        alerts.push({
          id: `risk-${selectedMethod}-${condition}`,
          severity: risk.severity,
          category: 'medical',
          message: risk.message,
          professionalReferral: risk.referral,
          requiresModification: true,
          modificationSuggestion: `Consultá con un profesional antes de usar ${method?.nameEs || selectedMethod}. Puede requerir ajustes específicos.`,
        })
      }
    }
  }

  return alerts
}

// ─── Verificar embarazo/lactancia ───
export function checkPregnancy(profile: NutritionUserProfile): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []
  const conditions = profile.healthConditions || []

  const isPregnant = conditions.includes('pregnancy')
  const isBreastfeeding = conditions.includes('breastfeeding')

  if (isPregnant || isBreastfeeding) {
    const status = isPregnant ? 'embarazada' : 'lactando'
    alerts.push({
      id: `pregnancy-${isPregnant ? 'pregnant' : 'breastfeeding'}`,
      severity: 'critical',
      category: 'pregnancy',
      message: `Estado: ${status}. La mayoría de las dietas restrictivas no son seguras. Se requiere planificación nutricional profesional.`,
      professionalReferral: 'ginecólogo / nutricionista especializado',
      blockedMethods: ['keto', 'whole30', 'intermittent_fasting', 'paleo'],
      requiresModification: true,
      modificationSuggestion: 'Patrón mediterráneo o flexitariano con ajustes profesionales. No restricciones severas.',
    })
  }

  return alerts
}

// ─── Detectar trastornos de conducta alimentaria (TCA) ───
export function checkTCA(profile: NutritionUserProfile, qaHistory?: Array<{ key: string; answer: string }>): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []
  const conditions = profile.healthConditions || []

  // Check explicit conditions
  if (conditions.includes('eating_disorder') || conditions.includes('tca') || conditions.includes('anorexia') || conditions.includes('bulimia')) {
    alerts.push({
      id: 'tca-explicit',
      severity: 'critical',
      category: 'tca',
      message: 'Detecté antecedentes de trastorno de conducta alimentaria. Las dietas restrictivas pueden recaer. Se requiere acompañamiento profesional.',
      professionalReferral: 'psicólogo especializado / nutricionista con enfoque en TCA',
      blockedMethods: ['keto', 'whole30', 'intermittent_fasting', 'paleo'],
      requiresModification: true,
      modificationSuggestion: 'Enfoque intuitivo (intuitive_eating) con acompañamiento psicológico. Sin restricciones numéricas.',
    })
  }

  // Detect patterns from Q&A that may indicate TCA
  if (qaHistory) {
    const tcaIndicators = [
      'comпульсivo', 'atracon', 'purgar', 'vomitar', 'ayuno forzado',
      'obsesionado con la comida', 'culpa al comer', 'miedo a engordar',
      'imagen corporal distorsionada', 'peso ideal obsesivo',
    ]

    for (const qa of qaHistory) {
      const answer = (qa.answer || '').toLowerCase()
      if (tcaIndicators.some(indicator => answer.includes(indicator))) {
        alerts.push({
          id: 'tca-indicator-' + qa.key,
          severity: 'critical',
          category: 'tca',
          message: 'Detecté patrones que pueden estar relacionados con trastornos alimentarios. Recomiendo acompañamiento profesional.',
          professionalReferral: 'psicólogo especializado en TCA',
          blockedMethods: ['keto', 'whole30', 'intermittent_fasting'],
          requiresModification: true,
          modificationSuggestion: 'Evitar restricciones numéricas. Enfoque en relationship con la comida.',
        })
        break
      }
    }
  }

  return alerts
}

// ─── Verificar interacciones método + condición ───
export function checkMethodConditionInteractions(
  profile: NutritionUserProfile,
  selectedMethod: NutritionMethodId,
): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []
  const conditions = profile.healthConditions || []

  // Keto + diabetes tipo 2 → riesgo de hipoglucemia
  if (selectedMethod === 'keto' && conditions.includes('diabetes_type2')) {
    alerts.push({
      id: 'keto-diabetes-t2',
      severity: 'critical',
      category: 'combination',
      message: 'Cetosis + diabetes tipo 2 puede causar hipoglucemia o cetoacidosis. Requiere monitoreo de glucemia y ajuste de medicación.',
      professionalReferral: 'endocrinólogo',
      blockedMethods: ['keto'],
    })
  }

  // High protein + kidney disease → sobrecarga renal
  if (selectedMethod === 'high_protein' && conditions.includes('kidney_disease')) {
    alerts.push({
      id: 'highprotein-kidney',
      severity: 'critical',
      category: 'combination',
      message: 'Alta proteína + enfermedad renal puede acelerar el deterioro de la función renal.',
      professionalReferral: 'nefrólogo / nutricionista renal',
      blockedMethods: ['high_protein', 'keto'],
      requiresModification: true,
      modificationSuggestion: 'Proteína 0.8-1.0 g/kg con supervisión. Usar intuitive_eating o mediterranean con ajustes.',
    })
  }

  // IF + hypoglycemia → riesgo
  if (selectedMethod === 'intermittent_fasting' && conditions.includes('hypoglycemia_prone')) {
    alerts.push({
      id: 'if-hypoglycemia',
      severity: 'warning',
      category: 'combination',
      message: 'Ayuno intermitente puede provocar episodios de hipoglucemia.',
      professionalReferral: 'médico / endocrinólogo',
      requiresModification: true,
      modificationSuggestion: 'Ventana alimentaria amplia (14:10) o Around Training con comidas frecuentes.',
    })
  }

  // High protein + gout
  if (selectedMethod === 'high_protein' && conditions.includes('gout')) {
    alerts.push({
      id: 'highprotein-gout',
      severity: 'warning',
      category: 'combination',
      message: 'Alta proteína animal puede elevar ácido úrico y desencadenar gota.',
      professionalReferral: 'reumatólogo / nutricionista',
      requiresModification: true,
      modificationSuggestion: 'Proteína vegetal + pescado. Evitar carnes rojas y embutidos.',
    })
  }

  return alerts
}

// ─── Verificar riesgos por edad ───
export function checkAgeRisks(profile: NutritionUserProfile, selectedMethod: NutritionMethodId): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []
  const age = profile.age

  if (!age) return alerts

  // Adolescentes (<18): no dietas restrictivas
  if (age < 18) {
    const restrictiveMethods = ['keto', 'whole30', 'intermittent_fasting', 'paleo']
    if (restrictiveMethods.includes(selectedMethod)) {
      alerts.push({
        id: `age-adolescent-${selectedMethod}`,
        severity: 'critical',
        category: 'age',
        message: `A los ${age} años, las dietas restrictivas pueden afectar el desarrollo. Se requiere supervisión profesional.`,
        professionalReferral: 'pediatra / nutricionista especializado en adolescentes',
        blockedMethods: restrictiveMethods as NutritionMethodId[],
        requiresModification: true,
        modificationSuggestion: 'Patrón mediterráneo o flexitariano. Sin restricciones numéricas estrictas.',
      })
    }
  }

  // Adultos mayores (>65): precaución con keto, IF
  if (age > 65) {
    if (selectedMethod === 'keto') {
      alerts.push({
        id: 'age-elderly-keto',
        severity: 'warning',
        category: 'age',
        message: 'A los 65+ años, la dieta cetogénica puede causar pérdida muscular y déficits nutricionales.',
        professionalReferral: 'geriatra / nutricionista',
        requiresModification: true,
        modificationSuggestion: 'Mediterranean o DASH con énfasis en proteína suficiente.',
      })
    }
    if (selectedMethod === 'intermittent_fasting') {
      alerts.push({
        id: 'age-elderly-if',
        severity: 'warning',
        category: 'age',
        message: 'El ayuno intermitente en adultos mayores puede contribuir a sarcopenia.',
        professionalReferral: 'geriatra / nutricionista',
        requiresModification: true,
        modificationSuggestion: 'Comidas frecuentes (4-5/día) con proteína distribuida.',
      })
    }
  }

  return alerts
}

// ─── Verificar combinaciones peligrosas entre métodos ───
export function checkDangerousCombinations(
  methods: NutritionMethodId[],
  profile: NutritionUserProfile,
): NutritionSafetyAlert[] {
  const alerts: NutritionSafetyAlert[] = []

  // Keto + carb_cycling → completamente opuestos
  if (methods.includes('keto') && methods.includes('carb_cycling')) {
    alerts.push({
      id: 'combo-keto-carbcycling',
      severity: 'critical',
      category: 'combination',
      message: 'Cetosis estricta + periodización de carbohidratos es una contradicción metabólica. No se pueden combinar.',
      professionalReferral: 'nutricionista deportivo',
      blockedMethods: ['keto'],
    })
  }

  // Whole30 + cualquier otro → Whole30 es protocolo de 30 días, no permanente
  if (methods.includes('whole30') && methods.length > 1) {
    alerts.push({
      id: 'combo-whole30-other',
      severity: 'warning',
      category: 'combination',
      message: 'Whole30 es un protocolo temporal de 30 días. No debe combinarse con otros métodos permanentes durante el protocolo.',
      professionalReferral: 'nutricionista',
      requiresModification: true,
      modificationSuggestion: 'Completar Whole30 primero, luego evaluar patrón permanente.',
    })
  }

  // Keto + vegan → extremadamente restrictivo
  if (methods.includes('keto') && methods.includes('vegan')) {
    alerts.push({
      id: 'combo-keto-vegan',
      severity: 'critical',
      category: 'combination',
      message: 'Ceto vegano es extremadamente restrictivo y riesgoso sin supervisión profesional experta.',
      professionalReferral: 'nutricionista especializado en dietas vegetales',
      blockedMethods: ['keto'],
      requiresModification: true,
      modificationSuggestion: 'Flexitarian + high_protein con fuentes vegetales es más seguro.',
    })
  }

  return alerts
}

// ─── Función principal: verificar todo ───
export function checkNutritionSafety(
  profile: NutritionUserProfile,
  selectedMethod: NutritionMethodId,
  additionalMethods?: NutritionMethodId[],
  qaHistory?: Array<{ key: string; answer: string }>,
): {
  alerts: NutritionSafetyAlert[]
  blockedMethods: NutritionMethodId[]
  requiresProfessional: boolean
  highestSeverity: 'info' | 'warning' | 'critical'
} {
  const allAlerts: NutritionSafetyAlert[] = []

  // 1. Embarazo/lactancia
  allAlerts.push(...checkPregnancy(profile))

  // 2. TCA
  allAlerts.push(...checkTCA(profile, qaHistory))

  // 3. Contraindicaciones médicas
  allAlerts.push(...checkMedicalConditions(profile, selectedMethod))

  // 4. Interacciones método + condición
  allAlerts.push(...checkMethodConditionInteractions(profile, selectedMethod))

  // 5. Riesgos por edad
  allAlerts.push(...checkAgeRisks(profile, selectedMethod))

  // 6. Combinaciones peligrosas
  if (additionalMethods && additionalMethods.length > 0) {
    allAlerts.push(...checkDangerousCombinations([selectedMethod, ...additionalMethods], profile))
  }

  // Deduplicate by id
  const seen = new Set<string>()
  const uniqueAlerts = allAlerts.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })

  // Collect blocked methods
  const blockedSet = new Set<NutritionMethodId>()
  for (const alert of uniqueAlerts) {
    if (alert.blockedMethods) {
      for (const m of alert.blockedMethods) blockedSet.add(m)
    }
  }

  // Determine highest severity
  const severityOrder = { info: 0, warning: 1, critical: 2 }
  let highestSeverity: 'info' | 'warning' | 'critical' = 'info'
  for (const alert of uniqueAlerts) {
    if (severityOrder[alert.severity] > severityOrder[highestSeverity]) {
      highestSeverity = alert.severity
    }
  }

  return {
    alerts: uniqueAlerts,
    blockedMethods: [...blockedSet],
    requiresProfessional: uniqueAlerts.some(a => a.severity === 'critical' || a.professionalReferral),
    highestSeverity,
  }
}
