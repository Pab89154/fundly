/** Local browser notifications — no-ops when permission denied / unsupported. */

export type NotifySetupState =
  | 'loading'
  | 'unsupported'
  | 'needs_https'
  | 'needs_homescreen'
  | 'denied'
  | 'enabled'
  | 'ready'

/** Brave hides "Brave" in the UA. `navigator.brave` is the supported check. */
export function isBraveBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean((navigator as Navigator & { brave?: unknown }).brave)
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return Boolean(mq || iosStandalone)
}

export function getNotifySetupState(): NotifySetupState {
  if (typeof window === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') {
    if (isIosDevice() && !isStandaloneDisplay()) return 'needs_homescreen'
    return 'unsupported'
  }
  if (
    !window.isSecureContext &&
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1'
  ) {
    return 'needs_https'
  }
  if (isIosDevice() && !isStandaloneDisplay()) return 'needs_homescreen'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'enabled'
  return 'ready'
}

export async function ensureNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
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

/** Request permission and return the resulting setup state. */
export async function enableNotifications(): Promise<NotifySetupState> {
  const before = getNotifySetupState()
  if (before === 'unsupported' || before === 'needs_https' || before === 'needs_homescreen') {
    return before
  }
  if (before === 'denied') return 'denied'
  const perm = await ensureNotificationPermission()
  if (perm === 'unsupported') return 'unsupported'
  if (perm === 'denied') return 'denied'
  if (perm === 'granted') return 'enabled'
  return getNotifySetupState()
}

function withBasePath(path: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  if (!path.startsWith('/')) return `${base}/${path}`
  return `${base}${path}`
}

export function maybeNotify(
  title: string,
  body: string,
  opts?: { tag?: string; url?: string },
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  const data = opts?.url ? { url: withBasePath(opts.url) } : undefined
  const tag = opts?.tag

  // Prefer the service worker so alerts still show when the tab is backgrounded.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          body,
          tag,
          data,
          renotify: Boolean(tag),
        }),
      )
      .catch(() => {
        try {
          const n = new Notification(title, { body, tag, data })
          n.onclick = () => {
            window.focus()
            if (data?.url) window.location.href = data.url
            n.close()
          }
        } catch {
          /* ignore */
        }
      })
    return true
  }

  try {
    const n = new Notification(title, { body, tag, data })
    n.onclick = () => {
      window.focus()
      if (data?.url) window.location.href = data.url
      n.close()
    }
    return true
  } catch {
    return false
  }
}

/** Fire a one-off test toast on this device (requires permission). */
export function sendTestNotification(): { ok: true } | { ok: false; error: string } {
  const state = getNotifySetupState()
  if (state === 'unsupported') {
    return { ok: false, error: 'This browser does not support notifications.' }
  }
  if (state === 'needs_homescreen') {
    return {
      ok: false,
      error: 'Add Fundly to your Home Screen, open it from the icon, then try again.',
    }
  }
  if (state === 'needs_https') {
    return { ok: false, error: 'Notifications need HTTPS (or localhost).' }
  }
  if (state === 'denied') {
    return {
      ok: false,
      error: 'Notifications are blocked for this site. Enable them in browser settings.',
    }
  }
  if (state !== 'enabled') {
    return { ok: false, error: 'Enable notifications on this device first, then try Send test again.' }
  }
  const sent = maybeNotify('Fundly test', 'Notifications are working on this device.', {
    tag: 'fundly-test',
  })
  if (!sent) {
    return { ok: false, error: 'Could not show a test notification. Try Enable again.' }
  }
  return { ok: true }
}
