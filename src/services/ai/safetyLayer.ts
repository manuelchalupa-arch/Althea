// SAFETY LAYER — Detección de alertas y derivación profesional
import type { UserProfile } from '@/types'

export interface SafetyCheck {
  requiresProfessional: boolean
  severity: 'info' | 'warning' | 'critical'
  message: string
  professionalReferral?: string
  blockedActions?: string[]
}

export interface SafetyContext {
  recovery?: { pain: number; fatigue: number; energy: number }
  nutrition?: { calorieIntake: number; proteinIntake: number }
  userProfile?: Partial<UserProfile>
  qaHistory?: Array<{ key: string; answer: string }>
  sessionPain?: number
  painZone?: string
}

export async function check(ctx: SafetyContext): Promise<SafetyCheck> {
  const result: SafetyCheck = {
    requiresProfessional: false,
    severity: 'info',
    message: '',
    blockedActions: [],
  }

  // Dolor alto en sesión actual
  if (ctx.sessionPain != null && ctx.sessionPain >= 7) {
    result.severity = 'critical'
    result.requiresProfessional = true
    result.message = `Dolor alto registrado (${ctx.sessionPain}/10). No recomiendo aumentar carga. Si el dolor persiste, consultá con un profesional.`
    result.professionalReferral = 'fisioterapeuta o médico'
    result.blockedActions = ['increase_weight', 'add_volume', 'add_sets']
  }

  // Dolor recurrente en zona
  if (ctx.recovery && ctx.recovery.pain >= 7) {
    result.severity = result.severity === 'critical' ? 'critical' : 'warning'
    result.requiresProfessional = true
    result.message = `Dolor alto en recuperación (${ctx.recovery.pain}/10). Considerá consultar con un profesional antes de continuar.`
    result.professionalReferral = 'fisioterapeuta o médico'
    result.blockedActions = [...(result.blockedActions || []), 'increase_weight']
  }

  // Pérdida de peso extrema
  if (ctx.userProfile?.weightKg && ctx.nutrition) {
    const tdee = ctx.nutrition.calorieIntake
    if (tdee > 0 && tdee < 1000) {
      result.severity = result.severity === 'critical' ? 'critical' : 'warning'
      result.requiresProfessional = true
      result.message = 'La ingesta calórica registrada es muy baja. Consultá con un nutricionista.'
      result.professionalReferral = 'nutricionista'
    }
  }

  // IMC extremo
  if (ctx.userProfile?.weightKg && ctx.userProfile?.heightCm) {
    const bmi = ctx.userProfile.weightKg / Math.pow(ctx.userProfile.heightCm / 100, 2)
    if (bmi < 16 || bmi > 40) {
      result.severity = 'warning'
      result.requiresProfessional = true
      result.message = `Tu IMC (${bmi.toFixed(1)}) indica una condición que requiere supervisión profesional.`
      result.professionalReferral = 'médico'
    }
  }

  // Fatiga extrema
  if (ctx.recovery && ctx.recovery.fatigue >= 9 && ctx.recovery.energy <= 3) {
    result.severity = result.severity === 'critical' ? 'critical' : 'warning'
    result.message = 'Fatiga muy alta y energía baja. Priorizá el descanso hoy.'
    result.blockedActions = [...(result.blockedActions || []), 'increase_intensity']
  }

  // Derivación desde Q&A
  if (ctx.qaHistory) {
    const concerningPatterns = ['dolor', 'lesión', 'desmayo', 'mareo', 'cardíaco', 'embarazo', 'medicamento']
    for (const qa of ctx.qaHistory) {
      const answer = (qa.answer || '').toLowerCase()
      if (concerningPatterns.some(p => answer.includes(p))) {
        result.severity = 'warning'
        result.requiresProfessional = true
        result.message = 'En base a tu respuesta, recomiendo consultar con un profesional de la salud.'
        result.professionalReferral = 'profesional de la salud'
        break
      }
    }
  }

  if (!result.message) {
    result.message = 'Sin alertas de seguridad. Continuá con normalidad.'
  }

  return result
}
