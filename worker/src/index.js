export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || request.headers.get('Origin') || '*'
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    const GROQ_API_KEY = env.GROQ_API_KEY
    if (!GROQ_API_KEY) {
      return new Response('GROQ_API_KEY no configurada en el secret del worker.', { status: 500, headers: cors })
    }

    const GROQ_URL = env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions'

    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: request.body,
      redirect: 'follow',
    })

    const headers = new Headers(upstream.headers)
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json')
    for (const [k, v] of Object.entries(cors)) {
      headers.set(k, v)
    }

    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
  },
}