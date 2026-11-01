import { createHash, timingSafeEqual } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

export const OWNER_EMAIL = 'pmolinasamayoa@icloud.com'
export const SESSION_COOKIE = 'fundly_session'
export const PENDING_COOKIE = 'fundly_pending'
const CENTRAL_TZ = 'America/Chicago'

export type FundlyEnv = Record<string, string | undefined>

function getPassword(env: FundlyEnv): string {
  return (env.FUNDLY_APP_PASSWORD ?? '').trim()
}

function getSessionSecret(env: FundlyEnv): string {
  return (env.FUNDLY_SESSION_SECRET ?? '').trim() || getPassword(env)
}

export function getTotpSecret(env: FundlyEnv): string {
  return (env.FUNDLY_TOTP_SECRET ?? '').trim().replace(/\s+/g, '')
}

export function authConfigured(env: FundlyEnv): boolean {
  return Boolean(getPassword(env))
}

export function totpConfigured(env: FundlyEnv): boolean {
  return getTotpSecret(env).length >= 16
}

/** Calendar day in Central time — session dies at midnight so you sign in once per day. */
export function centralDateKey(date = new Date()): string {
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

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, decodeURIComponent(rest.join('=') || '')]
    }),
  )
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function token(env: FundlyEnv, kind: 'full' | 'pending', day = centralDateKey()): string {
  const password = getPassword(env)
  const secret = getSessionSecret(env)
  return createHash('sha256').update(`fundly:${kind}:${secret}:${password}:${day}`).digest('hex')
}

export function cookieOptions(maxAgeSeconds?: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Strict']
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  if (typeof maxAgeSeconds === 'number') parts.push(`Max-Age=${maxAgeSeconds}`)
  return parts.join('; ')
}

export function sessionCookieHeader(env: FundlyEnv): string {
  return `${SESSION_COOKIE}=${token(env, 'full')}; ${cookieOptions(secondsUntilCentralMidnight())}`
}

export function pendingCookieHeader(env: FundlyEnv): string {
  return `${PENDING_COOKIE}=${token(env, 'pending')}; ${cookieOptions(60 * 15)}`
}

export function clearAuthCookies(): string[] {
  return [
    `${SESSION_COOKIE}=; ${cookieOptions(0)}`,
    `${PENDING_COOKIE}=; ${cookieOptions(0)}`,
  ]
}

export function hasFullSession(env: FundlyEnv, cookieHeader: string | undefined): boolean {
  if (!authConfigured(env)) return false
  const value = parseCookies(cookieHeader)[SESSION_COOKIE]
  return Boolean(value && safeEqual(value, token(env, 'full')))
}

export function hasPendingSession(env: FundlyEnv, cookieHeader: string | undefined): boolean {
  if (!authConfigured(env)) return false
  const value = parseCookies(cookieHeader)[PENDING_COOKIE]
  return Boolean(value && safeEqual(value, token(env, 'pending')))
}

export function verifyPassword(env: FundlyEnv, provided: string): boolean {
  const expected = getPassword(env)
  if (!expected) return false
  return safeEqual(provided, expected)
}

export function verifyTotp(env: FundlyEnv, code: string): boolean {
  const secret = getTotpSecret(env)
  if (!secret) return false
  const cleaned = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const totp = new OTPAuth.TOTP({
    issuer: 'Fundly',
    label: OWNER_EMAIL,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
  const delta = totp.validate({ token: cleaned, window: 1 })
  return delta !== null
}

export async function buildTotpSetup(env: FundlyEnv): Promise<
  { ok: true; otpauthUrl: string; qrDataUrl: string } | { ok: false; error: string }
> {
  const secret = getTotpSecret(env)
  if (!secret) return { ok: false, error: 'FUNDLY_TOTP_SECRET is not set.' }
  const totp = new OTPAuth.TOTP({
    issuer: 'Fundly',
    label: OWNER_EMAIL,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
  const otpauthUrl = totp.toString()
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 })
  return { ok: true, otpauthUrl, qrDataUrl }
}
