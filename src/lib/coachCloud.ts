import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const OWNER_EMAIL = 'pmolinasamayoa@icloud.com'

export type CoachCloudEnv = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export type CoachChatRow = {
  id: string
  title: string
  sortOrder: number
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

function mapChat(r: {
  id: unknown
  title?: unknown
  sort_order?: unknown
  created_at?: unknown
  updated_at?: unknown
}): CoachChatRow {
  return {
    id: String(r.id),
    title: String(r.title || 'New chat'),
    sortOrder: Number(r.sort_order) || 0,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  }
}

export async function listCoachChats(
  env: CoachCloudEnv,
): Promise<{ ok: true; chats: CoachChatRow[] } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()

  const { data, error } = await sb
    .from('fundly_coach_chats')
    .select('id, title, sort_order, created_at, updated_at')
    .eq('owner_email', OWNER_EMAIL)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return { ok: false, error: error.message }
  return { ok: true, chats: (data || []).map(mapChat) }
}

export async function createCoachChat(
  env: CoachCloudEnv,
  title?: string,
): Promise<{ ok: true; chat: CoachChatRow } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()

  const { data: top } = await sb
    .from('fundly_coach_chats')
    .select('sort_order')
    .eq('owner_email', OWNER_EMAIL)
    .order('sort_order', { ascending: true })
    .limit(1)

  const sortOrder = (top?.[0]?.sort_order != null ? Number(top[0].sort_order) : 0) - 1
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('fundly_coach_chats')
    .insert({
      owner_email: OWNER_EMAIL,
      title: (title || 'New chat').trim() || 'New chat',
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select('id, title, sort_order, created_at, updated_at')
    .single()

  if (error || !data) return { ok: false, error: error?.message || 'Could not create chat' }
  return { ok: true, chat: mapChat(data) }
}

export async function renameCoachChat(
  env: CoachCloudEnv,
  chatId: string,
  title: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()
  const next = title.trim() || 'New chat'
  const { data, error } = await sb
    .from('fundly_coach_chats')
    .update({ title: next })
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
    .select('id, title')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Chat not found' }
  return { ok: true, title: String(data.title || next) }
}

export async function reorderCoachChats(
  env: CoachCloudEnv,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return noSb()
  const ids = orderedIds.map((id) => String(id || '').trim()).filter(Boolean)
  if (!ids.length) return { ok: false, error: 'No chat ids' }

  const { data: owned, error: ownErr } = await sb
    .from('fundly_coach_chats')
    .select('id')
    .eq('owner_email', OWNER_EMAIL)
    .in('id', ids)
  if (ownErr) return { ok: false, error: ownErr.message }
  const ownedSet = new Set((owned || []).map((r) => String(r.id)))
  if (ownedSet.size !== ids.length) return { ok: false, error: 'Chat not found' }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await sb
      .from('fundly_coach_chats')
      .update({ sort_order: i })
      .eq('id', ids[i]!)
      .eq('owner_email', OWNER_EMAIL)
    if (error) return { ok: false, error: error.message }
  }
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

  // Title stays until Coach names the chat (or the user renames it).
  const title = String(chat.title || 'New chat')
  const { error: upErr } = await sb
    .from('fundly_coach_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('owner_email', OWNER_EMAIL)
  if (upErr) return { ok: false, error: upErr.message }

  return { ok: true, title }
}
