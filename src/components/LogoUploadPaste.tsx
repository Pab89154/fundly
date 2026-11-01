import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { clipboardToLogoDataUrl, fileToLogoDataUrl, isLogoDataUrl } from '../lib/businessLogo'

type Props = {
  value: string | null
  onChange: (next: string | null) => void
  /** Shown when value is empty (e.g. default PrintX SVG path). */
  previewFallback?: string | null
  label?: string
}

export function LogoUploadPaste({
  value,
  onChange,
  previewFallback = null,
  label = 'Logo (optional)',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = isLogoDataUrl(value) ? value : previewFallback

  const applyFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      setErr('')
      setBusy(true)
      try {
        const dataUrl = await fileToLogoDataUrl(file)
        onChange(dataUrl)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not use that image.')
      } finally {
        setBusy(false)
      }
    },
    [onChange],
  )

  return (
    <div>
      <label className="label">{label}</label>
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-2)] p-3"
        tabIndex={0}
        onPaste={(e) => {
          void (async () => {
            setErr('')
            try {
              const dataUrl = await clipboardToLogoDataUrl(e.nativeEvent)
              if (dataUrl) {
                e.preventDefault()
                onChange(dataUrl)
              }
            } catch (err) {
              setErr(err instanceof Error ? err.message : 'Paste failed.')
            }
          })()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void applyFile(e.dataTransfer.files?.[0])
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className="h-14 w-14 rounded-lg object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--muted)]">
            <ImagePlus size={22} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-[var(--muted)]">
            Upload, drop, or paste an image / SVG
            {busy ? '…' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </button>
            {isLogoDataUrl(value) ? (
              <button
                type="button"
                className="btn btn-danger px-3 py-1.5 text-xs"
                onClick={() => onChange(null)}
              >
                <Trash2 size={14} aria-hidden />
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            void applyFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {err ? <p className="mt-1 text-sm text-[var(--danger)]">{err}</p> : null}
    </div>
  )
}
