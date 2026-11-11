/**
 * Fundly AI coach — Gemini chat with propose_* tools (never auto-applied).
 * Used by Worker + Vite middleware. Key stays server-side (GEMINI_API_KEY).
 */

import type { AccountId, SpendSlice } from './money.js'

export type CoachChatMessage = { role: 'user' | 'assistant'; content: string }

export type PendingAction =
  | {
      type: 'spend'
      amountUsd: number
      date?: string
      description?: string
      category?: string
      slices: SpendSlice[]
      summary: string
    }
  | {
      type: 'income'
      amountUsd: number
      date?: string
      description?: string
      source?: string
      summary: string
    }
  | {
      type: 'transfer'
      amountUsd: number
      from: AccountId
      to: AccountId
      date?: string
      description?: string
      summary: string
    }
  | {
      type: 'travel_mode'
      enabled: boolean
      summary: string
    }
  | {
      type: 'pause_subscription'
      subscriptionId: string
      name: string
      enabled: boolean
      summary: string
    }

const SYSTEM = `You are Fundly Coach — a built-in money helper for one person using Fundly (four pots: Goal/iphone, Spending, Extra, Charity).

You see a JSON snapshot of their Fundly data. Answer with specific dollars and pot names.

Rules:
- Keep replies short (a few sentences). Plain text only.
- Never use markdown: no # headings, no **, ***, __, bullets with -, or backticks.
- Never invent balances; use the snapshot.
- You cannot change money yourself. To change anything, call ONE propose_* tool. The app asks the user to Confirm first.
- For spending across pots, include exact slices (account + amountUsd) that sum to the total.
- Account ids: iphone (Goal), spending, extra, charity.
- Advice-only questions: reply with text, no tools.`

const TITLE_TOOL = {
  name: 'set_chat_title',
  description:
    'Name this chat with a short plain title (3–6 words). Call once on a new chat along with your reply.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'Short chat title, no quotes or markdown' },
    },
    required: ['title'],
  },
}

const ACTION_TOOLS = [
      {
        name: 'propose_spend',
        description:
          'Propose recording a purchase. User must confirm. Include exact pot slices that sum to amountUsd.',
        parameters: {
          type: 'OBJECT',
          properties: {
            amountUsd: { type: 'NUMBER' },
            description: { type: 'STRING' },
            category: { type: 'STRING' },
            date: { type: 'STRING', description: 'YYYY-MM-DD optional' },
            slices: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  account: {
                    type: 'STRING',
                    description: 'iphone | spending | extra | charity',
                  },
                  amountUsd: { type: 'NUMBER' },
                },
                required: ['account', 'amountUsd'],
              },
            },
          },
          required: ['amountUsd', 'slices'],
        },
      },
      {
        name: 'propose_income',
        description: 'Propose logging income (split by current allocation / Travel Mode). User confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            amountUsd: { type: 'NUMBER' },
            source: { type: 'STRING' },
            description: { type: 'STRING' },
            date: { type: 'STRING' },
          },
          required: ['amountUsd'],
        },
      },
      {
        name: 'propose_transfer',
        description: 'Propose moving money between two pots. User confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            amountUsd: { type: 'NUMBER' },
            from: { type: 'STRING' },
            to: { type: 'STRING' },
            description: { type: 'STRING' },
            date: { type: 'STRING' },
          },
          required: ['amountUsd', 'from', 'to'],
        },
      },
      {
        name: 'propose_travel_mode',
        description: 'Propose turning Travel Mode on or off. User confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            enabled: { type: 'BOOLEAN' },
          },
          required: ['enabled'],
        },
      },
      {
        name: 'propose_pause_subscription',
        description: 'Propose pausing or resuming a subscription. User confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            subscriptionId: { type: 'STRING' },
            name: { type: 'STRING' },
            enabled: { type: 'BOOLEAN', description: 'false = pause, true = resume' },
          },
          required: ['subscriptionId', 'enabled'],
        },
      },
]

function buildTools(needsTitle: boolean) {
  return [
    {
      functionDeclarations: needsTitle ? [TITLE_TOOL, ...ACTION_TOOLS] : ACTION_TOOLS,
    },
  ]
}

function cleanChatTitle(raw: string): string {
  const clean = stripCoachMarkdown(raw)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean
}

function potLabel(id: string): string {
  if (id === 'iphone') return 'Goal'
  if (id === 'extra') return 'Extra'
  if (id === 'charity') return 'Charity'
  return 'Spending'
}

function parseAccount(v: unknown): AccountId | null {
  const s = String(v || '')
  if (s === 'iphone' || s === 'spending' || s === 'extra' || s === 'charity') return s
  return null
}

