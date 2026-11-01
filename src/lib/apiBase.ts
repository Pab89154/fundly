/** Empty in local Vite (proxied). Set VITE_FUNDLY_API_BASE for GitHub Pages. */
export function apiUrl(path: string): string {
  const base = String(import.meta.env.VITE_FUNDLY_API_BASE || '')
    .trim()
    .replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
