import { canMakeRequest, recordRequest } from './groqUsage'
import { getGroqUrl, getGroqHeaders } from './groqConfig'
import { fetchWithRetry } from '../apiUtils'

const MODEL = 'openai/gpt-oss-20b'

const CHAT_SYSTEM_PROMPT = `Sos Althea, una asistente de fitness y nutrición para usuarios de Argentina y Latinoamérica.

SOLO podés responder sobre estos temas:
- Entrenamiento: ejercicios, rutinas, series, repeticiones, cargas, progresión, técnicas
- Nutrición: comidas, macros, calorías, proteínas, carbohidratos, grasas, hidratación
- Recuperación: descanso, sueño, dolor, fatiga, estiramientos, lesiones
- Progreso: mediciones, peso, rendimiento, constancia
- Bienestar general relacionado con fitness y salud

Si el usuario pregunta algo fuera de estos temas, respondé amablemente que solo podés ayudar con temas de fitness, nutrición y recuperación.

REGLAS:
- Respondé en español de Argentina/Latam, claro y directo.
- Sé concisa: máximo 3-4 oraciones por respuesta a menos que pida detalle.
- Si menciona dolor o lesión, SIEMPRE recomendá consultar a un profesional de salud.
- Usá datos del usuario que tengas en contexto para personalizar respuestas.
- No inventés datos médicos ni nutricionales. Si no sabés, decilo.
- Podés sugerir acciones prácticas: ejercicios, comidas, horarios de descanso.
- Si el usuario quiere un ejercicio, describí la ejecución paso a paso.
- Nunca recomiendes algo peligroso o extremo.
- Si tenés duda, preguntá en vez de asumir.`

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: string) => void
}

export interface StreamOptions {
  /**
   * Bloque de sistema extra (contexto real del usuario + evidencia
   * recuperada). Se suma al prompt base, nunca lo reemplaza.
   */
  systemPrompt?: string
}

function isAvailable(): boolean {
  // Honesto: disponible solo si hay proxy configurado (nunca asumir red/modelo).
  // La clave no puede vivir en frontend; sin proxy se usa el fallback local.
  // Lectura por miembro: evita inlinear el objeto completo de variables VITE_*.
  try {
    return !!import.meta.env.VITE_GROQ_PROXY_URL
  } catch { return false }
}

export async function streamChat(
  messages: ChatCompletionMessage[],
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  if (!isAvailable()) {
    callbacks.onError('API proxy no configurado. Configurá VITE_GROQ_PROXY_URL en .env')
    return
  }

  const limit = canMakeRequest()
  if (!limit.ok) {
    callbacks.onError(limit.reason || 'Límite de uso alcanzado')
    return
  }

  const systemContent = options?.systemPrompt
    ? `${CHAT_SYSTEM_PROMPT}\n\n${options.systemPrompt}`
    : CHAT_SYSTEM_PROMPT
  const systemMsg: ChatCompletionMessage = { role: 'system', content: systemContent }
  const fullMessages = [systemMsg, ...messages]

  try {
    const res = await fetchWithRetry(getGroqUrl(), {
      method: 'POST',
      headers: getGroqHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        max_tokens: 512,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
      }),
    }, { maxRetries: 1 })

    if (!res.ok) {
      const err = await res.text()
      callbacks.onError(`Error ${res.status}: ${err.slice(0, 200)}`)
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      callbacks.onError('No se pudo leer la respuesta')
      return
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {break}

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) {continue}
        const data = trimmed.slice(6)
        if (data === '[DONE]') {continue}

        try {
          const parsed = JSON.parse(data)
          const token = parsed.choices?.[0]?.delta?.content
          if (token) {
            fullText += token
            callbacks.onToken(token)
          }
        } catch { /* skip malformed lines */ }
      }
    }

    callbacks.onDone(fullText)
    recordRequest(fullText.length)
  } catch (e: any) {
    callbacks.onError(e?.message || 'Error de conexión con Groq')
  }
}

export function isChatAvailable(): boolean {
  return isAvailable()
}
