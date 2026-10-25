// App-specific inline form composed from the approved Input and Halo Button primitives.
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { Pencil, Check, X, LoaderCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SessionName({ title, onSave }: { title: string; onSave: (title: string) => Promise<void> }) {
  const surface = useSurfaceMotion();
  const transition = { ...surface.transition, duration: surface.transition.duration ? .08 : 0 };
  const [open, setOpen] = useState(false), [value, setValue] = useState(title), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const wasEditing = useRef(false);
  const close = () => { if (!busy) { setOpen(false); setError(''); } };
  return <div className="session-name" data-editing={open}>
    <AnimatePresence initial={false} mode="wait">{open ? <motion.form key="edit" {...surface} transition={transition} exit={{ ...surface.exit, transition }} aria-label="Rename session" onSubmit={async e => {
      e.preventDefault(); if (!value.trim() || busy) return;
      setBusy(true); try { await onSave(value.trim()); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    }} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <Input autoFocus onFocus={event => event.currentTarget.select()} aria-label="Session name" maxLength={120} value={value} readOnly={busy} onChange={e => setValue(e.target.value)} placeholder="Name this session" />
      <Button variant="ghost" size="icon" aria-label="Cancel rename" title="Cancel · Esc" disabled={busy} onClick={close}><X /></Button>
      <Button size="icon" aria-label="Save name" title="Save · Enter" disabled={busy || !value.trim()} type="submit">{busy ? <LoaderCircle className="animate-spin" /> : <Check />}</Button>
    </motion.form> : <motion.h1 aria-label={title || 'Untitled session'} key="title" {...surface} transition={transition} exit={{ ...surface.exit, transition }}><Button autoFocus={wasEditing.current} variant="ghost" className="session-name-trigger" aria-label="Rename session" title={title || 'Rename session'} onClick={() => { wasEditing.current = true; setValue(title); setError(''); setOpen(true); }}><span>{title || 'Untitled session'}</span><Pencil /></Button></motion.h1>}</AnimatePresence>
    {error && <p role="alert" className="rename-error">{error}</p>}
  </div>;
}
