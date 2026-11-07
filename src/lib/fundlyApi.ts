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

export async function loginWithPassword(
  password: string,
  code?: string,
): Promise<{
  ok: boolean
  needsTotp?: boolean
  error?: string
}> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password,
      ...(code != null && code !== '' ? { code } : {}),
    }),
  })
  const data = await parseJson<{
    ok?: boolean
    needsTotp?: boolean
    token?: string
    error?: string
  }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Login failed' }
  if (data.token) setSessionToken(data.token)
  // needsTotp without a full token means incomplete unlock (legacy two-step)
  if (data.needsTotp && data.token && !code) {
    return { ok: false, needsTotp: true, error: 'Enter your authenticator code' }
  }
  if (data.needsTotp && !data.token) {
    return { ok: false, needsTotp: true, error: data.error || 'Enter your authenticator code' }
  }
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

export type PrintxSyncResult = {
  configured: boolean
  events: import('../types').PrintxFeedEvent[]
  openOwedUsd?: number
}

/** Pull PrintX settlements + open owed (requires unlocked session). */
export async function fetchAiCoachStatus(): Promise<
  { ok: true; configured: boolean } | { ok: false; error: string }
> {
  const res = await fetch(apiUrl('/api/ai/status'), {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{ configured?: boolean; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not check Coach' }
  return { ok: true, configured: Boolean(data.configured) }
}

export async function postAiCoachChat(input: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  snapshot: unknown
  needsTitle?: boolean
}): Promise<
  | {
      ok: true
      reply: string
      pendingAction: import('./geminiChat').PendingAction | null
      chatTitle: string | null
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(apiUrl('/api/ai/chat'), {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(18_000),
    })
    const data = await parseJson<{
      ok?: boolean
      reply?: string
      pendingAction?: import('./geminiChat').PendingAction | null
      chatTitle?: string | null
      error?: string
    }>(res)
    if (!res.ok) return { ok: false, error: data.error || `Coach failed (${res.status})` }
    return {
      ok: true,
      reply: String(data.reply || ''),
      pendingAction: data.pendingAction ?? null,
      chatTitle: data.chatTitle ? String(data.chatTitle) : null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Coach failed'
    if (/abort|timeout/i.test(msg)) {
      return { ok: false, error: 'Coach is busy right now. Wait a few seconds and try again.' }
    }
    return { ok: false, error: msg }
  }
}

export type CoachChatSummary = {
  id: string
  title: string
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

export type CoachStoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingAction: import('./geminiChat').PendingAction | null
  seq: number
  createdAt: string
}

export async function fetchCoachChats(): Promise<
  { ok: true; chats: CoachChatSummary[] } | { ok: false; error: string }
> {
  const res = await fetch(apiUrl('/api/ai/chats'), {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{ chats?: CoachChatSummary[]; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not load chats' }
  return { ok: true, chats: Array.isArray(data.chats) ? data.chats : [] }
}

export async function createCoachChat(title?: string): Promise<
  { ok: true; chat: CoachChatSummary } | { ok: false; error: string }
> {
  const res = await fetch(apiUrl('/api/ai/chats'), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  const data = await parseJson<{ chat?: CoachChatSummary; error?: string }>(res)
  if (!res.ok || !data.chat) return { ok: false, error: data.error || 'Could not create chat' }
  return { ok: true, chat: data.chat }
}

export async function fetchCoachMessages(
  chatId: string,
): Promise<{ ok: true; messages: CoachStoredMessage[] } | { ok: false; error: string }> {
  const res = await fetch(apiUrl(`/api/ai/chats/${encodeURIComponent(chatId)}/messages`), {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{ messages?: CoachStoredMessage[]; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not load messages' }
  return {
    ok: true,
    messages: Array.isArray(data.messages)
      ? data.messages.map((m) => ({
          ...m,
          pendingAction: (m.pendingAction as import('./geminiChat').PendingAction | null) ?? null,
        }))
      : [],
  }
}

export async function appendCoachMessages(
  chatId: string,
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    pendingAction?: import('./geminiChat').PendingAction | null
  }>,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const res = await fetch(apiUrl(`/api/ai/chats/${encodeURIComponent(chatId)}/messages`), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messages }),
  })
  const data = await parseJson<{ ok?: boolean; title?: string; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not save messages' }
  return { ok: true, title: String(data.title || 'New chat') }
}

export async function deleteCoachChat(
  chatId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(apiUrl(`/api/ai/chats/${encodeURIComponent(chatId)}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await parseJson<{ error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not delete chat' }
  return { ok: true }
}

export async function renameCoachChatApi(
  chatId: string,
  title: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const res = await fetch(apiUrl(`/api/ai/chats/${encodeURIComponent(chatId)}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  const data = await parseJson<{ title?: string; error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not rename chat' }
  return { ok: true, title: String(data.title || title).trim() || 'New chat' }
}

export async function reorderCoachChatsApi(
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(apiUrl('/api/ai/chats/reorder'), {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids }),
  })
  const data = await parseJson<{ error?: string }>(res)
  if (!res.ok) return { ok: false, error: data.error || 'Could not reorder chats' }
  return { ok: true }
}

export async function fetchPrintxSync(): Promise<
  { ok: true; data: PrintxSyncResult } | { ok: false; error: string; configured?: boolean }
> {
  const res = await fetch(apiUrl('/api/printx/sync'), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })
  const data = await parseJson<{
    error?: string
    configured?: boolean
    events?: import('../types').PrintxFeedEvent[]
    openOwedUsd?: number
  }>(res)
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Sync failed (${res.status})`,
      configured: data.configured,
    }
  }
  return {
    ok: true,
    data: {
      configured: data.configured !== false,
      events: Array.isArray(data.events) ? data.events : [],
      openOwedUsd: typeof data.openOwedUsd === 'number' ? data.openOwedUsd : undefined,
    },
  }
}
