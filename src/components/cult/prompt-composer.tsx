/**
 * Adapted from Cult UI Prompt Composer (MIT).
 * https://www.cult-ui.com/docs/components/prompt-composer
 * Controlled journal draft, a one-line idle capsule, content-driven height and
 * immediate actions replace the demo's permanent four rows and staggered text.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { Plus, Paperclip, Undo2, LoaderCircle } from 'lucide-react';
import { HaloButton } from './halo-button';

export function PromptComposer({ value, onChange, onSubmit, onAttach, busy, enhancing, hasImages, original, onUndo, autoFocus = false, label = 'Your prompt' }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  onAttach?: () => void; busy: boolean; enhancing: boolean; hasImages: boolean; original?: string; onUndo?: () => void; autoFocus?: boolean; label?: string;
}) {
  const surface = useSurfaceMotion();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false), [tall, setTall] = useState(false);
  useLayoutEffect(() => {
    const el = textarea.current; if (!el) return;
    const previousHeight = el.getBoundingClientRect().height;
    el.style.transition = 'none';
    el.style.height = '24px';
    const height = Math.min(176, el.scrollHeight);
    el.style.height = `${previousHeight}px`;
    void el.offsetHeight;
    el.style.transition = '';
    el.style.height = `${height}px`; setTall(height > 28);
  }, [value]);
  const active = focused || !!value || hasImages;
  return <div className={`prompt-composer ${tall ? 'is-multiline' : ''} ${active ? 'is-active' : ''}`}>
    <div className="prompt-capsule">
      <textarea id="user-prompt" aria-label={label} autoFocus={autoFocus} ref={textarea} rows={1} value={value} maxLength={50000} disabled={busy || enhancing} placeholder="Add a caption or note…" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={e => onChange(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); } }} />
      {onAttach && <HaloButton variant="ghost" size="icon" aria-label="Import image" title="Import image" disabled={busy} onClick={onAttach}><Paperclip /></HaloButton>}
      <HaloButton size="icon" className="send-prompt" aria-label="Add to journal" title="Add card · ⌘ Enter" disabled={busy || enhancing || (!value.trim() && !hasImages)} onClick={onSubmit}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />}</HaloButton>
    </div>
    <AnimatePresence initial={false}>{active && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 22, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={surface.transition} className="prompt-context-actions"><span>{enhancing ? 'Enhancing journal…' : `${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} Enter to save`}</span><div>{original && <HaloButton variant="ghost" size="icon" aria-label="Restore original prompt" onClick={onUndo}><Undo2 /></HaloButton>}</div></motion.div>}</AnimatePresence>
  </div>;
}
