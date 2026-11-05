import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const OWNER_EMAIL = 'pmolinasamayoa@icloud.com'

export type CoachCloudEnv = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export type CoachChatRow = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type CoachMessageRow = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingAction: unknown | null
  seq: number
  createdAt: string
}

function supabaseConfigured(env: CoachCloudEnv): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

function client(env: CoachCloudEnv): SupabaseClient | null {
  if (!supabaseConfigured(env)) return null
  return createClient(env.SUPABASE_URL!.trim(), env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function noSb(): { ok: false; error: string } {
  return { ok: false, error: 'Supabase is not configured (SUPABASE_URL / SERVICE_ROLE_KEY).' }
}

function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean
}

export async function listCoachChats(
  env: CoachCloudEnv,
): Promise<{ ok: true; chats: CoachChatRow[] } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()

  const { data, error } = await sb
    .from('fundly_coach_chats')
    .select('id, title, created_at, updated_at')
    .eq('owner_email', OWNER_EMAIL)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    chats: (data || []).map((r) => ({
      id: String(r.id),
      title: String(r.title || 'New chat'),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
  }
}

export async function createCoachChat(
  env: CoachCloudEnv,
  title?: string,
): Promise<{ ok: true; chat: CoachChatRow } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()

  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('fundly_coach_chats')
    .insert({
      owner_email: OWNER_EMAIL,
      title: (title || 'New chat').trim() || 'New chat',
      created_at: now,
      updated_at: now,
    })
    .select('id, title, created_at, updated_at')
    .single()

  if (error || !data) return { ok: false, error: error?.message || 'Could not create chat' }
  return {
    ok: true,
    chat: {
      id: String(data.id),
      title: String(data.title || 'New chat'),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
  }
}

export async function renameCoachChat(
  env: CoachCloudEnv,
  chatId: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()
  const next = title.trim() || 'New chat'
  const { data, error } = await sb
    .from('fundly_coach_chats')
    .update({ title: next, updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Chat not found' }
  return { ok: true }
}

export async function deleteCoachChat(
  env: CoachCloudEnv,
  chatId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()
  const { data, error } = await sb
    .from('fundly_coach_chats')
    .delete()
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Chat not found' }
  return { ok: true }
}

export async function listCoachMessages(
  env: CoachCloudEnv,
  chatId: string,
): Promise<{ ok: true; messages: CoachMessageRow[] } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()

  const { data: chat, error: chatErr } = await sb
    .from('fundly_coach_chats')
    .select('id')
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
    .maybeSingle()
  if (chatErr) return { ok: false, error: chatErr.message }
  if (!chat) return { ok: false, error: 'Chat not found' }

  const { data, error } = await sb
    .from('fundly_coach_messages')
    .select('id, role, content, pending_action, seq, created_at')
    .eq('chat_id', chatId)
    .order('seq', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    messages: (data || []).map((r) => ({
      id: String(r.id),
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: String(r.content || ''),
      pendingAction: r.pending_action ?? null,
      seq: Number(r.seq) || 0,
      createdAt: String(r.created_at),
    })),
  }
}

export async function appendCoachMessages(
  env: CoachCloudEnv,
  chatId: string,
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    pendingAction?: unknown | null
  }>,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()
  if (!messages.length) return { ok: false, error: 'No messages to append' }

  const { data: chat, error: chatErr } = await sb
    .from('fundly_coach_chats')
    .select('id, title')
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
    .maybeSingle()
  if (chatErr) return { ok: false, error: chatErr.message }
  if (!chat) return { ok: false, error: 'Chat not found' }

  const { data: lastRows, error: lastErr } = await sb
    .from('fundly_coach_messages')
    .select('seq')
    .eq('chat_id', chatId)
    .order('seq', { ascending: false })
    .limit(1)
  if (lastErr) return { ok: false, error: lastErr.message }

  let nextSeq = (lastRows?.[0]?.seq != null ? Number(lastRows[0].seq) : 0) + 1
  const rows = messages.map((m) => {
    const row = {
      chat_id: chatId,
      role: m.role,
      content: m.content,
      pending_action: m.pendingAction ?? null,
      seq: nextSeq,
    }
    nextSeq += 1
    return row
  })

  const { error: insErr } = await sb.from('fundly_coach_messages').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }

  let title = String(chat.title || 'New chat')
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
  if (firstUser && (!title || title === 'New chat')) {
    title = titleFromText(firstUser.content)
  }

  const { error: upErr } = await sb
    .from('fundly_coach_chats')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
  if (upErr) return { ok: false, error: upErr.message }

  return { ok: true, title }
}
