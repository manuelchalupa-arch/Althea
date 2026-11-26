import { canMakeRequest, recordRequest } from './groqUsage'
import { getProxyUrl, getGroqHeaders } from './groqConfig'
import { aiLimitMessage, getAiAuthHeaders, hasAiSession, limitError } from './aiAuth'
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
  try {
    return getProxyUrl().trim().length > 0
  } catch {
    return false
  }
}

export async function streamChat(
  messages: ChatCompletionMessage[],
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  if (!isAvailable()) {
    callbacks.onError(limitError('El servicio de IA no está configurado.'))
    return
  }

  if (!hasAiSession()) {
    callbacks.onError(limitError('Iniciá sesión en Althea para usar el Coach.'))
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
    const res = await fetchWithRetry(getProxyUrl(), {
      method: 'POST',
      headers: { ...getGroqHeaders(), ...(await getAiAuthHeaders()) },
      body: JSON.stringify({
        task: 'chat',
        messages: fullMessages,
        // Parámetros legacy: el Worker los ignora y fija los reales.
        model: MODEL,
        max_tokens: 512,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
      }),
    }, { maxRetries: 1 })

    if (!res.ok) {
      let code: string | undefined
      try {
        code = (await res.clone().json())?.error
      } catch { /* cuerpo no JSON: se usa el status */ }
      callbacks.onError(aiLimitMessage(res.status, code) || `Error ${res.status}. Probá de nuevo.`)
      return
    }

    // Algunos proxies devuelven la respuesta completa como JSON en vez de SSE.
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null)
      const content: string = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? ''
      if (!content.trim()) {
        callbacks.onError('El Coach no devolvió respuesta. Probá de nuevo.')
        return
      }
      callbacks.onToken(content)
      await callbacks.onDone(content)
      recordRequest(content.length)
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

    const consume = (line: string) => {
      const trimmed = line.trim()
      // SSE: acepta "data: {...}" y "data:{...}" (el espacio no es obligatorio).
      if (!trimmed.startsWith('data:')) {return}
      const data = trimmed.slice(5).trimStart()
      if (!data || data === '[DONE]') {return}
      try {
        const parsed = JSON.parse(data)
        const token = parsed.choices?.[0]?.delta?.content
        if (token) {
          fullText += token
          callbacks.onToken(token)
        }
      } catch { /* línea malformada: se ignora */ }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {break}

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) { consume(line) }
    }
    // Última línea sin salto final.
    if (buffer) { consume(buffer) }

    if (!fullText.trim()) {
      callbacks.onError('El Coach no devolvió respuesta. Probá de nuevo.')
      return
    }

    await callbacks.onDone(fullText)
    recordRequest(fullText.trim().length)
  } catch (e: any) {
    callbacks.onError(e?.message || 'Error de conexión con el servicio de IA')
  }
}

export function isChatAvailable(): boolean {
  return isAvailable()
}
