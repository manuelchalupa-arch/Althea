const WGER_BASE = 'https://wger.de/api/v2'

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

async function wgerTokenRequest(username, password) {
  const res = await fetch(`${WGER_BASE}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) return null
  return res.json()
}

async function wgerRefreshRequest(refresh) {
  const res = await fetch(`${WGER_BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) return null
  return res.json()
}

function extractToken(request) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)wger_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function setCookieHeader(token, maxAge) {
  return `wger_token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
}

function clearCookieHeader() {
  return 'wger_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
}

async function proxyToWger(request, path, token) {
  const url = `${WGER_BASE}${path}`
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const contentType = request.headers.get('Content-Type')
  if (contentType) headers.set('Content-Type', contentType)

  const init = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  const upstream = await fetch(url, init)
  const respHeaders = new Headers(upstream.headers)
  respHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  })
}

export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || request.headers.get('Origin') || '*'
    const cors = corsHeaders(origin)
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // ─── WGER Auth Endpoints ───

    if (path === '/api/wger/token' && request.method === 'POST') {
      try {
        const body = await request.json()
        const { username, password } = body
        if (!username || !password) {
          return jsonResponse({ error: 'Username and password required' }, 400, cors)
        }

        const tokenData = await wgerTokenRequest(username, password)
        if (!tokenData?.access) {
          return jsonResponse({ error: 'Invalid credentials' }, 401, cors)
        }

        const headers = { ...cors, 'Set-Cookie': setCookieHeader(tokenData.access, 86400) }
        return jsonResponse({ success: true }, 200, headers)
      } catch {
        return jsonResponse({ error: 'Invalid request' }, 400, cors)
      }
    }

    if (path === '/api/wger/token' && request.method === 'DELETE') {
      const headers = { ...cors, 'Set-Cookie': clearCookieHeader() }
      return jsonResponse({ success: true }, 200, headers)
    }

    if (path === '/api/wger/refresh' && request.method === 'POST') {
      const cookie = request.headers.get('Cookie') || ''
      const refreshMatch = cookie.match(/(?:^|;\s*)wger_refresh=([^;]+)/)
      const refresh = refreshMatch ? decodeURIComponent(refreshMatch[1]) : null

      if (!refresh) {
        return jsonResponse({ error: 'No refresh token' }, 401, cors)
      }

      const tokenData = await wgerRefreshRequest(refresh)
      if (!tokenData?.access) {
        return jsonResponse({ error: 'Refresh failed' }, 401, cors)
      }

      const headers = { ...cors, 'Set-Cookie': setCookieHeader(tokenData.access, 86400) }
      return jsonResponse({ success: true }, 200, headers)
    }

    if (path === '/api/wger/user' && request.method === 'GET') {
      const token = extractToken(request)
      if (!token) {
        return jsonResponse({ error: 'Not authenticated' }, 401, cors)
      }

      const upstream = await fetch(`${WGER_BASE}/user/`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      })

      if (!upstream.ok) {
        return jsonResponse({ error: 'Failed to fetch user' }, upstream.status, cors)
      }

      const data = await upstream.json()
      return jsonResponse(data, 200, cors)
    }

    if (path.startsWith('/api/wger/proxy/') && request.method === 'GET') {
      const token = extractToken(request)
      if (!token) {
        return jsonResponse({ error: 'Not authenticated' }, 401, cors)
      }

      const wgerPath = path.replace('/api/wger/proxy', '')
      const queryString = url.search
      const upstream = await proxyToWger(request, `${wgerPath}${queryString}`, token)

      const respHeaders = new Headers(upstream.headers)
      for (const [k, v] of Object.entries(cors)) {
        respHeaders.set(k, v)
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      })
    }

    // ─── Groq Proxy (existing) ───

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
