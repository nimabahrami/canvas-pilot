// Interior Modal's 150 ms exit and Filter Grid's scale/removal pattern (MIT).
// https://www.interior.dev/docs/modal · https://www.interior.dev/docs/filter-grid
import { useReducedMotion } from 'motion/react';

export function useSurfaceMotion() {
  const reduced = useReducedMotion();
  return {
    initial: { opacity: 0, scale: reduced ? 1 : .98, y: reduced ? 0 : 6 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: reduced ? 1 : .98, y: reduced ? 0 : 6, transition: { duration: reduced ? 0 : .15, ease: [.4, 0, 1, 1] as const } },
    transition: { duration: reduced ? 0 : .16, ease: [.22, 1, .36, 1] as const },
  };
}
