// Application review form composed from the approved Dialog, Segmented Control and Halo Button.
import { useState } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { formatItems } from '@/lib/formats';
import { applyEnhancedEntries, serializeJournal } from '../../shared/journal.mjs';
import type { EnhancedEntry, Format, JournalEnhancement } from '@/types';

export function JournalEnhancementDialog({ result, format, onFormat, onClose, onCopy, onApply }: {
  result: JournalEnhancement; format: Format; onFormat: (format: Format) => void; onClose: () => void;
  onCopy: (text: string) => Promise<void>; onApply: (entries: EnhancedEntry[]) => Promise<void>;
}) {
  const [entries, setEntries] = useState(result.entries), [view, setView] = useState('preview');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const surface = useSurfaceMotion();
  const journal = serializeJournal({ ...result.session, entries: result.session.entries.map((entry, i) => ({ ...entry, prompt: entries[i].prompt })) }, format);
  return <Dialog open title="Review enhanced journal" description={`${result.session.title} · ${entries.length} saved cards. Screenshot paths and window details are preserved.`} className="enhancement-dialog" onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <div className="enhancement-controls"><SegmentedControl options={[{ value: 'preview', label: 'Preview' }, { value: 'edit', label: 'Edit text' }]} value={view} onValueChange={setView} label="Enhancement view" /><SegmentedControl options={formatItems} value={format} onValueChange={value => onFormat(value as Format)} label="Enhanced journal format" /></div>
    <div className="enhancement-body"><AnimatePresence initial={false} mode="wait"><motion.div key={view} {...surface}>
      {view === 'preview' ? <pre tabIndex={0} aria-label="Enhanced journal preview">{journal}</pre> : entries.map((entry, i) => <label key={entry.id}>Card {i + 1}<textarea aria-label={`Enhanced card ${i + 1}`} value={entry.prompt} rows={4} maxLength={100000} disabled={saving} onChange={event => setEntries(current => current.map(item => item.id === entry.id ? { ...item, prompt: event.target.value } : item))} /></label>)}
    </motion.div></AnimatePresence></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="dialog-footer"><Button variant="ghost" disabled={saving} onClick={onClose}>Discard</Button><Button variant="outline" onClick={() => void onCopy(journal)}><Copy />Copy {format.toUpperCase()}</Button><Button disabled={saving} onClick={async () => { setSaving(true); setError(''); try { applyEnhancedEntries(result.session, entries); await onApply(entries); } catch (error) { setError((error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setSaving(false); } }}>{saving && <LoaderCircle className="animate-spin" />}Use enhanced journal</Button></div>
  </Dialog>;
}
