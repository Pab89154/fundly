/** Local (and optional) notifications — no-ops when permission denied. */

export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function maybeNotify(title: string, body: string, opts?: { tag?: string; url?: string }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      tag: opts?.tag,
      data: opts?.url ? { url: opts.url } : undefined,
    })
    n.onclick = () => {
      window.focus()
      if (opts?.url) {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '') || ''
        window.location.href = `${base}${opts.url}`
      }
      n.close()
    }
  } catch {
    /* ignore */
  }
}
