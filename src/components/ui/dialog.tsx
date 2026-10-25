// Kokonut’s Radix primitive family with Interior Modal motion. See docs/UI-SOURCES.md.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useIsPresent } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
export function Dialog({ open, onOpenChange, onEscapeKeyDown, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; onEscapeKeyDown?: (event: KeyboardEvent) => void; title: string; description?: string; children: React.ReactNode; className?: string }) {
  const present = useIsPresent(), surface = useSurfaceMotion();
  return <DialogPrimitive.Root open={open && present} onOpenChange={onOpenChange}><DialogPrimitive.Portal forceMount>
    <DialogPrimitive.Overlay forceMount asChild><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={surface.transition} className="dialog-overlay" /></DialogPrimitive.Overlay>
    <DialogPrimitive.Content forceMount asChild onEscapeKeyDown={onEscapeKeyDown} {...(!description ? { 'aria-describedby': undefined } : {})}><motion.div {...surface} data-closing={!present || undefined} className={cn('dialog-content', className)}>
      <div className="dialog-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description>{description}</DialogPrimitive.Description>}</div>
        <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close dialog"><X /></Button></DialogPrimitive.Close>
      </div>{children}
    </motion.div></DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
