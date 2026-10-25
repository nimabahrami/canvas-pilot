// Source: https://www.cult-ui.com/docs/components/edge-blur · MIT. App adaptations documented in docs/UI-SOURCES.md.
"use client"

interface EdgeBlurProps {
  position?: "top" | "bottom"
  height?: number
  className?: string
}

export function EdgeBlur({ position = "bottom", height = 75, className = "" }: EdgeBlurProps) {
  const blurLayers = [1, 2, 3, 6, 12]

  const isTop = position === "top"

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 isolate ${className}`}
      style={{ height, [isTop ? "top" : "bottom"]: 0 }}
    >
      {blurLayers.map((blur) => (
        <div
          key={blur}
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`,
            WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`,
          }}
        />
      ))}
    </div>
  )
}

// Convenience exports for specific positions
export function TopBlur({ height = 75 }: { height?: number }) {
  return <EdgeBlur position="top" height={height} />
}

export function BottomBlur({ height = 75 }: { height?: number }) {
  return <EdgeBlur position="bottom" height={height} />
}
