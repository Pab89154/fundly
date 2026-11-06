import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, ChevronUp, MessageSquarePlus, Pencil, Send, Trash2 } from 'lucide-react'
import { CoachCapIcon } from '../components/CoachCapIcon'
import { useMoney } from '../store/MoneyContext'
import { buildCoachSnapshot } from '../lib/coachSnapshot'
import {
  appendCoachMessages,
  createCoachChat,
  deleteCoachChat,
  fetchAiCoachStatus,
  fetchCoachChats,
  fetchCoachMessages,
  postAiCoachChat,
  renameCoachChatApi,
  reorderCoachChatsApi,
  type CoachChatSummary,
} from '../lib/fundlyApi'
import type { PendingAction } from '../lib/geminiChat'
import { ACCOUNT_LABELS, fromCents, localDateISO, toCents } from '../lib/money'
import type { IncomeSource } from '../types'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const ACTIVE_CHAT_KEY = 'fundly_coach_active_chat'

function readActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY)
  } catch {
    return null
  }
}

function writeActiveChatId(id: string | null) {
  try {
    if (!id) localStorage.removeItem(ACTIVE_CHAT_KEY)
    else localStorage.setItem(ACTIVE_CHAT_KEY, id)
  } catch {
    /* private mode */
  }
}

