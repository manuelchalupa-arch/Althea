export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const origin = request.headers.get('Origin')
    const allowed = env.ALLOWED_ORIGIN || '*'
    if (allowed !== '*' && origin !== allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    }

    const body = await request.json()

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await groqRes.text()

    return new Response(data, {
      status: groqRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowed,
      },
    })
  },
}
