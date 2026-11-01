import { useEffect, useRef } from 'react'

type Props = {
  /** Re-fire when this changes (e.g. celebration cents). */
  fireKey: string | number
  /** Goal-complete uses denser / longer blast. */
  intense?: boolean
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
}

const COLORS = ['#30d158', '#64d2ff', '#ff9f0a', '#ff6b8a', '#f4f5f7', '#a78bfa']

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Lightweight canvas confetti — no npm deps. */
export function ConfettiBurst({ fireKey, intense = false, className = '' }: Props) {
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

    const count = intense ? 140 : 80
    const duration = intense ? 2200 : 1600
    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight * 0.35
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = (intense ? 7 : 5) + Math.random() * (intense ? 9 : 6)
      return {
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (intense ? 6 : 4),
        w: 4 + Math.random() * 5,
        h: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        life: 1,
      }
    })

    const start = performance.now()
    const tick = (now: number) => {
      if (!alive) return
      const t = (now - start) / duration
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.vy += 0.18
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - t)
        if (p.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
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
  }, [fireKey, intense])

  if (prefersReducedMotion()) return null

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  )
}
