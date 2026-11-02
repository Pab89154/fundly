import { useEffect, useRef } from 'react'

type Props = {
  /** Re-fire when this changes (e.g. celebration cents). */
  fireKey: string | number
  /** Goal-complete uses denser / longer blast. */
  intense?: boolean
  /** Final goal unlock — multi-wave full-screen confetti. */
  finale?: boolean
  className?: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  life: number
  round?: boolean
}

const COLORS = ['#30d158', '#64d2ff', '#ff9f0a', '#ff6b8a', '#f4f5f7', '#a78bfa']
const FINALE_COLORS = ['#30d158', '#39FF14', '#5eea8a', '#f4f5f7', '#64d2ff', '#ffd60a', '#ffffff']

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function makeBurst(
  cx: number,
  cy: number,
  count: number,
  intense: boolean,
  finale: boolean,
  palette: string[],
): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2
    const speed =
      (finale ? 9 : intense ? 7 : 5) + Math.random() * (finale ? 14 : intense ? 9 : 6)
    return {
      x: cx + (Math.random() - 0.5) * (finale ? 120 : 40),
      y: cy + (Math.random() - 0.5) * (finale ? 60 : 20),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (finale ? 10 : intense ? 6 : 4),
      w: (finale ? 5 : 4) + Math.random() * (finale ? 8 : 5),
      h: (finale ? 7 : 6) + Math.random() * (finale ? 12 : 8),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * (finale ? 0.5 : 0.35),
      color: palette[Math.floor(Math.random() * palette.length)]!,
      life: 1,
      round: finale && i % 3 === 0,
    }
  })
}

/** Lightweight canvas confetti — no npm deps. */
export function ConfettiBurst({ fireKey, intense = false, finale = false, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let alive = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const palette = finale ? FINALE_COLORS : COLORS
    const count = finale ? 220 : intense ? 140 : 80
    const duration = finale ? 4800 : intense ? 2200 : 1600
    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight * (finale ? 0.42 : 0.35)
    const particles = makeBurst(cx, cy, count, intense, finale, palette)

    if (finale) {
      particles.push(
        ...makeBurst(0, canvas.clientHeight * 0.7, 70, true, true, palette),
        ...makeBurst(canvas.clientWidth, canvas.clientHeight * 0.7, 70, true, true, palette),
        ...makeBurst(cx, canvas.clientHeight * 0.15, 60, true, true, palette),
      )
    }

    const start = performance.now()
    let secondWave = false
    const tick = (now: number) => {
      if (!alive) return
      const elapsed = now - start
      const t = elapsed / duration
      if (finale && !secondWave && elapsed > 900) {
        secondWave = true
        particles.push(...makeBurst(cx, cy, 120, true, true, palette))
      }
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.vy += finale ? 0.14 : 0.18
        p.vx *= 0.995
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - t)
        if (p.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = Math.min(1, p.life * 1.2)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.round) {
          ctx.beginPath()
          ctx.arc(0, 0, p.w * 0.55, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }
      if (t < 1) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [fireKey, intense, finale])

  if (prefersReducedMotion()) return null

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  )
}
