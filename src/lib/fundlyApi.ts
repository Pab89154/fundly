import type { AppState } from '../types'
import { apiUrl } from './apiBase'

const TOKEN_KEY = 'fundly_session_token'

export type AuthStatus = {
  configured: boolean
  totpConfigured: boolean
  supabaseConfigured: boolean
  unlocked: boolean
  needsTotp: boolean
  ownerEmail: string
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* private mode */
  }
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getSessionToken()
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(apiUrl('/api/auth/status'), {
    credentials: 'include',
    headers: authHeaders(),
  })
  return parseJson(res)
}

export async function loginWithPassword(password: string): Promise<{
  ok: boolean
  needsTotp?: boolean
  error?: string
}> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await parseJson<{
    ok?: boolean
    needsTotp?: boolean
    token?: string
    error?: string
  }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Login failed' }
  if (data.token) setSessionToken(data.token)
  return { ok: true, needsTotp: Boolean(data.needsTotp) }
}

export async function verifyTotpCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/verify-totp'), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code }),
  })
  const data = await parseJson<{ ok?: boolean; token?: string; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Code failed' }
  if (data.token) setSessionToken(data.token)
  return { ok: true }
}

export async function logoutFundly(): Promise<void> {
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
    })
  } finally {
    setSessionToken(null)
  }
}

export async function fetchTotpSetup(): Promise<
  { ok: true; otpauthUrl: string; qrDataUrl: string } | { ok: false; error: string }
> {
  const res = await fetch(apiUrl('/api/auth/totp-setup'), {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{
    ok?: boolean
    otpauthUrl?: string
    qrDataUrl?: string
    error?: string
  }>(res)
  if (!res.ok || !data.qrDataUrl || !data.otpauthUrl) {
    return { ok: false, error: data.error || 'Could not load authenticator setup' }
  }
  return { ok: true, otpauthUrl: data.otpauthUrl, qrDataUrl: data.qrDataUrl }
}

export async function fetchCloudState(): Promise<
  { ok: true; state: AppState; empty: boolean } | { ok: false; error: string }
> {
  const res = await fetch(apiUrl('/api/fundly/state'), {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{ state?: AppState; empty?: boolean; error?: string }>(res)
  if (!res.ok || !data.state) return { ok: false, error: data.error || 'Could not load cloud data' }
  return { ok: true, state: data.state, empty: Boolean(data.empty) }
}

export async function saveCloudState(state: AppState): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(apiUrl('/api/fundly/state'), {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ state }),
  })
  const data = await parseJson<{ ok?: boolean; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not save to cloud' }
  return { ok: true }
}
