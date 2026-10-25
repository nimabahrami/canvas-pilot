/**
 * Adapted from Cult UI Halo Button (MIT).
 * https://www.cult-ui.com/docs/components/halo-button
 * Retains the capsule, frosted fill and multicolor gradient rim. Hover runs
 * the rim and a brief sheen; press responds immediately. No idle rim loop.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
export const HaloButton = forwardRef<HTMLButtonElement, ButtonProps>(function HaloButton({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) {
  return <ButtonPrimitive ref={ref} type={type} className={cn('halo-button', `halo-${variant}`, `halo-${size}`, className)} {...props} />;
});
