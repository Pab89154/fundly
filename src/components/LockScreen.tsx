import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock, Shield } from 'lucide-react'
import { FundlyLogo } from './FundlyLogo'
import {
  fetchAuthStatus,
  loginWithPassword,
  verifyTotpCode,
  type AuthStatus,
} from '../lib/fundlyApi'

type Step = 'loading' | 'password' | 'totp'

type Props = {
  onUnlocked: () => void
}

export function LockScreen({ onUnlocked }: Props) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAuthStatus()
        setStatus(s)
        if (!s.configured) {
          setError('Set FUNDLY_APP_PASSWORD in .env, then restart the app.')
          setStep('password')
          return
        }
        if (s.unlocked) {
          onUnlocked()
          return
        }
        if (s.needsTotp) {
          setStep('totp')
          return
        }
        setStep('password')
      } catch {
        setError('Could not reach the lock server. Is npm run dev running?')
        setStep('password')
      }
    })()
  }, [onUnlocked])

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await loginWithPassword(password)
      if (!result.ok) {
        setError(result.error || 'Wrong password')
        return
      }
      if (result.needsTotp) {
        setStep('totp')
        setCode('')
        return
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  async function onTotp(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await verifyTotpCode(code)
      if (!result.ok) {
        setError(result.error || 'Wrong code')
        return
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Checking lock…</p>
      </div>
    )
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <FundlyLogo size={72} useRaster className="mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight">Fundly is locked</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only you — password{status?.totpConfigured ? ' + authenticator code' : ''}.
          </p>
        </div>

        {step === 'password' ? (
          <form className="space-y-4" onSubmit={onPassword}>
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
            <button type="submit" className="btn btn-primary w-full" disabled={busy || !password}>
              <Lock size={16} aria-hidden />
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : null}

        {step === 'totp' ? (
          <div className="space-y-4">
            <form className="space-y-4" onSubmit={onTotp}>
              <label className="block text-sm font-semibold">
                Authenticator code
                <input
                  className="field mt-1 w-full tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6}>
                <Shield size={16} aria-hidden />
                {busy ? 'Checking…' : 'Unlock'}
              </button>
            </form>
            <button
              type="button"
              className="text-sm text-[var(--muted)] underline"
              onClick={() => {
                setStep('password')
                setCode('')
                setError('')
              }}
            >
              Back to password
            </button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <p className="text-center text-xs leading-relaxed text-[var(--muted)]">
          On iPhone: Safari → Share → <span className="font-semibold text-[var(--text)]">Add to Home Screen</span>
        </p>
      </div>
    </div>
  )
}
