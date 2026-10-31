import type { Connect } from 'vite'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'

type Env = Record<string, string>

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function verifyHmac(secret: string, raw: Buffer, signature: string | undefined): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature.replace(/^sha256=/, ''))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function createSyncMiddleware(env: Env): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return next()

    if (url.startsWith('/api/printx/sync') && req.method === 'POST') {
      const apiKey = env.PRINTX_MONEY_TRACKER_API_KEY?.trim()
      const base = (env.PRINTX_API_BASE || 'https://printx.pw').replace(/\/$/, '')
      if (!apiKey) {
        return json(res, 503, {
          error: 'PrintX sync is not configured. Set PRINTX_MONEY_TRACKER_API_KEY in .env (server only).',
          configured: false,
        })
      }

      let since = ''
      try {
        const raw = await readBody(req)
        if (raw.length) {
          const parsed = JSON.parse(raw.toString('utf8')) as { since?: string }
          since = typeof parsed.since === 'string' ? parsed.since : ''
        }
      } catch {
        return json(res, 400, { error: 'Invalid JSON body' })
      }

      const qs = since ? `?since=${encodeURIComponent(since)}&limit=200` : '?limit=200'
      try {
        const upstream = await fetch(`${base}/api/integrations/money-tracker/events${qs}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        })
        const text = await upstream.text()
        let data: unknown = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = { error: 'Invalid upstream response', raw: text.slice(0, 200) }
        }
        if (!upstream.ok) {
          return json(res, upstream.status, {
            error: 'PrintX feed request failed',
            status: upstream.status,
            data,
            configured: true,
          })
        }
        return json(res, 200, { ...(data as object), configured: true })
      } catch (err) {
        return json(res, 502, {
          error: err instanceof Error ? err.message : 'Upstream fetch failed',
          configured: true,
        })
      }
    }

    if (url.startsWith('/api/printx/status') && req.method === 'GET') {
      return json(res, 200, {
        configured: Boolean(env.PRINTX_MONEY_TRACKER_API_KEY?.trim()),
        base: env.PRINTX_API_BASE || 'https://printx.pw',
      })
    }

    if (url.startsWith('/api/printx/webhook') && req.method === 'POST') {
      const secret = env.MONEY_TRACKER_WEBHOOK_HMAC_SECRET?.trim()
      const raw = await readBody(req)
      const sig = req.headers['x-money-tracker-signature'] as string | undefined
      if (!verifyHmac(secret || '', raw, sig)) {
        return json(res, 401, { error: 'Invalid signature' })
      }
      return json(res, 200, { ok: true, receivedAt: new Date().toISOString() })
    }

    return next()
  }
}
