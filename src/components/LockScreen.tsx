import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { FundlyLogo } from './FundlyLogo'
import { fetchAuthStatus, loginWithPassword, type AuthStatus } from '../lib/fundlyApi'

const DRAFT_KEY = 'fundly_lock_draft'

type Props = {
  onUnlocked: () => void
}

function readDraft(): { password: string; code: string } {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return { password: '', code: '' }
    const parsed = JSON.parse(raw) as { password?: string; code?: string }
    return {
      password: typeof parsed.password === 'string' ? parsed.password : '',
      code: typeof parsed.code === 'string' ? parsed.code.replace(/\D/g, '').slice(0, 6) : '',
    }
  } catch {
    return { password: '', code: '' }
  }
}

function writeDraft(password: string, code: string) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ password, code }))
  } catch {
    /* private mode */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function LockScreen({ onUnlocked }: Props) {
  const draft = readDraft()
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState(draft.password)
  const [code, setCode] = useState(draft.code)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    writeDraft(password, code)
  }, [password, code])

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAuthStatus()
        setStatus(s)
        if (!s.configured) {
          setError('Set FUNDLY_APP_PASSWORD in .env, then restart the app.')
        } else if (s.unlocked) {
          clearDraft()
          onUnlocked()
          return
        }
      } catch {
        setError('Could not reach the lock server.')
      } finally {
        setReady(true)
      }
    })()
  }, [onUnlocked])

  async function onUnlock(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const needsCode = Boolean(status?.totpConfigured)
      const result = await loginWithPassword(password, needsCode ? code : undefined)
      if (!result.ok) {
        setError(result.error || 'Unlock failed')
        return
      }
      clearDraft()
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Checking lock…</p>
      </div>
    )
  }

  const totp = Boolean(status?.totpConfigured)
  const canSubmit = Boolean(password) && (!totp || code.length === 6)

  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <FundlyLogo size={72} useRaster className="mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight">Fundly is locked</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {totp
              ? 'Enter your password and authenticator code, then unlock.'
              : 'Enter your password to unlock.'}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onUnlock}>
          <div>
            <label className="label" htmlFor="fundly-password">
              Password
            </label>
            <div className="relative">
              <input
                id="fundly-password"
                className="field w-full pr-12"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                tabIndex={0}
                className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowPassword((v) => !v)
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {totp ? (
            <div>
              <label className="label" htmlFor="fundly-totp">
                Authenticator code
              </label>
              <input
                id="fundly-totp"
                className="field w-full tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                You can leave for your authenticator app — your password stays filled in.
              </p>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={busy || !canSubmit}>
            <Lock size={16} aria-hidden />
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    </div>
  )
}