export function Coach() {
  const {
    state,
    balances,
    addSpending,
    addIncome,
    addTransfer,
    setTravelMode,
    upsertSubscription,
  } = useMoney()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [chats, setChats] = useState<CoachChatSummary[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionMsg, setActionMsg] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const refreshChats = useCallback(async () => {
    const res = await fetchCoachChats()
    if (!res.ok) {
      setErr(res.error)
      return [] as CoachChatSummary[]
    }
    setChats(res.chats)
    return res.chats
  }, [])

  const openChat = useCallback(async (chatId: string) => {
    setLoadingMessages(true)
    setErr('')
    setPending(null)
    setActionMsg('')
    setActiveChatId(chatId)
    writeActiveChatId(chatId)
    try {
      const res = await fetchCoachMessages(chatId)
      if (!res.ok) {
        setErr(res.error)
        setMessages([])
        return
      }
      setMessages(res.messages.map((m) => ({ role: m.role, content: m.content })))
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const startNewChat = useCallback(async () => {
    setErr('')
    setPending(null)
    setActionMsg('')
    setBusy(true)
    try {
      const res = await createCoachChat()
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setChats((prev) => [res.chat, ...prev.filter((c) => c.id !== res.chat.id)])
      setActiveChatId(res.chat.id)
      writeActiveChatId(res.chat.id)
      setMessages([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void fetchAiCoachStatus().then((r) => {
      if (!r.ok) {
        setConfigured(false)
        setErr(r.error)
        return
      }
      setConfigured(r.configured)
    })
  }, [])

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    void (async () => {
      setLoadingChats(true)
      try {
        const list = await refreshChats()
        const saved = readActiveChatId()
        const pick = (saved && list.find((c) => c.id === saved)?.id) || list[0]?.id || null
        if (pick) await openChat(pick)
        else {
          setActiveChatId(null)
          setMessages([])
        }
      } finally {
        setLoadingChats(false)
      }
    })()
  }, [openChat, refreshChats])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending, busy, loadingMessages])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const beginRename = (chat: CoachChatSummary) => {
    setRenamingId(chat.id)
    setRenameDraft(chat.title)
  }

  const commitRename = async () => {
    if (!renamingId) return
    const chatId = renamingId
    const next = renameDraft.trim() || 'New chat'
    setRenamingId(null)
    const prev = chats.find((c) => c.id === chatId)?.title
    if (prev === next) return
    setChats((list) => list.map((c) => (c.id === chatId ? { ...c, title: next } : c)))
    const res = await renameCoachChatApi(chatId, next)
    if (!res.ok) {
      setErr(res.error)
      if (prev) setChats((list) => list.map((c) => (c.id === chatId ? { ...c, title: prev } : c)))
      return
    }
    setChats((list) => list.map((c) => (c.id === chatId ? { ...c, title: res.title } : c)))
  }

  const moveChat = async (chatId: string, dir: -1 | 1) => {
    const idx = chats.findIndex((c) => c.id === chatId)
    const nextIdx = idx + dir
    if (idx < 0 || nextIdx < 0 || nextIdx >= chats.length) return
    const next = [...chats]
    const [row] = next.splice(idx, 1)
    if (!row) return
    next.splice(nextIdx, 0, row)
    setChats(next)
    const res = await reorderCoachChatsApi(next.map((c) => c.id))
    if (!res.ok) {
      setErr(res.error)
      void refreshChats()
    }
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setErr('')
    setActionMsg('')
    setPending(null)
    setBusy(true)
    setInput('')

    let chatId = activeChatId
    try {
      if (!chatId) {
        const created = await createCoachChat()
        if (!created.ok) {
          setErr(created.error)
          setInput(text)
          return
        }
        chatId = created.chat.id
        setActiveChatId(chatId)
        writeActiveChatId(chatId)
        setChats((prev) => [created.chat, ...prev.filter((c) => c.id !== chatId)])
      }

      const nextMsgs: ChatMsg[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMsgs)

      const savedUser = await appendCoachMessages(chatId, [{ role: 'user', content: text }])
      if (!savedUser.ok) {
        setErr(savedUser.error)
        setMessages(messages)
        return
      }

      const currentTitle = chats.find((c) => c.id === chatId)?.title || savedUser.title
      const needsTitle = !currentTitle || currentTitle === 'New chat'
      const snapshot = buildCoachSnapshot(state, balances)
      const res = await postAiCoachChat({ messages: nextMsgs, snapshot, needsTitle })
      if (!res.ok) {
        setErr(res.error)
        return
      }

      const withReply: ChatMsg[] = [...nextMsgs, { role: 'assistant', content: res.reply }]
      setMessages(withReply)
      setPending(res.pendingAction)

      if (needsTitle && res.chatTitle) {
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: res.chatTitle! } : c)),
        )
        const renamed = await renameCoachChatApi(chatId, res.chatTitle)
        if (renamed.ok) {
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, title: renamed.title } : c)),
          )
        }
      }

      const savedAsst = await appendCoachMessages(chatId, [
        { role: 'assistant', content: res.reply, pendingAction: res.pendingAction },
      ])
      if (!savedAsst.ok) {
        setErr(savedAsst.error)
        return
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Coach failed')
    } finally {
      setBusy(false)
    }
  }

  const removeChat = async (chatId: string) => {
    if (busy) return
    setErr('')
    const res = await deleteCoachChat(chatId)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    const next = chats.filter((c) => c.id !== chatId)
    setChats(next)
    if (activeChatId === chatId) {
      const pick = next[0]?.id || null
      if (pick) await openChat(pick)
      else {
        setActiveChatId(null)
        writeActiveChatId(null)
        setMessages([])
        setPending(null)
      }
    }
  }

  const confirmPending = () => {
    if (!pending) return
    setErr('')
    setActionMsg('')
    if (pending.type === 'spend') {
      const res = addSpending({
        amountUsd: pending.amountUsd,
        date: pending.date || localDateISO(),
        description: pending.description,
        category: pending.category || 'other',
        slices: pending.slices,
        fromAccount: pending.slices[0]?.account,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setActionMsg(`Recorded: ${pending.summary}`)
    } else if (pending.type === 'income') {
      const res = addIncome({
        amountUsd: pending.amountUsd,
        date: pending.date || localDateISO(),
        description: pending.description,
        source: (pending.source as IncomeSource) || 'other',
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setActionMsg(`Logged: ${pending.summary}`)
    } else if (pending.type === 'transfer') {
      const res = addTransfer({
        amountUsd: pending.amountUsd,
        from: pending.from,
        to: pending.to,
        date: pending.date || localDateISO(),
        description: pending.description,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setActionMsg(`Done: ${pending.summary}`)
    } else if (pending.type === 'travel_mode') {
      const res = setTravelMode(pending.enabled)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setActionMsg(pending.summary)
    } else if (pending.type === 'pause_subscription') {
      const sub = state.settings.subscriptions.find((s) => s.id === pending.subscriptionId)
      if (!sub) {
        setErr('Subscription not found.')
        return
      }
      const res = upsertSubscription({ ...sub, enabled: pending.enabled })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setActionMsg(pending.summary)
    }
    setPending(null)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <CoachCapIcon size={28} className="text-[var(--green)]" aria-hidden />
            Coach
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Ask about pots, goals, and spending. Chats save to the cloud so you can pick up later.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary inline-flex items-center gap-2"
          onClick={() => void startNewChat()}
          disabled={busy || configured === false}
        >
          <MessageSquarePlus size={16} aria-hidden />
          New chat
        </button>
      </header>

      {configured === false ? (
        <div className="card border-[var(--orange)]/40 bg-[var(--orange)]/10 p-4 text-sm">
          <p className="font-semibold text-[var(--orange)]">Gemini key not configured</p>
          <p className="mt-1 text-[var(--muted)]">
            Add <code className="font-mono">GEMINI_API_KEY</code> to <code className="font-mono">.env</code>{' '}
            for local, or{' '}
            <code className="font-mono">npx wrangler secret put GEMINI_API_KEY --name fundly</code> for
            production.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card flex max-h-[min(62vh,560px)] flex-col overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Chats
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loadingChats ? (
              <p className="px-2 py-3 text-sm text-[var(--muted)]">Loading…</p>
            ) : chats.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[var(--muted)]">No chats yet. Send a message to start.</p>
            ) : (
              <ul className="space-y-1">
                {chats.map((c, idx) => (
                  <li key={c.id} className="group flex items-stretch gap-0.5">
                    <div className="flex shrink-0 flex-col justify-center">
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--text)] disabled:opacity-30"
                        aria-label="Move chat up"
                        disabled={busy || idx === 0}
                        onClick={() => void moveChat(c.id, -1)}
                      >
                        <ChevronUp size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--text)] disabled:opacity-30"
                        aria-label="Move chat down"
                        disabled={busy || idx === chats.length - 1}
                        onClick={() => void moveChat(c.id, 1)}
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                    </div>
                    {renamingId === c.id ? (
                      <input
                        ref={renameInputRef}
                        className="field min-w-0 flex-1 px-2 py-1.5 text-sm"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitRename()
                          }
                          if (e.key === 'Escape') {
                            setRenamingId(null)
                          }
                        }}
                        aria-label="Rename chat"
                      />
                    ) : (
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 text-left text-sm transition ${
                          c.id === activeChatId
                            ? 'bg-[var(--green)]/15 font-semibold text-[var(--green)]'
                            : 'text-[var(--text)] hover:bg-[var(--card-2)]'
                        }`}
                        onClick={() => void openChat(c.id)}
                        onDoubleClick={() => beginRename(c)}
                        disabled={busy || loadingMessages}
                      >
                        <span className="line-clamp-2">{c.title}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="shrink-0 rounded-lg px-1.5 text-[var(--muted)] transition hover:bg-[var(--card-2)] hover:text-[var(--text)]"
                      aria-label={`Rename ${c.title}`}
                      onClick={() => beginRename(c)}
                      disabled={busy || renamingId === c.id}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg px-1.5 text-[var(--muted)] transition hover:bg-[var(--card-2)] hover:text-[var(--danger)]"
                      aria-label={`Delete ${c.title}`}
                      onClick={() => void removeChat(c.id)}
                      disabled={busy}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="card flex max-h-[min(62vh,560px)] min-h-[280px] flex-col overflow-hidden p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingMessages ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">Loading chat…</p>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
                <Bot size={32} className="text-[var(--green)]" aria-hidden />
                <p>Try: “Can I afford $40 from Spending + Extra?” or “Should I turn on Travel Mode?”</p>
                <p className="text-xs">
                  Now · Goal {ACCOUNT_LABELS.iphone} ${fromCents(balances.iphone).toFixed(2)} · Spending $
                  {fromCents(balances.spending).toFixed(2)} · Extra ${fromCents(balances.extra).toFixed(2)}
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-[var(--green)]/20 text-[var(--text)]'
                      : 'mr-auto bg-[var(--card-2)] text-[var(--text)]'
                  }`}
                >
                  {m.content}
                </div>
              ))
            )}
            {busy ? (
              <div
                className="mr-auto flex max-w-[92%] items-center gap-1 rounded-2xl bg-[var(--card-2)] px-4 py-3"
                aria-label="Coach is thinking"
              >
                <span className="coach-dot h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
                <span className="coach-dot coach-dot-2 h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
                <span className="coach-dot coach-dot-3 h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {pending ? (
            <div className="border-t border-[var(--border)] bg-[var(--green)]/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Needs your permission
              </p>
              <p className="mt-1 text-sm font-semibold">{pending.summary}</p>
              {pending.type === 'spend' ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {pending.slices
                    .map((s) => `${ACCOUNT_LABELS[s.account]} $${(s.cents / 100).toFixed(2)}`)
                    .join(' · ')}{' '}
                  (total ${(toCents(pending.amountUsd) / 100).toFixed(2)})
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={confirmPending} disabled={busy}>
                  Confirm
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPending(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <form
            className="flex gap-2 border-t border-[var(--border)] p-3"
            onSubmit={(e) => void send(e)}
          >
            <input
              className="field flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Coach…"
              disabled={busy || configured === false || loadingMessages}
              aria-label="Message Coach"
            />
            <button
              type="submit"
              className="btn btn-primary px-3"
              disabled={busy || !input.trim() || configured === false || loadingMessages}
              aria-label="Send"
            >
              <Send size={18} aria-hidden />
            </button>
          </form>
          <p className="border-t border-[var(--border)] px-3 py-2 text-center text-[11px] leading-snug text-[var(--muted)]">
            (AI can make mistakes. Always double check if it is true.)
          </p>
        </div>
      </div>

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {actionMsg ? <p className="text-sm text-[var(--green)]">{actionMsg}</p> : null}
    </div>
  )
}
