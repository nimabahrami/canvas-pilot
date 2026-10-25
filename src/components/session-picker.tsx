// Application session navigation composed from Interior Popover and approved primitives.
import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { BookOpen, Check, ChevronDown, Layers, Plus, Search, Trash2 } from 'lucide-react';
import { Popover } from '@/components/interior/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Session } from '@/types';

export const SessionPicker = memo(function SessionPicker({ sessions, selected, disabled, onSelect, onDelete }: { sessions: Session[]; selected: string | null; disabled: boolean; onSelect: (id: string | null) => void; onDelete: (session: Session) => void }) {
  const surface = useSurfaceMotion();
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const choose = (id: string | null) => { onSelect(id); setOpen(false); };
  const filtered = useMemo(() => sessions.filter(session => `${session.title} ${session.entries.map(entry => entry.prompt + entry.images.map(image => image.context?.title).join(' ')).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [sessions, query]);
  return <Popover label="Sessions" trigger={<><Layers /><span>Sessions</span><ChevronDown /></>} align="start" open={open} onOpenChange={value => { setOpen(value); if (value) setQuery(''); }} triggerClassName="sessions-trigger" className="sessions-popover">
    <div className="session-search"><Search /><Input aria-label="Search sessions" placeholder="Find a session…" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <Button variant="outline" className="new-session" onClick={() => choose(null)} disabled={disabled}><Plus /> New session</Button>
    <nav className="session-list" aria-label="Sessions">
      <AnimatePresence initial={false} mode="popLayout">{filtered.map(session => <motion.div className="session-picker-row" layout="position" key={session.id} {...surface}><Button variant="ghost" className={`session-item ${selected === session.id ? 'active' : ''}`} aria-current={selected === session.id ? 'page' : undefined} disabled={disabled} onClick={() => choose(session.id)}><BookOpen /><span><strong>{session.title}</strong><small>{session.entries.length} {session.entries.length === 1 ? 'card' : 'cards'} · {new Date(session.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></span>{selected === session.id && <Check />}</Button><Button variant="ghost" size="icon" className="session-delete" aria-label={`Delete session ${session.title}`} title="Delete session" disabled={disabled} onClick={() => { setOpen(false); onDelete(session); }}><Trash2 /></Button></motion.div>)}</AnimatePresence>
      {!filtered.length && <p className="session-list-empty">{query ? 'No matching sessions.' : 'Your saved sessions will appear here.'}</p>}
    </nav>
  </Popover>;
});
