import type { Connect } from 'vite'
import type { ServerResponse } from 'node:http'
import {
  OWNER_EMAIL,
  authConfigured,
  buildTotpSetup,
  clearAuthCookies,
  hasFullSession,
  hasPendingSession,
  sessionCookieHeader,
  sessionToken,
  totpConfigured,
  verifyPassword,
  verifyTotp,
  type FundlyEnv,
} from './fundlyAuth.ts'
import { loadAppState, normalizeState, saveAppState } from './fundlyStore.ts'
import {
  appendCoachMessages,
  createCoachChat,
  deleteCoachChat,
  listCoachChats,
  listCoachMessages,
  renameCoachChat,
  reorderCoachChats,
} from '../src/lib/coachCloud.ts'
import { runFundlyAiChat, type CoachChatMessage } from '../src/lib/geminiChat.ts'

function json(res: ServerResponse, status: number, body: unknown, cookies?: string | string[]) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  if (cookies) {
    const list = Array.isArray(cookies) ? cookies : [cookies]
    res.setHeader('Set-Cookie', list)
  }
  res.end(JSON.stringify(body))
}

async function readJson(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

/**
 * Handle Fundly auth + cloud state routes. Returns true if handled.
 */
export async function handleFundlyApi(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  env: FundlyEnv,
): Promise<boolean> {
  const url = req.url ?? ''
  const path = url.split('?')[0] ?? ''
  const cookie = req.headers.cookie
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const method = req.method ?? 'GET'

  if (path === '/api/auth/status' && method === 'GET') {
    const unlocked = hasFullSession(env, cookie, authorization)
    json(res, 200, {
      configured: authConfigured(env),
      totpConfigured: totpConfigured(env),
      supabaseConfigured: Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      unlocked,
      needsTotp: hasPendingSession(env, cookie, authorization) && !unlocked,
      ownerEmail: OWNER_EMAIL,
    })
    return true
  }

  if (path === '/api/auth/login' && method === 'POST') {
    if (!authConfigured(env)) {
      json(res, 503, { error: 'FUNDLY_APP_PASSWORD is not set in .env' })
      return true
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const password = typeof body.password === 'string' ? body.password : ''
    const code = typeof body.code === 'string' ? body.code : ''
    if (!verifyPassword(env, password)) {
      json(res, 401, { error: 'Wrong password' })
      return true
    }
    if (totpConfigured(env)) {
      if (!/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
        json(res, 400, { error: 'Enter your 6-digit authenticator code', needsTotp: true })
        return true
      }
      if (!verifyTotp(env, code)) {
        json(res, 401, { error: 'Wrong authenticator code' })
        return true
      }
      json(res, 200, { ok: true, needsTotp: false, token: sessionToken(env, 'full'), kind: 'full' }, [
        sessionCookieHeader(env),
        `${'fundly_pending'}=; Path=/; Max-Age=0`,
      ])
      return true
    }
    json(res, 200, { ok: true, needsTotp: false, token: sessionToken(env, 'full'), kind: 'full' }, [
      sessionCookieHeader(env),
      `${'fundly_pending'}=; Path=/; Max-Age=0`,
    ])
    return true
  }

  if (path === '/api/auth/verify-totp' && method === 'POST') {
    if (!hasPendingSession(env, cookie, authorization) && !hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Enter your password first' })
      return true
    }
    if (!totpConfigured(env)) {
      json(res, 400, { error: 'Authenticator is not set up yet' })
      return true
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const code = typeof body.code === 'string' ? body.code : ''
    if (!verifyTotp(env, code)) {
      json(res, 401, { error: 'Wrong authenticator code' })
      return true
    }
    json(res, 200, { ok: true, token: sessionToken(env, 'full'), kind: 'full' }, [
      sessionCookieHeader(env),
      `${'fundly_pending'}=; Path=/; Max-Age=0`,
    ])
    return true
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    json(res, 200, { ok: true }, clearAuthCookies())
    return true
  }

  if (path === '/api/auth/totp-setup' && method === 'GET') {
    if (!hasPendingSession(env, cookie, authorization) && !hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Unlock with your password first' })
      return true
    }
    const setup = await buildTotpSetup(env)
    if (!setup.ok) {
      json(res, 400, { error: setup.error })
      return true
    }
    json(res, 200, setup)
    return true
  }

  if (path === '/api/fundly/state' && method === 'GET') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    const result = await loadAppState(env)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return true
    }
    json(res, 200, { state: result.state, empty: result.empty })
    return true
  }

  if (path === '/api/fundly/state' && method === 'PUT') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const state = normalizeState(body.state)
    const result = await saveAppState(env, state)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (path === '/api/ai/status' && method === 'GET') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    json(res, 200, { configured: Boolean(env.GEMINI_API_KEY?.trim()) })
    return true
  }

  if (path === '/api/ai/chats' && method === 'GET') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    const result = await listCoachChats(env)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return true
    }
    json(res, 200, { chats: result.chats })
    return true
  }

  if (path === '/api/ai/chats' && method === 'POST') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    let body: Record<string, unknown> = {}
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const result = await createCoachChat(env, typeof body.title === 'string' ? body.title : undefined)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return true
    }
    json(res, 200, { chat: result.chat })
    return true
  }

  if (path === '/api/ai/chats/reorder' && method === 'PUT') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : []
    const result = await reorderCoachChats(env, ids)
    if (!result.ok) {
      json(res, result.error === 'Chat not found' ? 404 : 500, { error: result.error })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  const chatMatch = path.match(/^\/api\/ai\/chats\/([^/]+)(?:\/(messages))?$/)
  if (chatMatch) {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    const chatId = decodeURIComponent(chatMatch[1] || '')
    const isMessages = chatMatch[2] === 'messages'

    if (isMessages && method === 'GET') {
      const result = await listCoachMessages(env, chatId)
      if (!result.ok) {
        json(res, result.error === 'Chat not found' ? 404 : 500, { error: result.error })
        return true
      }
      json(res, 200, { messages: result.messages })
      return true
    }

    if (isMessages && method === 'POST') {
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch {
        json(res, 400, { error: 'Invalid JSON' })
        return true
      }
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
      if (!result.ok) {
        json(res, result.error === 'Chat not found' ? 404 : 500, { error: result.error })
        return true
      }
      json(res, 200, { ok: true, title: result.title })
      return true
    }

    if (!isMessages && method === 'PATCH') {
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch {
        json(res, 400, { error: 'Invalid JSON' })
        return true
      }
      if (typeof body.title !== 'string') {
        json(res, 400, { error: 'title required' })
        return true
      }
      const result = await renameCoachChat(env, chatId, body.title)
      if (!result.ok) {
        json(res, result.error === 'Chat not found' ? 404 : 500, { error: result.error })
        return true
      }
      json(res, 200, { ok: true, title: result.title })
      return true
    }

    if (!isMessages && method === 'DELETE') {
      const result = await deleteCoachChat(env, chatId)
      if (!result.ok) {
        json(res, result.error === 'Chat not found' ? 404 : 500, { error: result.error })
        return true
      }
      json(res, 200, { ok: true })
      return true
    }
  }

  if (path === '/api/ai/chat' && method === 'POST') {
    if (!hasFullSession(env, cookie, authorization)) {
      json(res, 401, { error: 'Locked' })
      return true
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      json(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const messages = Array.isArray(body.messages) ? (body.messages as CoachChatMessage[]) : []
    const result = await runFundlyAiChat({
      apiKey: env.GEMINI_API_KEY || '',
      messages,
      snapshot: body.snapshot ?? {},
      needsTitle: Boolean(body.needsTitle),
    })
    if (!result.ok) {
      json(res, result.status || 502, { error: result.error })
      return true
    }
    json(res, 200, {
      ok: true,
      reply: result.reply,
      pendingAction: result.pendingAction,
      chatTitle: result.chatTitle,
      configured: true,
    })
    return true
  }

  return false
}
