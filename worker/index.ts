/**
 * Cloudflare Worker: PrintX proxy + Fundly auth/state (same routes as Vite middleware).
 * Secrets via Wrangler: FUNDLY_*, SUPABASE_*, PRINTX_*
 * Cron: applies due allowance/subscriptions using settings.timezone.
 */
import * as OTPAuth from 'otpauth'
import { createClient } from '@supabase/supabase-js'
import { applyDueRecurring } from '../src/lib/recurring'
import { runFundlyAiChat, type CoachChatMessage } from '../src/lib/geminiChat'
import {
  appendCoachMessages,
  createCoachChat,
  deleteCoachChat,
  listCoachChats,
  listCoachMessages,
  renameCoachChat,
} from '../src/lib/coachCloud'
import type { AppState } from '../src/types'

export interface Env {
  PRINTX_API_BASE?: string
  PRINTX_MONEY_TRACKER_API_KEY?: string
  MONEY_TRACKER_WEBHOOK_HMAC_SECRET?: string
  FUNDLY_APP_PASSWORD?: string
  FUNDLY_SESSION_SECRET?: string
  FUNDLY_TOTP_SECRET?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  /** Google Gemini API key for Fundly Coach (never expose to client). */
  GEMINI_API_KEY?: string
  /** Optional Web Push VAPID keys (PEM or base64url). Without them, cron still applies money. */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

const OWNER_EMAIL = 'pmolinasamayoa@icloud.com'
const SESSION_COOKIE = 'fundly_session'
const PENDING_COOKIE = 'fundly_pending'

const ALLOWED_ORIGINS = new Set([
  'https://pab89154.github.io',
  'http://localhost:7687',
  'http://127.0.0.1:7687',
])

function corsOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  return null
}

function applyCors(headers: Headers, request: Request): void {
  const origin = corsOrigin(request)
  if (!origin) return
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Credentials', 'true')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Vary', 'Origin')
}

function json(data: unknown, status = 200, cookies?: string | string[], request?: Request): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (request) applyCors(headers, request)
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

