import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type NativeSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: NativeSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** Fundly-styled dropdown (replaces browser &lt;select&gt;). */
export function NativeSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="press-pop field flex w-full items-center justify-between gap-2 text-left font-medium disabled:opacity-50"
      >
        <span className={selected ? 'text-[var(--text)]' : 'text-[var(--muted)]'}>{label}</span>
        <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
        >
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-[var(--green)]/15 text-[var(--green)]'
                      : 'text-[var(--text)] hover:bg-[var(--card-2)]'
                  } disabled:opacity-40`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                  {active ? <Check size={16} aria-hidden /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