function pendingFromToolCall(
  name: string,
  args: Record<string, unknown>,
): PendingAction | null {
  if (name === 'propose_spend') {
    const amountUsd = Number(args.amountUsd)
    const rawSlices = Array.isArray(args.slices) ? args.slices : []
    const slices: SpendSlice[] = []
    for (const s of rawSlices) {
      if (!s || typeof s !== 'object') continue
      const o = s as Record<string, unknown>
      const account = parseAccount(o.account)
      const usd = Number(o.amountUsd)
      if (!account || !(usd > 0)) continue
      slices.push({ account, cents: Math.round(usd * 100) })
    }
    if (!(amountUsd > 0) || slices.length === 0) return null
    const parts = slices
      .map((s) => `$${((s.cents / 100).toFixed(2))} ${potLabel(s.account)}`)
      .join(' + ')
    return {
      type: 'spend',
      amountUsd,
      date: typeof args.date === 'string' ? args.date : undefined,
      description: typeof args.description === 'string' ? args.description : undefined,
      category: typeof args.category === 'string' ? args.category : undefined,
      slices,
      summary: `Spend $${amountUsd.toFixed(2)}${args.description ? ` — ${String(args.description)}` : ''}: ${parts}`,
    }
  }
  if (name === 'propose_income') {
    const amountUsd = Number(args.amountUsd)
    if (!(amountUsd > 0)) return null
    return {
      type: 'income',
      amountUsd,
      date: typeof args.date === 'string' ? args.date : undefined,
      description: typeof args.description === 'string' ? args.description : undefined,
      source: typeof args.source === 'string' ? args.source : 'other',
      summary: `Log income $${amountUsd.toFixed(2)}${args.source ? ` (${String(args.source)})` : ''}`,
    }
  }
  if (name === 'propose_transfer') {
    const amountUsd = Number(args.amountUsd)
    const from = parseAccount(args.from)
    const to = parseAccount(args.to)
    if (!(amountUsd > 0) || !from || !to || from === to) return null
    return {
      type: 'transfer',
      amountUsd,
      from,
      to,
      date: typeof args.date === 'string' ? args.date : undefined,
      description: typeof args.description === 'string' ? args.description : undefined,
      summary: `Transfer $${amountUsd.toFixed(2)} ${potLabel(from)} → ${potLabel(to)}`,
    }
  }
  if (name === 'propose_travel_mode') {
    const enabled = Boolean(args.enabled)
    return {
      type: 'travel_mode',
      enabled,
      summary: enabled
        ? 'Turn Travel Mode ON (Extra merges into Spending)'
        : 'Turn Travel Mode OFF (Extra stays in Spending; normal split resumes)',
    }
  }
  if (name === 'propose_pause_subscription') {
    const subscriptionId = String(args.subscriptionId || '').trim()
    if (!subscriptionId) return null
    const enabled = Boolean(args.enabled)
    const nameLabel = String(args.name || subscriptionId)
    return {
      type: 'pause_subscription',
      subscriptionId,
      name: nameLabel,
      enabled,
      summary: enabled ? `Resume subscription “${nameLabel}”` : `Pause subscription “${nameLabel}”`,
    }
  }
  return null
}

type GeminiPart = {
  thought?: boolean
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
}

// 3.8 Flash hangs under load (5 RPM) and is what surfaces "timed out".
// Stay on lites (15 RPM / 500 RPD) and race them.
const LITE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const
const MAX_HISTORY = 8
const PER_MODEL_MS = 8_000

function compactSnapshot(snapshot: unknown): string {
  try {
    const raw = JSON.stringify(snapshot ?? {})
    if (raw.length <= 6_000) return raw
    return `${raw.slice(0, 6_000)}…[truncated]`
  } catch {
    return '{}'
  }
}

/** Strip markdown so replies stay readable in plain chat bubbles. */
export function stripCoachMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function postGemini(
  apiKey: string,
  model: string,
  body: unknown,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PER_MODEL_MS),
  })
}

async function callGeminiOnce(opts: {
  apiKey: string
  model: string
  contents: Array<{ role: string; parts: Array<{ text: string }> }>
  snapshotJson: string
  needsTitle: boolean
}): Promise<
  | { ok: true; reply: string; pendingAction: PendingAction | null; chatTitle: string | null }
  | { ok: false; error: string; status: number; retryable: boolean }
