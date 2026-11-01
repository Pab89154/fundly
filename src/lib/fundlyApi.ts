import type { AppState } from '../types'

export type AuthStatus = {
  configured: boolean
  totpConfigured: boolean
  supabaseConfigured: boolean
  unlocked: boolean
  needsTotp: boolean
  ownerEmail: string
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'include' })
  return parseJson(res)
}

export async function loginWithPassword(password: string): Promise<{
  ok: boolean
  needsTotp?: boolean
  error?: string
}> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await parseJson<{ ok?: boolean; needsTotp?: boolean; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Login failed' }
  return { ok: true, needsTotp: Boolean(data.needsTotp) }
}

export async function verifyTotpCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/verify-totp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await parseJson<{ ok?: boolean; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Code failed' }
  return { ok: true }
}

export async function logoutFundly(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}

export async function fetchTotpSetup(): Promise<
  { ok: true; otpauthUrl: string; qrDataUrl: string } | { ok: false; error: string }
> {
  const res = await fetch('/api/auth/totp-setup', { credentials: 'include' })
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
  const res = await fetch('/api/fundly/state', { credentials: 'include' })
  const data = await parseJson<{ state?: AppState; empty?: boolean; error?: string }>(res)
  if (!res.ok || !data.state) return { ok: false, error: data.error || 'Could not load cloud data' }
  return { ok: true, state: data.state, empty: Boolean(data.empty) }
}

export async function saveCloudState(state: AppState): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/fundly/state', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  const data = await parseJson<{ ok?: boolean; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not save to cloud' }
  return { ok: true }
}
