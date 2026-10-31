/**
 * Cloudflare Worker: same-origin sync proxy.
 * Secrets (PRINTX_MONEY_TRACKER_API_KEY, etc.) must be Wrangler secrets — never in the SPA.
 */

export interface Env {
  PRINTX_API_BASE?: string
  PRINTX_MONEY_TRACKER_API_KEY?: string
  MONEY_TRACKER_WEBHOOK_HMAC_SECRET?: string
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function verifyHmac(secret: string, raw: ArrayBuffer, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, raw)
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const provided = signature.replace(/^sha256=/, '')
  if (hex.length !== provided.length) return false
  let ok = 0
  for (let i = 0; i < hex.length; i++) ok |= hex.charCodeAt(i) ^ provided.charCodeAt(i)
  return ok === 0
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/printx/status' && request.method === 'GET') {
      return json({
        configured: Boolean(env.PRINTX_MONEY_TRACKER_API_KEY?.trim()),
        base: env.PRINTX_API_BASE || 'https://printx.pw',
      })
    }

    if (url.pathname === '/api/printx/sync' && request.method === 'POST') {
      const apiKey = env.PRINTX_MONEY_TRACKER_API_KEY?.trim()
      const base = (env.PRINTX_API_BASE || 'https://printx.pw').replace(/\/$/, '')
      if (!apiKey) {
        return json(
          {
            error:
              'PrintX sync is not configured. Set PRINTX_MONEY_TRACKER_API_KEY as a Worker secret.',
            configured: false,
          },
          503,
        )
      }
      let since = ''
      try {
        const body = (await request.json()) as { since?: string }
        since = typeof body.since === 'string' ? body.since : ''
      } catch {
        /* empty body ok */
      }
      const qs = since ? `?since=${encodeURIComponent(since)}&limit=200` : '?limit=200'
      const upstream = await fetch(`${base}/api/integrations/money-tracker/events${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      })
      const data = await upstream.json().catch(() => ({ error: 'Invalid upstream JSON' }))
      if (!upstream.ok) {
        return json({ error: 'PrintX feed request failed', status: upstream.status, data, configured: true }, upstream.status)
      }
      return json({ ...(data as object), configured: true })
    }

    if (url.pathname === '/api/printx/webhook' && request.method === 'POST') {
      const raw = await request.arrayBuffer()
      const ok = await verifyHmac(
        env.MONEY_TRACKER_WEBHOOK_HMAC_SECRET || '',
        raw,
        request.headers.get('x-money-tracker-signature'),
      )
      if (!ok) return json({ error: 'Invalid signature' }, 401)
      return json({ ok: true, receivedAt: new Date().toISOString() })
    }

    if (env.ASSETS) return env.ASSETS.fetch(request)
    return new Response('Not found', { status: 404 })
  },
}
