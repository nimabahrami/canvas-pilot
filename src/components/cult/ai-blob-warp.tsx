// Source: https://www.cult-ui.com/docs/components/ai-blob-warp · MIT. App adaptations documented in docs/UI-SOURCES.md.
"use client"

import { forwardRef, useCallback, useEffect, useState, useRef, type ComponentProps, type ComponentRef } from "react"
import { Warp, type WarpProps } from "@paper-design/shaders-react"
import { motion, useInView, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

const DEFAULT_WARP: Partial<WarpProps> = {
  /** Same stops as the main glow in `halo-search.tsx` (90deg linear-gradient). */
  colors: ["#ff0080", "#7928ca", "#00d4ff", "#0070f3"],
  distortion: 0.25,
  height: "100%",
  proportion: 0.54,
  scale: 0.2,
  shape: "checks",
  shapeScale: 1,
  softness: 1,
  speed: 1,
  swirl: 0.8,
  swirlIterations: 10,
  width: "100%",
}

export type AiBlobWarpAvatarProps = Omit<ComponentProps<"div">, "children"> & {
  /** Props forwarded to the Paper `Warp` shader (merged after defaults). */
  warpProps?: Partial<WarpProps>
  active?: boolean
}

/**
 * Circular avatar frame with an animated Warp shader inside.
 * Motion uses transforms only; shader speed pauses off-screen and when `prefers-reduced-motion` is set.
 */
export const AiBlobWarpAvatar = forwardRef<
  HTMLDivElement,
  AiBlobWarpAvatarProps
>(function AiBlobWarpAvatarImpl(
  { className, warpProps, active = false, onPointerMove, ...props },
  forwardedRef
) {
  const {
    className: warpClassName,
    speed: warpSpeed,
    ...restWarpProps
  } = warpProps ?? {}
  const rootRef = useRef<HTMLDivElement>(null)
  const shaderRef = useRef<ComponentRef<typeof Warp>>(null)
  const [reduceMotion, setReduceMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const inView = useInView(rootRef, {
    amount: 0.2,
    margin: "0px",
  })
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", update); return () => document.removeEventListener("visibilitychange", update); }, [])
  const live = inView && !reduceMotion && visible

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef]
  )

  const baseSpeed = warpSpeed ?? DEFAULT_WARP.speed ?? 1
  const steerX = useSpring(0, { stiffness: 220, damping: 24, mass: .45 })
  const steerY = useSpring(0, { stiffness: 220, damping: 24, mass: .45 })
  const driftTime = useRef(0)
  useEffect(() => {
    if (!active) { steerX.set(0); steerY.set(0) }
  }, [active, steerX, steerY])
  useEffect(() => {
    if (!live) { steerX.jump(0); steerY.jump(0); return }
    let frame: number, previous = performance.now()
    // Blend a slow autonomous drift with pointer steering without React frame updates.
    const drift = (now: number) => {
      driftTime.current += Math.min(now - previous, 64) / 1000
      previous = now
      const phase = driftTime.current * Math.PI * 2 / 18
      shaderRef.current?.paperShaderMount?.setUniforms({
        u_offsetX: (restWarpProps.offsetX ?? 0) + Math.sin(phase) * .055 + steerX.get() * .12,
        u_offsetY: (restWarpProps.offsetY ?? 0) + Math.sin(phase * .73) * .04 - steerY.get() * .12,
        u_rotation: (restWarpProps.rotation ?? 0) + Math.sin(phase * .61) * 7 + steerX.get() * 12,
      })
      frame = requestAnimationFrame(drift)
    }
    frame = requestAnimationFrame(drift)
    return () => cancelAnimationFrame(frame)
  }, [live, restWarpProps.offsetX, restWarpProps.offsetY, restWarpProps.rotation, steerX, steerY])

  return (
    <div
      className={cn(
        "relative isolate size-8 overflow-hidden rounded-full border border-border/10 bg-muted",
        className
      )}
      ref={setRefs}
      {...props}
      data-live={live}
      data-active={active}
      onPointerMove={event => {
        onPointerMove?.(event)
        if (!live || !active) return
        const bounds = event.currentTarget.getBoundingClientRect()
        steerX.set(Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)))
        steerY.set(Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)))
      }}
    >
      <motion.div
        animate={
          live
            ? {
                scale: [1, 1.055, 0.99, 1],
                rotate: [0, 2, -1.5, 0],
              }
            : { scale: 1, rotate: 0 }
        }
        aria-hidden
        className="pointer-events-none absolute inset-0 origin-center rounded-full"
        transition={live ? {
          duration: 5.2,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
        } : { duration: 0 }}
      >
        <Warp
          {...DEFAULT_WARP}
          {...restWarpProps}
          className={warpClassName}
          ref={shaderRef}
          speed={live ? baseSpeed * (active ? 2.8 : 1) : 0}
        />
      </motion.div>
    </div>
  )
})

AiBlobWarpAvatar.displayName = "AiBlobWarpAvatar"