/** SameSite=None so GitHub Pages (cross-site) can use credentialed fetch. */
function cookieOpts(maxAge?: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=None', 'Secure']
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

async function loadOwnerState(env: Env): Promise<AppState | null> {
  const client = sb(env)
  if (!client) return null
  const { data, error } = await client
    .from('fundly_app_state')
    .select('state')
    .eq('owner_email', OWNER_EMAIL)
    .maybeSingle()
  if (error || !data?.state) return null
  return data.state as AppState
}

async function saveOwnerState(env: Env, state: AppState): Promise<boolean> {
  const client = sb(env)
  if (!client) return false
  const { error } = await client.from('fundly_app_state').upsert(
    {
      owner_email: OWNER_EMAIL,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_email' },
  )
  return !error
}

/** Best-effort Web Push (requires VAPID secrets). Silent no-op if unset. */
async function sendWebPush(
  env: Env,
  subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } } | null,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!subscription?.endpoint) return
  if (!env.VAPID_PUBLIC_KEY?.trim() || !env.VAPID_PRIVATE_KEY?.trim()) return
  // Full VAPID signing needs a crypto helper; store intent on the payload for clients
  // that poll. Prefer client catch-up notifications when VAPID isn’t configured.
  try {
    await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        TTL: '86400',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    /* ignore push failures — money already applied */
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const state = await loadOwnerState(env)
        if (!state?.settings) return
        const { state: next, events } = applyDueRecurring(state)
        if (events.length === 0) return
        await saveOwnerState(env, next)
        const sub = next.settings.pushSubscription
        const pagesBase = 'https://pab89154.github.io/fundly'
        for (const ev of events) {
          if (ev.kind === 'allowance' && next.settings.reminders?.notifyAllowance) {
            await sendWebPush(env, sub, {
              title: 'Allowance added',
              body: `+$${(ev.amountCents / 100).toFixed(2)} split into your pots.`,
              url: `${pagesBase}/`,
            })
          }
          if (ev.kind === 'subscription_skip' && next.settings.reminders?.notifySubscriptionFail) {
            const pot =
              ev.fromAccount === 'iphone'
                ? 'Goal'
                : ev.fromAccount === 'extra'
                  ? 'Extra'
                  : ev.fromAccount === 'charity'
                    ? 'Charity'
                    : 'Spending'
            await sendWebPush(env, sub, {
              title: `${ev.name} can’t pay from ${pot}`,
              body: `Not enough in ${pot}. Open Fundly to pick another pot or combine with a second pot.`,
              url: `${pagesBase}/#/recurring`,
            })
          }
          if (ev.kind === 'weekly_review' && next.settings.reminders?.notifyWeeklyReview) {
            await sendWebPush(env, sub, {
              title: 'See this week!',
              body: 'Open Fundly to see how you did.',
              url: `${pagesBase}/#this-week`,
            })
          }
        }
      })(),
    )
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      const headers = new Headers()
      applyCors(headers, request)
      headers.set('Access-Control-Max-Age', '86400')
      return new Response(null, { status: 204, headers })
    }

    const cookieHeader = request.headers.get('cookie')
    const cookies = parseCookies(cookieHeader)
    const authHeader = request.headers.get('Authorization') || ''
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() || ''
    const password = (env.FUNDLY_APP_PASSWORD || '').trim()
    const totpSecret = (env.FUNDLY_TOTP_SECRET || '').trim().replace(/\s+/g, '')
    const fullTok = password ? await token(env, 'full') : ''
    const pendingTok = password ? await token(env, 'pending') : ''
    // Bearer tokens (localStorage) — cookies alone fail cross-site (GitHub Pages → Worker).
    const unlocked = Boolean(
      fullTok &&
        ((cookies[SESSION_COOKIE] && safeEqual(cookies[SESSION_COOKIE]!, fullTok)) ||
          (bearer && safeEqual(bearer, fullTok))),
    )
    const pending = Boolean(
      pendingTok &&
        ((cookies[PENDING_COOKIE] && safeEqual(cookies[PENDING_COOKIE]!, pendingTok)) ||
          (bearer && safeEqual(bearer, pendingTok))),
    )
    const j = (data: unknown, status = 200, cookie?: string | string[]) =>
      json(data, status, cookie, request)

    if (path === '/api/auth/status' && request.method === 'GET') {
      return j({
        configured: Boolean(password),
        totpConfigured: totpSecret.length >= 16,
        supabaseConfigured: Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
        unlocked,
        needsTotp: pending && !unlocked,
        ownerEmail: OWNER_EMAIL,
      })
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      if (!password) return j({ error: 'FUNDLY_APP_PASSWORD is not set' }, 503)
      const body = (await request.json().catch(() => ({}))) as { password?: string; code?: string }
      if (!safeEqual(String(body.password || ''), password)) return j({ error: 'Wrong password' }, 401)
      const dayMax = secondsUntilCentralMidnight()
      if (totpSecret.length >= 16) {
        const cleaned = String(body.code || '').replace(/\s+/g, '')
        if (!/^\d{6}$/.test(cleaned)) {
          return j({ error: 'Enter your 6-digit authenticator code', needsTotp: true }, 400)
        }
        const totp = new OTPAuth.TOTP({
          issuer: 'Fundly',
          label: OWNER_EMAIL,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(totpSecret),
        })
        if (totp.validate({ token: cleaned, window: 1 }) === null) {
          return j({ error: 'Wrong authenticator code' }, 401)
        }
        return j({ ok: true, needsTotp: false, token: fullTok, kind: 'full' }, 200, [
          `${SESSION_COOKIE}=${fullTok}; ${cookieOpts(dayMax)}`,
          `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
        ])
      }
      return j({ ok: true, needsTotp: false, token: fullTok, kind: 'full' }, 200, [
        `${SESSION_COOKIE}=${fullTok}; ${cookieOpts(dayMax)}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/verify-totp' && request.method === 'POST') {
      if (!pending && !unlocked) return j({ error: 'Enter your password first' }, 401)
      if (totpSecret.length < 16) return j({ error: 'Authenticator is not set up yet' }, 400)
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
        return j({ error: 'Wrong authenticator code' }, 401)
      }
      return j({ ok: true, token: fullTok, kind: 'full' }, 200, [
        `${SESSION_COOKIE}=${fullTok}; ${cookieOpts(secondsUntilCentralMidnight())}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      return j({ ok: true }, 200, [
        `${SESSION_COOKIE}=; ${cookieOpts(0)}`,
        `${PENDING_COOKIE}=; ${cookieOpts(0)}`,
      ])
    }

    if (path === '/api/auth/totp-setup' && request.method === 'GET') {
      if (!pending && !unlocked) return j({ error: 'Unlock with your password first' }, 401)
      if (totpSecret.length < 16) return j({ error: 'FUNDLY_TOTP_SECRET is not set' }, 400)
      const totp = new OTPAuth.TOTP({
        issuer: 'Fundly',
        label: OWNER_EMAIL,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(totpSecret),
      })
      return j({ ok: true, otpauthUrl: totp.toString(), qrDataUrl: null })
    }

    if (path === '/api/fundly/state' && request.method === 'GET') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const client = sb(env)
      if (!client) return j({ error: 'Supabase is not configured' }, 500)
      const { data, error } = await client
        .from('fundly_app_state')
        .select('state')
        .eq('owner_email', OWNER_EMAIL)
        .maybeSingle()
      if (error) return j({ error: error.message }, 500)
      if (!data?.state) return j({ state: { version: 1, settings: {}, transactions: [] }, empty: true })
      return j({ state: data.state, empty: false })
    }

    if (path === '/api/fundly/state' && request.method === 'PUT') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const client = sb(env)
      if (!client) return j({ error: 'Supabase is not configured' }, 500)
      const body = (await request.json().catch(() => ({}))) as { state?: unknown }
      const { error } = await client.from('fundly_app_state').upsert(
        {
          owner_email: OWNER_EMAIL,
          state: body.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_email' },
      )
      if (error) return j({ error: error.message }, 500)
      return j({ ok: true })
    }

    if (path === '/api/ai/status' && request.method === 'GET') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      return j({ configured: Boolean(env.GEMINI_API_KEY?.trim()) })
    }

    if (path === '/api/ai/chats' && request.method === 'GET') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const result = await listCoachChats(env)
      if (!result.ok) return j({ error: result.error }, 500)
      return j({ chats: result.chats })
    }

    if (path === '/api/ai/chats' && request.method === 'POST') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const body = (await request.json().catch(() => ({}))) as { title?: string }
      const result = await createCoachChat(env, body.title)
      if (!result.ok) return j({ error: result.error }, 500)
      return j({ chat: result.chat })
    }

    const chatMatch = path.match(/^\/api\/ai\/chats\/([^/]+)(?:\/(messages))?$/)
    if (chatMatch) {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const chatId = decodeURIComponent(chatMatch[1] || '')
      const isMessages = chatMatch[2] === 'messages'

      if (isMessages && request.method === 'GET') {
        const result = await listCoachMessages(env, chatId)
        if (!result.ok) return j({ error: result.error }, result.error === 'Chat not found' ? 404 : 500)
        return j({ messages: result.messages })
      }

      if (isMessages && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { messages?: unknown[] }
        const raw = Array.isArray(body.messages) ? body.messages : []
        const messages = raw
          .map((m) => {
            if (!m || typeof m !== 'object') return null
            const o = m as Record<string, unknown>
            const role = o.role === 'assistant' ? 'assistant' : o.role === 'user' ? 'user' : null
            const content = typeof o.content === 'string' ? o.content : ''
            if (!role || !content.trim()) return null
            return {
              role: role as 'user' | 'assistant',
              content,
              pendingAction: o.pendingAction ?? null,
            }
          })
          .filter(Boolean) as Array<{
          role: 'user' | 'assistant'
          content: string
          pendingAction?: unknown | null
        }>
        const result = await appendCoachMessages(env, chatId, messages)
        if (!result.ok) return j({ error: result.error }, result.error === 'Chat not found' ? 404 : 500)
        return j({ ok: true, title: result.title })
      }

      if (!isMessages && request.method === 'PATCH') {
        const body = (await request.json().catch(() => ({}))) as { title?: string }
        if (typeof body.title !== 'string') return j({ error: 'title required' }, 400)
        const result = await renameCoachChat(env, chatId, body.title)
        if (!result.ok) return j({ error: result.error }, result.error === 'Chat not found' ? 404 : 500)
        return j({ ok: true })
      }

      if (!isMessages && request.method === 'DELETE') {
        const result = await deleteCoachChat(env, chatId)
        if (!result.ok) return j({ error: result.error }, result.error === 'Chat not found' ? 404 : 500)
        return j({ ok: true })
      }
    }

    if (path === '/api/ai/chat' && request.method === 'POST') {
      if (!unlocked) return j({ error: 'Locked' }, 401)
      const body = (await request.json().catch(() => ({}))) as {
        messages?: CoachChatMessage[]
        snapshot?: unknown
      }
      const messages = Array.isArray(body.messages) ? body.messages : []
      const result = await runFundlyAiChat({
        apiKey: env.GEMINI_API_KEY || '',
        messages,
        snapshot: body.snapshot ?? {},
      })
      if (!result.ok) return j({ error: result.error }, result.status || 502)
      return j({
        ok: true,
        reply: result.reply,
        pendingAction: result.pendingAction,
        configured: true,
      })
    }

    if (path === '/api/printx/status' && request.method === 'GET') {
      return j({
        configured: Boolean(env.PRINTX_MONEY_TRACKER_API_KEY?.trim()),
        base: env.PRINTX_API_BASE || 'https://printx.pw',
      })
    }

    if (path === '/api/printx/sync' && request.method === 'POST') {
      const apiKey = env.PRINTX_MONEY_TRACKER_API_KEY?.trim()
      const base = (env.PRINTX_API_BASE || 'https://printx.pw').replace(/\/$/, '')
      if (!apiKey) {
        return j(
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
        return j(
          { error: 'PrintX feed request failed', status: upstream.status, data, configured: true },
          upstream.status,
        )
      }
      return j({ ...(data as object), configured: true })
    }

    if (path === '/api/printx/webhook' && request.method === 'POST') {
      const raw = await request.arrayBuffer()
      const ok = await verifyHmac(
        env.MONEY_TRACKER_WEBHOOK_HMAC_SECRET || '',
        raw,
        request.headers.get('x-money-tracker-signature'),
      )
      if (!ok) return j({ error: 'Invalid signature' }, 401)
      return j({ ok: true, receivedAt: new Date().toISOString() })
    }

    if (env.ASSETS) return env.ASSETS.fetch(request)
    const notFound = new Response('Not found', { status: 404 })
    return notFound
  },
}
