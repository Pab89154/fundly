/**
 * Cloudflare Worker: PrintX proxy + Fundly auth/state (same routes as Vite middleware).
 * Secrets via Wrangler: FUNDLY_*, SUPABASE_*, PRINTX_*
 */
import * as OTPAuth from 'otpauth'
import { createClient } from '@supabase/supabase-js'

export interface Env {
  PRINTX_API_BASE?: string
  PRINTX_MONEY_TRACKER_API_KEY?: string
  MONEY_TRACKER_WEBHOOK_HMAC_SECRET?: string
  FUNDLY_APP_PASSWORD?: string
  FUNDLY_SESSION_SECRET?: string
  FUNDLY_TOTP_SECRET?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

const OWNER_EMAIL = 'pmolinasamayoa@icloud.com'
const SESSION_COOKIE = 'fundly_session'
const PENDING_COOKIE = 'fundly_pending'

function json(data: unknown, status = 200, cookies?: string | string[]): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (cookies) {
    const list = Array.isArray(cookies) ? cookies : [cookies]
    for (const c of list) headers.append('Set-Cookie', c)
  }
  return new Response(JSON.stringify(data), { status, headers })
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, decodeURIComponent(rest.join('=') || '')]
    }),
  )
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function cookieOpts(maxAge?: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure']
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`)
  return parts.join('; ')
}

const CENTRAL_TZ = 'America/Chicago'

function centralDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CENTRAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function secondsUntilCentralMidnight(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second')
  return Math.max(60, 86400 - elapsed)
}

async function token(env: Env, kind: 'full' | 'pending'): Promise<string> {
  const password = (env.FUNDLY_APP_PASSWORD || '').trim()
  const secret = (env.FUNDLY_SESSION_SECRET || '').trim() || password
  return sha256Hex(`fundly:${kind}:${secret}:${password}:${centralDateKey()}`)
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

function sb(env: Env) {
  const url = env.SUPABASE_URL?.trim()
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const cookieHeader = request.headers.get('cookie')
    const cookies = parseCookies(cookieHeader)
    const password = (env.FUNDLY_APP_PASSWORD || '').trim()
    const totpSecret = (env.FUNDLY_TOTP_SECRET || '').trim().replace(/\s+/g, '')
    const fullTok = password ? await token(env, 'full') : ''
    const pendingTok = password ? await token(env, 'pending') : ''
    const unlocked = Boolean(fullTok && cookies[SESSION_COOKIE] && safeEqual(cookies[SESSION_COOKIE]!, fullTok))
    const pending = Boolean(
      pendingTok && cookies[PENDING_COOKIE] && safeEqual(cookies[PENDING_COOKIE]!, pendingTok),
    )

    if (path === '/api/auth/status' && request.method === 'GET') {
      return json({
        configured: Boolean(password),
        totpConfigured: totpSecret.length >= 16,
        supabaseConfigured: Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
        unlocked,
        needsTotp: pending && !unlocked,
        ownerEmail: OWNER_EMAIL,
      })
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      if (!password) return json({ error: 'FUNDLY_APP_PASSWORD is not set' }, 503)
      const body = (await request.json().catch(() => ({}))) as { password?: string }
      if (!safeEqual(String(body.password || ''), password)) return json({ error: 'Wrong password' }, 401)
      const dayMax = secondsUntilCentralMidnight()
      if (totpSecret.length >= 16) {
        return json({ ok: true, needsTotp: true }, 200, `${PENDING_COOKIE}=${pendingTok}; ${cookieOpts(900)}`)
      }
      return json({ ok: true, needsTotp: false }, 200, [
        `${SESSION_COOKIE}=${fullTok}; ${cookieOpts(dayMax)}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/verify-totp' && request.method === 'POST') {
      if (!pending && !unlocked) return json({ error: 'Enter your password first' }, 401)
      if (totpSecret.length < 16) return json({ error: 'Authenticator is not set up yet' }, 400)
      const body = (await request.json().catch(() => ({}))) as { code?: string }
      const cleaned = String(body.code || '').replace(/\s+/g, '')
      const totp = new OTPAuth.TOTP({
        issuer: 'Fundly',
        label: OWNER_EMAIL,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(totpSecret),
      })
      if (totp.validate({ token: cleaned, window: 1 }) === null) {
        return json({ error: 'Wrong authenticator code' }, 401)
      }
      return json({ ok: true }, 200, [
        `${SESSION_COOKIE}=${fullTok}; ${cookieOpts(secondsUntilCentralMidnight())}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      return json({ ok: true }, 200, [
        `${SESSION_COOKIE}=; ${cookieOpts(0)}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/totp-setup' && request.method === 'GET') {
      if (!pending && !unlocked) return json({ error: 'Unlock with your password first' }, 401)
      if (totpSecret.length < 16) return json({ error: 'FUNDLY_TOTP_SECRET is not set' }, 400)
      const totp = new OTPAuth.TOTP({
        issuer: 'Fundly',
        label: OWNER_EMAIL,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(totpSecret),
      })
      return json({ ok: true, otpauthUrl: totp.toString(), qrDataUrl: null })
    }

    if (path === '/api/fundly/state' && request.method === 'GET') {
      if (!unlocked) return json({ error: 'Locked' }, 401)
      const client = sb(env)
      if (!client) return json({ error: 'Supabase is not configured' }, 500)
      const { data, error } = await client
        .from('fundly_app_state')
        .select('state')
        .eq('owner_email', OWNER_EMAIL)
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data?.state) return json({ state: { version: 1, settings: {}, transactions: [] }, empty: true })
      return json({ state: data.state, empty: false })
    }

    if (path === '/api/fundly/state' && request.method === 'PUT') {
      if (!unlocked) return json({ error: 'Locked' }, 401)
      const client = sb(env)
      if (!client) return json({ error: 'Supabase is not configured' }, 500)
      const body = (await request.json().catch(() => ({}))) as { state?: unknown }
      const { error } = await client.from('fundly_app_state').upsert(
        {
          owner_email: OWNER_EMAIL,
          state: body.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_email' },
      )
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (path === '/api/printx/status' && request.method === 'GET') {
      return json({
        configured: Boolean(env.PRINTX_MONEY_TRACKER_API_KEY?.trim()),
        base: env.PRINTX_API_BASE || 'https://printx.pw',
      })
    }

    if (path === '/api/printx/sync' && request.method === 'POST') {
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

    if (path === '/api/printx/webhook' && request.method === 'POST') {
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
