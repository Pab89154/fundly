/** Resolve a file in `/public` with the Vite base path (e.g. `/fundly/` on Pages). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const cleaned = path.replace(/^\//, '')
  return `${base}${cleaned}`
}
