// Capture destination form composed from Interior Popover and the shared Cult controls.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, ChevronDown, Layers, LoaderCircle, Plus, Search } from 'lucide-react';
import { Popover } from './interior/popover';
import { useSurfaceMotion } from './interior/surface-motion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { CaptureSession, CaptureTarget } from '@/types';

export function CaptureSessionPicker({ target, onSelect, loadSessions, disabled }: {
  target: CaptureTarget; onSelect: (target: CaptureTarget) => void;
  loadSessions: () => Promise<CaptureSession[]>; disabled: boolean;
}) {
  const surface = useSurfaceMotion();
  const [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<CaptureSession[]>([]), [query, setQuery] = useState(''), [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError('');
    loadSessions().then(values => { if (active) setSessions(values); }).catch(error => {
      if (active) setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, loadSessions, retry]);
  const choose = (value: CaptureTarget) => { if (!disabled) { onSelect(value); setOpen(false); } };
  const label = sessions.find(session => session.id === target.sessionId)?.title || target.sessionTitle || 'New session';
  const filtered = sessions.filter(session => session.title.toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover label="Save to session" trigger={<><Layers /><span title={label}>{label}</span><ChevronDown /></>} disabled={disabled}
    open={open} onOpenChange={value => { setOpen(value); if (value) { setQuery(''); setCreating(false); setLoading(true); } }}
    align="start" triggerClassName="capture-session-trigger" className="sessions-popover capture-sessions-popover">
    <AnimatePresence initial={false} mode="wait">{creating ? <motion.form key="new" {...surface} className="capture-new-session" onSubmit={event => { event.preventDefault(); choose({ sessionTitle: title.trim() }); }}>
      <label htmlFor="capture-session-name">New session</label>
      <Input id="capture-session-name" aria-label="New session name" autoFocus maxLength={120} value={title} disabled={disabled} onChange={event => setTitle(event.target.value)} placeholder="Name this session…" />
      <p>Leave blank to use your caption. Created when you save the capture.</p>
      <div><Button variant="ghost" disabled={disabled} onClick={() => setCreating(false)}>Back</Button><Button aria-label="Use new session" disabled={disabled} type="submit"><Check />Use session</Button></div>
    </motion.form> : <motion.div key="sessions" {...surface}>
      <div className="session-search"><Search /><Input aria-label="Search capture sessions" placeholder="Find a session…" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} /></div>
      <Button variant="outline" className="new-session" disabled={disabled} onClick={() => { setTitle(target.sessionId ? '' : target.sessionTitle); setCreating(true); }}><Plus />New session</Button>
      {loading ? <p role="status" className="capture-sessions-status"><LoaderCircle className="animate-spin" />Loading sessions…</p> : error ? <div><p role="alert" className="error-message">{error}</p><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Try again</Button></div> : <nav aria-label="Capture sessions" className="session-list">
        <AnimatePresence initial={false}>{filtered.map(session => <motion.div key={session.id} {...surface}>
          <Button variant="ghost" className={`session-item${target.sessionId === session.id ? ' active' : ''}`} aria-current={target.sessionId === session.id ? 'true' : undefined} disabled={disabled}
            onClick={() => choose({ sessionId: session.id, sessionTitle: session.title })}>
            <BookOpen /><span><strong title={session.title}>{session.title}</strong><small>{session.entries} {session.entries === 1 ? 'card' : 'cards'} · {new Date(session.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></span>{target.sessionId === session.id && <Check />}
          </Button>
        </motion.div>)}</AnimatePresence>
        {!filtered.length && <p className="session-list-empty">{query ? 'No matching sessions.' : 'Your saved sessions will appear here.'}</p>}
      </nav>}
    </motion.div>}</AnimatePresence>
  </Popover>;
}