> {
  const titleHint = opts.needsTitle
    ? '\n- This is a new chat: also call set_chat_title with a short 3–6 word title (plain text).'
    : ''
  const baseBody = {
    systemInstruction: {
      parts: [
        {
          text: `${SYSTEM}${titleHint}\n\nCurrent Fundly snapshot (JSON):\n${opts.snapshotJson}`,
        },
      ],
    },
    tools: buildTools(opts.needsTitle),
    contents: opts.contents,
    // No thinkingConfig — extra thinking burns the tiny 3.8 quota and times out.
    generationConfig: { maxOutputTokens: 512 },
  }

  let upstream: Response
  try {
    upstream = await postGemini(opts.apiKey, opts.model, baseBody)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not reach Gemini'
    const timedOut = /abort|timeout/i.test(msg)
    return {
      ok: false,
      error: timedOut ? `${opts.model} timed out` : msg,
      status: 504,
      retryable: true,
    }
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string }
    candidates?: Array<{
      content?: { parts?: GeminiPart[] }
      finishReason?: string
    }>
  }

  if (!upstream.ok) {
    const status = upstream.status
    const msg = data.error?.message || `Gemini error (${status})`
    const retryable =
      status === 429 ||
      status === 503 ||
      status === 500 ||
      status === 404 ||
      /no longer available|not found|high demand|resource exhausted|unavailable|overloaded/i.test(
        msg,
      )
    return {
      ok: false,
      error: msg,
      status: status >= 400 && status < 600 ? status : 502,
      retryable,
    }
  }

  const parts = data.candidates?.[0]?.content?.parts || []
  const textBits: string[] = []
  let pendingAction: PendingAction | null = null
  let chatTitle: string | null = null

  for (const p of parts) {
    // Skip thought-only parts; keep visible text + tool calls.
    if (p.text && !p.thought) textBits.push(p.text)
    if (!p.functionCall?.name) continue
    const args = (p.functionCall.args || {}) as Record<string, unknown>
    if (p.functionCall.name === 'set_chat_title') {
      const t = cleanChatTitle(String(args.title || ''))
      if (t) chatTitle = t
      continue
    }
    if (!pendingAction) pendingAction = pendingFromToolCall(p.functionCall.name, args)
  }

  let reply = stripCoachMarkdown(textBits.join('\n').trim())
  if (!reply && pendingAction) {
    reply = `I can do this if you confirm:\n${pendingAction.summary}`
  }
  // New chats ask for set_chat_title; lite models often return ONLY that tool
  // call and no text — which made every first message look like "Coach is busy".
  if (!reply && opts.needsTitle) {
    const again = await callGeminiOnce({ ...opts, needsTitle: false })
    if (again.ok) {
      return { ...again, chatTitle: again.chatTitle || chatTitle }
    }
    return again
  }
  if (!reply) {
    return {
      ok: false,
      error: 'Coach returned an empty reply. Try again.',
      status: 502,
      retryable: true,
    }
  }

  return { ok: true, reply, pendingAction, chatTitle }
}

export async function runFundlyAiChat(opts: {
  apiKey: string
  messages: CoachChatMessage[]
  snapshot: unknown
  model?: string
  needsTitle?: boolean
}): Promise<
  | { ok: true; reply: string; pendingAction: PendingAction | null; chatTitle: string | null }
  | { ok: false; error: string; status?: number }
> {
  const key = opts.apiKey.trim()
  if (!key) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY is not set. Add it to .env (local) or wrangler secret put GEMINI_API_KEY.',
      status: 503,
    }
  }

  const contents = opts.messages
    .filter((m) => m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  if (contents.length === 0) {
    return { ok: false, error: 'Send a message first.', status: 400 }
  }

  const snapshotJson = compactSnapshot(opts.snapshot)
  const needsTitle = Boolean(opts.needsTitle)
  const models = opts.model
    ? [opts.model, ...LITE_MODELS.filter((m) => m !== opts.model)]
    : [...LITE_MODELS]

  const shared = { apiKey: key, contents, snapshotJson, needsTitle }

  type ChatResult = Awaited<ReturnType<typeof callGeminiOnce>>

  // First lite that answers wins — a hung model must not block the other.
  const winner = await new Promise<ChatResult>((resolve) => {
    let pending = models.length
    let lastFail: ChatResult | null = null
    if (pending === 0) {
      resolve({
        ok: false,
        error: 'Coach is busy right now. Wait a few seconds and try again.',
        status: 503,
        retryable: true,
      })
      return
    }
    for (const model of models) {
      void callGeminiOnce({ ...shared, model }).then(
        (result) => {
          if (result.ok) {
            resolve(result)
            return
          }
          lastFail = result
          pending -= 1
          if (pending === 0) {
            resolve(
              lastFail || {
                ok: false,
                error: 'Coach is busy right now. Wait a few seconds and try again.',
                status: 503,
                retryable: true,
              },
            )
          }
        },
        (e: unknown) => {
          lastFail = {
            ok: false,
            error: e instanceof Error ? e.message : 'Coach failed',
            status: 502,
            retryable: true,
          }
          pending -= 1
          if (pending === 0 && lastFail) resolve(lastFail)
        },
      )
    }
  })

  if (winner.ok) return winner

  const detail = winner.error || 'Coach failed'
  const busyLike =
    winner.status === 429 ||
    winner.status === 503 ||
    winner.status === 504 ||
    /timed out|timeout|high demand|resource exhausted|unavailable|overloaded|busy/i.test(detail)

  return {
    ok: false,
    error: busyLike
      ? 'Coach is busy right now. Wait a few seconds and try again.'
      : detail,
    status: winner.status || 503,
  }
}
