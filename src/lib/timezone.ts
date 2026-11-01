/** Device IANA timezone detection + common-zone picker helpers. */

const FALLBACK_ZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'UTC',
]

export function listTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone')
    if (Array.isArray(supported) && supported.length > 0) {
      return [...supported].sort((a, b) => a.localeCompare(b))
    }
  } catch {
    /* older engines */
  }
  return [...FALLBACK_ZONES]
}

export function isValidTimeZone(tz: string): boolean {
  const id = tz.trim()
  if (!id) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: id }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Detect device timezone. Returns null if detection fails. */
export function detectDeviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && isValidTimeZone(tz)) return tz
  } catch {
    /* ignore */
  }
  return null
}

/** YYYY-MM-DD for `date` (or now) in the given IANA zone. */
export function zonedDateISO(timeZone: string, date: Date = new Date()): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/Chicago'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

/** Weekday 0=Sun … 6=Sat in the given IANA zone. */
export function zonedWeekday(timeZone: string, date: Date = new Date()): number {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/Chicago'
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[wd] ?? 0
}

/** ISO week key like 2026-W44 in the given zone (for weekly-review dedupe). */
export function zonedIsoWeekKey(timeZone: string, date: Date = new Date()): string {
  const iso = zonedDateISO(timeZone, date)
  const [ys, ms, ds] = iso.split('-').map(Number)
  const local = new Date(ys!, ms! - 1, ds!)
  // ISO week: Thursday-based
  const day = (local.getDay() + 6) % 7
  local.setDate(local.getDate() - day + 3)
  const week1 = new Date(local.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((local.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  return `${local.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const day = dt.getDate()
  dt.setMonth(dt.getMonth() + months)
  // Clamp end-of-month overflow
  if (dt.getDate() < day) dt.setDate(0)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function compareISODate(a: string, b: string): number {
  return a.localeCompare(b)
}
