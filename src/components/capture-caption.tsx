import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSurfaceMotion } from './interior/surface-motion';
import { ArrowLeft, Maximize2, Minimize2, Pencil, X } from 'lucide-react';
import { Button } from './ui/button';
import { PromptComposer } from './cult/prompt-composer';
import { AnnotationEditor } from './annotation-editor';
import type { DraftImage } from '@/types';
import { writeLocal } from '@/lib/database';

export function CaptureCaption({ image: original, sessionId, sessionTitle, onSave, onCancel, onResize }: { image: DraftImage; sessionId?: string; sessionTitle: string; onSave: (image: DraftImage, caption: string) => Promise<void>; onCancel: () => void; onResize: (editing: boolean, expanded: boolean) => Promise<void> }) {
  const surface = useSurfaceMotion();
  const [image, setImage] = useState(original), [caption, setCaption] = useState('');
  const [editing, setEditing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false), [resizing, setResizing] = useState(false);
  const pendingWrite = useRef(Promise.resolve());
  useEffect(() => { pendingWrite.current = pendingWrite.current.catch(() => {}).then(() => writeLocal('pending-capture', { image, caption, sessionId, sessionTitle })); pendingWrite.current.catch(() => setError('This caption could not be backed up. Keep the popup open until it is saved.')); }, [image, caption, sessionId, sessionTitle]);
  const edit = async (value: boolean, enlarge = false) => {
    if (resizing) return;
    setResizing(true);
    try { await onResize(value, enlarge); setEditing(value); setExpanded(enlarge); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setResizing(false); }
  };
  const save = async () => { if (saving) return; setSaving(true); setError(''); try { await pendingWrite.current.catch(() => {}); await onSave(image, caption); } catch (error) { setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)); setSaving(false); } };
  const discard = async () => { await pendingWrite.current.catch(() => {}); await writeLocal('pending-capture', null); onCancel(); };
  return <section className={`capture-card${editing ? ' capture-card-editing' : ''}${expanded ? ' capture-card-expanded' : ''}`} aria-label="Capture caption">
    <header>{editing && <Button variant="ghost" size="icon" aria-label="Back to caption" disabled={resizing} onClick={() => void edit(false)}><ArrowLeft /></Button>}<div><strong>{editing ? 'Markup' : 'Caption'}</strong><span title={sessionTitle}>{sessionTitle}</span></div>{editing && <Button variant="ghost" size="icon" aria-label={expanded ? 'Reduce editor' : 'Enlarge editor'} title={expanded ? 'Compact editor' : 'Enlarge editor'} aria-pressed={expanded} disabled={resizing} onClick={() => void edit(true, !expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>}<Button variant="ghost" size="icon" aria-label="Discard capture" disabled={saving} onClick={() => { void discard().catch(error => setError(String(error))); }}><X /></Button></header>
    <AnimatePresence initial={false} mode="wait">{editing ? <motion.div key="markup" {...surface} className="capture-markup-body"><AnnotationEditor image={image} onApply={async value => { setImage(value); await edit(false); }} /></motion.div> : <motion.div key="caption" {...surface} className="capture-card-body">
      <div className="capture-card-preview"><Button variant="ghost" className="capture-preview-open" aria-label="Enlarge screenshot" title="Click to enlarge and annotate" disabled={saving || resizing} onClick={() => void edit(true, true)}><img src={image.dataUrl} alt="Selected screenshot" /><span className="capture-enlarge-hint"><Maximize2 />Enlarge</span></Button><Button className="capture-preview-markup" variant="outline" aria-label="Markup screenshot" disabled={saving || resizing} onClick={() => void edit(true)}><Pencil />Markup</Button></div>
      <p className="capture-card-source" title={image.context?.title}>{image.context?.title}</p>
      <PromptComposer label="Capture caption" autoFocus value={caption} onChange={setCaption} onSubmit={() => void save()} busy={saving} enhancing={false} hasImages />
      {error && <p role="alert" className="error-message">{error}</p>}
    </motion.div>}</AnimatePresence>
    {editing && error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
