/** Soft expanding highlight “pop” — same feel as PrintX.
 *
 * Targets `.btn` and `.press-pop`. Uses a real ripple node (not classNames) so
 * React re-renders cannot wipe the animation mid-flight.
 */

const TARGET = '.btn, .press-pop'
const POP_MS = 480
const RIPPLE_CLASS = 'press-pop-ripple'

let pressedBtn: HTMLElement | null = null

function closestTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const el = target.closest(TARGET)
  if (!(el instanceof HTMLElement)) return null
  if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return null
  return el
}

function ensureHostStyles(btn: HTMLElement) {
  const style = getComputedStyle(btn)
  if (style.position === 'static') btn.style.position = 'relative'
  if (style.overflow === 'visible') btn.style.overflow = 'hidden'
}

function clearRipples(btn: HTMLElement) {
  btn.querySelectorAll(`.${RIPPLE_CLASS}`).forEach((node) => node.remove())
}

function spawnRipple(
  btn: HTMLElement,
  clientX: number,
  clientY: number,
  kind: 'press' | 'bloom',
) {
  ensureHostStyles(btn)
  const rect = btn.getBoundingClientRect()
  const size = Math.max(rect.width * 1.05, rect.height * 2.8) * (kind === 'bloom' ? 1.45 : 1)
  const x = clientX - rect.left
  const y = clientY - rect.top

  const ripple = document.createElement('span')
  ripple.className = `${RIPPLE_CLASS} ${RIPPLE_CLASS}--${kind}`
  ripple.setAttribute('aria-hidden', 'true')
  ripple.style.width = `${size}px`
  ripple.style.height = `${size}px`
  ripple.style.left = `${x}px`
  ripple.style.top = `${y}px`
  btn.appendChild(ripple)

  void ripple.offsetWidth
  ripple.classList.add('is-on')

  ripple.addEventListener(
    'animationend',
    () => {
      ripple.remove()
    },
    { once: true },
  )

  return ripple
}

function pressIn(btn: HTMLElement, clientX: number, clientY: number) {
  clearRipples(btn)
  btn.dataset.btnPop = 'pressing'
  spawnRipple(btn, clientX, clientY, 'press')
}

function releasePop(btn: HTMLElement, clientX: number, clientY: number) {
  btn.dataset.btnPop = 'popping'
  spawnRipple(btn, clientX, clientY, 'bloom')
  window.setTimeout(() => {
    if (btn.dataset.btnPop === 'popping') delete btn.dataset.btnPop
  }, POP_MS)
}

export function installButtonPop() {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      const btn = closestTarget(e.target)
      if (!btn) return
      pressedBtn = btn
      pressIn(btn, e.clientX, e.clientY)
    },
    { passive: true },
  )

  document.addEventListener(
    'pointerup',
    (e) => {
      if (!pressedBtn) return
      const btn = pressedBtn
      pressedBtn = null
      releasePop(btn, e.clientX, e.clientY)
    },
    { passive: true },
  )

  document.addEventListener(
    'pointercancel',
    () => {
      if (!pressedBtn) return
      clearRipples(pressedBtn)
      delete pressedBtn.dataset.btnPop
      pressedBtn = null
    },
    { passive: true },
  )
}
