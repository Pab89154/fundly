/** Compress / accept image or SVG files for business logos (data URLs). */

const MAX_EDGE = 256
const MAX_CHARS = 160_000
const JPEG_QUALITY = 0.82

export function isLogoDataUrl(s: string | null | undefined): s is string {
  return Boolean(s && s.startsWith('data:image/'))
}

/** Default PrintX mark when no custom logo is set. */
export function defaultPrintxLogoUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}printx-logo.svg`
}

export function resolveBusinessLogoUrl(b: {
  id: string
  logoDataUrl?: string | null
}): string | null {
  if (isLogoDataUrl(b.logoDataUrl)) return b.logoDataUrl
  if (b.id === 'printx') return defaultPrintxLogoUrl()
  return null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

async function compressRaster(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  let out = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  if (out.length > MAX_CHARS) {
    out = canvas.toDataURL('image/jpeg', 0.65)
  }
  if (out.length > MAX_CHARS) {
    throw new Error('Image is still too large — try a smaller one.')
  }
  return out
}

/** Turn a File (image or svg) into a stored data URL. */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  const type = file.type || ''
  if (type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const raw = await file.text()
    const encoded = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`
    if (encoded.length > MAX_CHARS) throw new Error('SVG is too large.')
    return encoded
  }
  if (!type.startsWith('image/')) throw new Error('Use a PNG, JPEG, WebP, or SVG image.')
  return compressRaster(file)
}

/** Accept clipboard image / SVG text paste. */
export async function clipboardToLogoDataUrl(e: ClipboardEvent): Promise<string | null> {
  const items = e.clipboardData?.items
  if (items) {
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return fileToLogoDataUrl(file)
      }
    }
  }
  const text = e.clipboardData?.getData('text/plain')?.trim()
  if (text?.startsWith('data:image/')) {
    if (text.length > MAX_CHARS) throw new Error('Pasted image is too large.')
    return text
  }
  if (text?.includes('<svg')) {
    const encoded = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`
    if (encoded.length > MAX_CHARS) throw new Error('Pasted SVG is too large.')
    return encoded
  }
  return null
}
