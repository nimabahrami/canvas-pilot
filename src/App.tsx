import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scan, RefreshCw, Settings as SettingsIcon, ChevronRight, FolderOpen, Copy, Download, Check, X, ArrowUpRight, Sparkles, Minimize2, AppWindow, Pencil, Trash2, LoaderCircle, ShieldCheck, Info } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { Popover } from '@/components/interior/popover';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { EdgeBlur } from '@/components/cult/edge-blur';
import { SessionName } from '@/components/session-name';
import { SessionPicker } from '@/components/session-picker';
import { JournalEnhancementDialog } from '@/components/journal-enhancement';
import { CapturePermissionDialog } from '@/components/capture-permission-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import FileUpload from '@/components/kokonutui/file-upload';
import { PromptComposer } from '@/components/cult/prompt-composer';
import { JournalEnhancer } from '@/components/journal-enhancer';
import { AnnotationEditor } from '@/components/annotation-editor';
import { RegionPicker, cropImage } from '@/components/region-picker';
import { SettingsDialog } from '@/components/settings-dialog';
import { formatItems } from '@/lib/formats';
import { api, imageFromFile, imageFromSource } from '@/lib/bridge';
import { readLocal, writeLocal } from '@/lib/database';
import { serializeJournal, suggestTitle } from '../shared/journal.mjs';
import type { CaptionDraft, CaptureResult, CaptureSource, DraftImage, Entry, Format, JournalEnhancement, Session, Settings } from '@/types';

interface Draft { title: string; prompt: string; images: DraftImage[]; original?: string }
const emptyDraft = (): Draft => ({ title: '', prompt: '', images: [] });
const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const cleanError = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');

function SavedThumbnail({ sessionId, image, onOpen }: { sessionId: string; image: Entry['images'][number]; onOpen: () => void }) {
  const [source, setSource] = useState(''), [error, setError] = useState(false);
  useEffect(() => { let valid = true; api.image(sessionId, image.id).then(value => { if (valid) setSource(value); }).catch(() => { if (valid) setError(true); }); return () => { valid = false; }; }, [sessionId, image.id, image.revision]);
  return <Button variant="ghost" className="saved-image" disabled={!source} onClick={onOpen} aria-label={`Edit screenshot from ${image.context?.title ?? image.name}`}>
    {source ? <img src={source} alt={`Annotated capture of ${image.context?.title ?? image.name}`} loading="lazy" /> : <span>{error ? 'Image unavailable' : <LoaderCircle className="animate-spin" />}</span>}
    <span className="saved-image-edit"><Pencil />Edit</span>
  </Button>;
}

export default function App() {
  const surface = useSurfaceMotion();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]), [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [ready, setReady] = useState(false), [format, setFormat] = useState<Format>('md');
  const [exportOpen, setExportOpen] = useState(false);
  const [enhancement, setEnhancement] = useState<JournalEnhancement | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false), [showImport, setShowImport] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ image: DraftImage; key: string; savedId?: string } | null>(null);
  const [sources, setSources] = useState<{ values: CaptureSource[]; key: string } | null>(null), [sourceKind, setSourceKind] = useState('window'), [sourceSearch, setSourceSearch] = useState('');
  const [crop, setCrop] = useState<{ capture: CaptureResult; key: string } | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null), [removeEntry, setRemoveEntry] = useState<{ session: Session; entry: Entry } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false), [deleteError, setDeleteError] = useState('');
  useEffect(() => setDeleteError(''), [deleting]);
  const [removingEntryBusy, setRemovingEntryBusy] = useState(false), [removeEntryError, setRemoveEntryError] = useState('');
  useEffect(() => setRemoveEntryError(''), [removeEntry]);
  const [saving, setSaving] = useState(false), [capturing, setCapturing] = useState(false), [enhancing, setEnhancing] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null), [startupError, setStartupError] = useState('');
  const [draftStatus, setDraftStatus] = useState('Draft saved');
  const [journalScrolled, setJournalScrolled] = useState(false);
  const draftWrite = useRef(Promise.resolve());
  const journalScroll = useRef<HTMLElement>(null);
  const session = sessions.find(s => s.id === selected);
  const draftKey = selected ?? 'new', draft = drafts[draftKey] ?? emptyDraft();
  const selectedRef = useRef(draftKey); selectedRef.current = draftKey;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((text: string, error = false) => { setToast({ text, error }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), error ? 9000 : 3500); }, []);
  const fail = useCallback((error: unknown) => notify(cleanError(error), true), [notify]);
  const changeDraft = useCallback((key: string, patch: Partial<Draft> | ((draft: Draft) => Draft)) => setDrafts(current => ({ ...current, [key]: typeof patch === 'function' ? patch(current[key] ?? emptyDraft()) : { ...(current[key] ?? emptyDraft()), ...patch } })), []);

  useEffect(() => {
    Promise.all([api.init(), readLocal<Record<string, Draft>>('drafts'), readLocal<CaptionDraft>('pending-capture')]).then(async ([initial, local, pending]) => {
      if (pending) {
        const committed = initial.sessions.some(session => session.entries.some(entry => entry.images.some(image => image.context?.capturedAt === pending.image.context?.capturedAt && image.context?.title === pending.image.context?.title)));
        if (!committed) {
          const key = initial.sessions.some(session => session.id === pending.sessionId) ? pending.sessionId! : 'new';
          local ??= {}; const previous = local[key] ?? emptyDraft();
          local[key] = previous.images.some(image => image.id === pending.image.id) ? previous : { ...previous, title: previous.title || pending.sessionTitle, prompt: [previous.prompt, pending.caption].filter(Boolean).join('\n\n'), images: [...previous.images, pending.image] };
          await writeLocal('drafts', local); setSelected(key === 'new' ? null : key);
        }
        await writeLocal('pending-capture', null);
      }
      setSessions(initial.sessions); setSettings(initial.settings); setFormat(initial.settings.format); if (local) setDrafts(local); setReady(true);
    }).catch(error => setStartupError(cleanError(error)));
  }, []);
  useEffect(() => {
    if (!ready) return;
    setDraftStatus('Saving draft…');
    draftWrite.current = draftWrite.current.catch(() => {}).then(() => writeLocal('drafts', drafts));
    const current = draftWrite.current;
    current.then(() => { if (draftWrite.current === current) setDraftStatus('Draft saved'); }).catch(() => { setDraftStatus('Draft not saved'); notify('Could not save this draft locally. Keep the app open and export your work.', true); });
  }, [drafts, ready, notify]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const area = journalScroll.current;
    if (area) { area.scrollTo({ top: area.scrollHeight }); setJournalScrolled(area.scrollTop > 2); }
  }, [selected, session?.entries.length]);
  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',' && !document.querySelector('[role="dialog"][aria-modal="true"], button[aria-haspopup="dialog"][aria-expanded="true"]')) {
        event.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', openSettings);
    return () => window.removeEventListener('keydown', openSettings);
  }, []);

  const updateSession = (value: Session) => setSessions(current => [value, ...current.filter(item => item.id !== value.id)]);
  async function append() {
    if (saving || enhancing || (!draft.prompt.trim() && !draft.images.length)) return;
    const key = draftKey, currentDraft = draft;
    setSaving(true);
    try {
      const result = await api.append({ sessionId: selected ?? undefined, title: session?.title || draft.title.trim() || suggestTitle(draft.prompt), prompt: draft.prompt, originalPrompt: draft.original, images: draft.images });
      updateSession(result); changeDraft(key, emptyDraft());
      if (selectedRef.current === key) setSelected(result.id);
      notify(result.exportWarning || 'Entry saved', !!result.exportWarning);
    } catch (error) { changeDraft(key, currentDraft); fail(error); }
    finally { setSaving(false); }
  }
  async function acceptCapture(result: CaptureResult | null, key: string) {
    if (!result) return;
    if (result.savedSession) { updateSession(result.savedSession); if (selectedRef.current === key) setSelected(result.savedSession.id); await writeLocal('pending-capture', null).catch(() => notify('Capture saved; its local draft could not be cleared.', true)); if (result.savedSession.exportWarning) notify(result.savedSession.exportWarning, true); return; }
    if (api.isDesktop) setEditor({ image: { ...await imageFromSource(result.dataUrl), context: result.context }, key });
    else setCrop({ capture: result, key });
  }
  async function pickSource(source: CaptureSource, key: string) {
    setSources(null); setCapturing(true);
    try { await acceptCapture(await api.capture(source.id, { sessionId: key === 'new' ? undefined : key, title: drafts[key]?.title }), key); } catch (error) { if (cleanError(error).includes('SCREEN_PERMISSION')) setPermissionOpen(true); else fail(error); }
    finally { setCapturing(false); }
  }
  async function refreshSources() {
    if (!sources || capturing) return;
    const key = sources.key; setCapturing(true);
    try { const values = await api.captureSources(); setSources(previous => previous?.key === key ? { values, key } : previous); }
    catch (error) { if (cleanError(error).includes('SCREEN_PERMISSION')) { setSources(null); setPermissionOpen(true); } else fail(error); }
    finally { setCapturing(false); }
  }
  const capture = useCallback(async () => {
    if (capturing) return;
    const key = selectedRef.current; setCapturing(true);
    try {
      if (!api.isDesktop) await acceptCapture(await api.capture('browser'), key);
      else {
        const values = await api.captureSources();
        if (!values.length) throw new Error('No windows or displays are available. Open a window, then try again.');
        setSourceKind(values.some(v => v.kind === 'window') ? 'window' : 'screen'); setSourceSearch(''); setSources({ values, key });
      }
    } catch (error) { if (api.isDesktop && cleanError(error).includes('SCREEN_PERMISSION')) setPermissionOpen(true);
      else if (!(error instanceof DOMException && error.name === 'NotAllowedError')) fail(error); }
    finally { setCapturing(false); }
  }, [capturing, fail]);
  const captureBusy = useRef(false);
  useEffect(() => api.onCaptureRequested(() => {
    if (captureBusy.current || capturing || !ready) return;
    captureBusy.current = true;
    const key = selectedRef.current;
    setCapturing(true);
    void api.capture('current', { sessionId: key === 'new' ? undefined : key, title: drafts[key]?.title }).then(result => acceptCapture(result, key)).catch(fail).finally(() => { captureBusy.current = false; setCapturing(false); });
  }), [capturing, ready, drafts, fail]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find(file => file.type.startsWith('image/'));
      if (file && !editor && !showSettings) { event.preventDefault(); const key = selectedRef.current; imageFromFile(file).then(image => setEditor({ image, key })).catch(fail); }
    };
    document.addEventListener('paste', paste); return () => document.removeEventListener('paste', paste);
  }, [editor, showSettings, fail]);
  async function enhance() {
    if (!session?.entries.length || enhancing || saving) return;
    if (!settings || (settings.provider !== 'ollama' && !settings.hasApiKey) || !api.isDesktop) { setShowSettings(true); return; }
    const id = session.id; setEnhancing(true);
    try { setEnhancement(await api.enhance(id, format)); }
    catch (error) { fail(error); } finally { setEnhancing(false); }
  }
  const copy = async (text: string, message = 'Copied to clipboard') => { try { await api.copy(text); notify(message); } catch (error) { fail(error); } };
  const rename = async (title: string) => {
    const key = draftKey, id = session?.id;
    if (id) updateSession(await api.rename(id, title));
    changeDraft(key, { title });
  };
  async function editSaved(sessionId: string, imageId: string) {
    try { const image = await api.imageForEdit(sessionId, imageId); setEditor({ image, key: sessionId, savedId: imageId }); } catch (error) { fail(error); }
  }
  const images = useMemo(() => session?.entries.flatMap(entry => entry.images) ?? [], [session]);
  const journal = useMemo(() => session ? serializeJournal(session, format) : '', [session, format]);

  if (startupError) return <div className="startup-state"><img className="app-logo" src="./logo.png" alt="CanvasPilot" /><h1>Your library could not open</h1><p>{startupError}</p><Button onClick={() => location.reload()}>Try again</Button></div>;
  if (!ready || !settings) return <div className="startup-state"><img className="app-logo pulse" src="./logo.png" alt="CanvasPilot" /><p>Opening your workspace…</p></div>;

  return <MotionConfig reducedMotion="user"><div className="app-shell" data-platform={api.platform}>
    <main className="main-shell">
      <header className="topbar">
        <img className="topbar-logo" src="./logo.png" alt="CanvasPilot" draggable={false} />
        <SessionPicker sessions={sessions} selected={selected} disabled={saving} onSelect={setSelected} onDelete={setDeleting} />
        <div className="topbar-actions">
          <Button className="capture-top" onClick={() => void capture()} disabled={capturing || saving}>{capturing ? <LoaderCircle className="animate-spin" /> : <Scan />}{capturing ? 'Preparing…' : 'Capture area'}</Button>
          <Popover label="Export" trigger={<><Download />Export</>} align="end" open={exportOpen} onOpenChange={setExportOpen} triggerClassName="export-trigger" className="export-card"><div className="popover-heading"><h2>Export journal</h2><Button variant="ghost" size="icon" aria-label="Close export" onClick={() => setExportOpen(false)}><X /></Button></div>
            <SegmentedControl className="format-control" options={formatItems} value={format} onValueChange={value => setFormat(value as Format)} label="Journal export format" />
            <p className="export-note">Annotated screenshot paths and window titles included.</p>
            <div className="export-actions"><Button variant="outline" disabled={!session?.entries.length} onClick={() => void copy(journal, 'Journal copied')}><Copy /> Copy journal</Button><Button className="primary-button" disabled={!session?.entries.length} onClick={async () => { try { const result = await api.exportJournal(session!.id, format); if (result) notify(api.isDesktop ? 'Journal exported' : 'Journal and screenshots downloaded'); } catch (error) { fail(error); } }}><Download /> Save file</Button></div>
            <div className="export-preview"><Button variant="ghost" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>Preview journal<ChevronRight className={previewOpen ? 'is-open' : ''} /></Button><AnimatePresence initial={false}>{previewOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={surface.transition} className="disclosure-body"><pre tabIndex={0}>{journal || 'Add an entry to preview your journal.'}</pre></motion.div>}</AnimatePresence></div>
            <div className="export-details">{session?.entries.some(entry => entry.originalPrompt !== undefined) && <Button variant="ghost" className="restore-journal" disabled={saving || enhancing} onClick={async () => { try { updateSession(await api.applyEnhancement(session.id, session.updatedAt, null)); notify('Original journal restored'); } catch (error) { fail(error); } }}>Restore original journal</Button>}<p>{session?.entries.length ?? 0} entries · {images.length} captures</p>{session && <><div className="export-folder"><FolderOpen /><span title={session.folder}>{session.folder}</span>{api.isDesktop && <Button variant="ghost" size="icon" aria-label="Open session folder" onClick={() => void api.openFolder(session.id).catch(fail)}><ArrowUpRight /></Button>}</div><Button variant="ghost" className="delete-session" onClick={() => { setExportOpen(false); setDeleting(session); }}><Trash2 />{api.isDesktop ? 'Move session to trash' : 'Delete session'}</Button></>}</div>
          </Popover>
          <Button variant="ghost" size="icon" aria-label="Settings" title="Settings · ⌘ ," onClick={() => setShowSettings(true)}><SettingsIcon /></Button>
          {api.isDesktop && <Button variant="ghost" size="icon" aria-label="Hide to menu bar" title="Hide to menu bar" onClick={() => void api.hide().catch(fail)}><Minimize2 /></Button>}
        </div>
      </header>
      <div className="workspace">
        <div className="board-heading"><SessionName key={draftKey} title={draft.title || session?.title || ''} onSave={rename} /><span>{session?.entries.length ?? 0} {(session?.entries.length ?? 0) === 1 ? 'card' : 'cards'}</span></div>
          <div className={`composer ${journalScrolled ? 'is-scrolled' : ''}`}><div className="composer-blur" aria-hidden="true"><EdgeBlur position="top" height={24} /></div>
            <div className="draft-images" data-empty={!draft.images.length}><AnimatePresence initial={false} mode="popLayout">{draft.images.map(image => <motion.div layout="position" {...surface} className="draft-image-row" key={image.id}><Button variant="ghost" className="draft-image-thumb" onClick={() => setEditor({ image, key: draftKey })} aria-label={`Annotate ${image.name}`}><img src={image.dataUrl} alt={image.context?.title || image.name} /><span><Pencil /></span></Button><div><strong title={image.context?.title}>{image.context?.title || image.name}</strong><span>{image.width} × {image.height} · {image.context ? time(image.context.capturedAt) : 'Ready to save'}</span><Input aria-label={`Page URL for ${image.name}`} className="url-input" placeholder="Page URL (optional)" value={image.context?.url ?? ''} onChange={event => changeDraft(draftKey, previous => ({ ...previous, images: previous.images.map(item => item.id === image.id ? { ...item, context: { kind: item.context?.kind ?? 'import', title: item.context?.title ?? item.name, capturedAt: item.context?.capturedAt ?? new Date().toISOString(), url: event.target.value } } : item) }))} /></div><Button variant="ghost" size="icon" aria-label={`Remove screenshot ${image.name}`} onClick={() => changeDraft(draftKey, previous => ({ ...previous, images: previous.images.filter(item => item.id !== image.id) }))}><X /></Button></motion.div>)}</AnimatePresence></div>
            <PromptComposer onAttach={() => setShowImport(draftKey)} value={draft.prompt} onChange={prompt => changeDraft(draftKey, { prompt })} onSubmit={() => void append()} busy={saving} enhancing={enhancing} hasImages={!!draft.images.length} original={draft.original} onUndo={() => changeDraft(draftKey, { prompt: draft.original ?? draft.prompt, original: undefined })} />
            <div className="composer-foot"><span><ShieldCheck /> {draftStatus}</span><span><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} ↵</kbd> to add to journal</span></div>
          </div>
        <AnimatePresence initial={false} mode="wait"><motion.section {...surface} ref={journalScroll} className="journal-scroll" aria-label="Session journal" key={draftKey} onScroll={event => setJournalScrolled(event.currentTarget.scrollTop > 2)}>
          <div className="journal-content">
            <div className="journal-entries"><AnimatePresence initial={false} mode="popLayout">{session?.entries.map((entry, index) => <motion.article layout="position" {...surface} className={`journal-entry ${entry.images.length ? 'has-images' : 'text-entry'}`} key={entry.id}>
              {!!entry.images.length && <div className="entry-images">{entry.images.map(image => <SavedThumbnail key={image.id} sessionId={session.id} image={image} onOpen={() => void editSaved(session.id, image.id)} />)}</div>}
              <div className="entry-caption">
                {entry.prompt && <p className="entry-prompt">{entry.prompt}</p>}
                {entry.images.map(image => <div className="card-source" key={image.id}><div className="source-context"><AppWindow /><span title={`${image.context?.title || 'Source not recorded'}${image.context ? ` · ${time(image.context.capturedAt)}` : ''}\n${image.path}`}>{image.context?.title || 'Source not recorded'}</span></div>{image.context?.url && <p className="source-url" title={image.context.url}>{image.context.url}</p>}</div>)}
                {entry.originalPrompt && <span className="enhanced-tag"><Sparkles /> Enhanced prompt</span>}
                <div className="entry-top"><span className="entry-number">{String(index + 1).padStart(2, '0')}</span><time dateTime={entry.createdAt}>{time(entry.createdAt)}</time><div className="grow" /><Button variant="ghost" size="icon" aria-label={`Remove entry ${index + 1}`} onClick={() => setRemoveEntry({ session, entry })}><Trash2 /></Button></div>
              </div>
            </motion.article>)}</AnimatePresence></div>

            <AnimatePresence>{!session?.entries.length && !draft.images.length && <motion.div {...surface} className="capture-empty"><img className="app-logo" src="./logo.png" alt="" /><div><h1>Start a session</h1><p>Capture or paste an image. Add a caption above.</p></div></motion.div>}</AnimatePresence>
          </div>
        </motion.section></AnimatePresence>
        <motion.div {...surface} className="journal-enhancer">
          <JournalEnhancer canEnhance={!!session?.entries.length} saving={saving} enhancing={enhancing} onEnhance={() => void enhance()} />
        </motion.div>
      </div>
    </main>
    <AnimatePresence>
    {enhancement && <JournalEnhancementDialog key="enhancement" result={enhancement} format={format} onFormat={setFormat} onClose={() => setEnhancement(null)} onCopy={text => copy(text, 'Enhanced journal copied')} onApply={async entries => { const result = await api.applyEnhancement(enhancement.session.id, enhancement.session.updatedAt, entries); updateSession(result); setEnhancement(null); notify(result.exportWarning || 'Enhanced journal saved', !!result.exportWarning); }} />}
    {permissionOpen && <CapturePermissionDialog key="permission" onClose={() => setPermissionOpen(false)} onRetry={() => { setPermissionOpen(false); void capture(); }} />}
    {showSettings && <SettingsDialog key="settings" settings={settings} onClose={() => setShowSettings(false)} onSave={async next => { const rootChanged = next.rootFolder !== settings.rootFolder; setSettings(next); setFormat(next.format); if (rootChanged) { const initial = await api.init(); setSessions(initial.sessions); setSelected(null); } notify('Settings saved'); }} />}
    {showImport && <Dialog key="import" open onOpenChange={open => { if (!open) setShowImport(null); }} title="Bring in a screenshot" description="Import a PNG, JPEG, or WebP. Your image stays local." className="import-dialog"><FileUpload acceptedFileTypes={['image/png', 'image/jpeg', 'image/webp']} maxFileSize={30 * 1024 * 1024} onUpload={async file => { const image = await imageFromFile(file); const key = showImport; setShowImport(null); setEditor({ image, key }); }} onUploadError={error => notify(error.message, true)} /></Dialog>}
    {editor && <Dialog key="editor" open onOpenChange={open => { if (!open) setEditor(null); }} title="Make your point" description={editor.image.context?.title || 'A little markup goes a long way.'} className="editor-dialog"><AnnotationEditor image={editor.image} applyLabel={editor.savedId ? 'Save changes' : 'Apply markup'} onApply={async image => { const key = editor.key;
      if (editor.savedId) { const updated = await api.updateImage(key, editor.savedId, image); updateSession(updated); setEditor(null); notify(updated.exportWarning || 'Screenshot updated'); return; }
 if ((drafts[key]?.images.length ?? 0) >= 12 && !drafts[key]?.images.some(item => item.id === image.id)) { notify('Add this entry before attaching more than 12 screenshots.', true); return; } changeDraft(key, previous => ({ ...previous, images: previous.images.some(item => item.id === image.id) ? previous.images.map(item => item.id === image.id ? image : item) : [...previous.images, image] })); setEditor(null); notify('Screenshot attached to your draft'); }} /></Dialog>}
    {crop && <motion.div key="crop" {...surface} className="capture-overlay"><RegionPicker source={crop.capture.dataUrl} onCancel={() => setCrop(null)} onSelect={async region => { try { const image = await imageFromSource(await cropImage(crop.capture.dataUrl, region)); setEditor({ image: { ...image, context: crop.capture.context }, key: crop.key }); setCrop(null); } catch (error) { fail(error); } }} /></motion.div>}
    {sources && <Dialog key="sources" open onOpenChange={open => { if (!open) setSources(null); }} title="Where are we looking?" description="Choose a window or display, then select the area to capture." className="source-dialog"><div className="source-controls"><SegmentedControl options={[{ value: 'window', label: 'Windows' }, { value: 'screen', label: 'Displays' }]} value={sourceKind} onValueChange={setSourceKind} label="Capture source type" /><Input aria-label="Search windows" placeholder="Find a window…" value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} /><Button variant="ghost" size="icon" aria-label="Refresh windows" title="Refresh windows" disabled={capturing} onClick={() => void refreshSources()}><RefreshCw className={capturing ? 'animate-spin' : ''} /></Button></div><div className="source-grid" aria-busy={capturing}><AnimatePresence initial={false} mode="popLayout">{sources.values.filter(source => source.kind === sourceKind && source.name.toLowerCase().includes(sourceSearch.toLowerCase())).map(source => <motion.div layout="position" key={source.id} {...surface}><Button variant="outline" className="source-card" disabled={capturing} onClick={() => void pickSource(source, sources.key)}><img src={source.thumbnail} alt="" /><span><AppWindow /><strong title={source.name}>{source.name}</strong><ChevronRight /></span></Button></motion.div>)}</AnimatePresence>{!sources.values.some(source => source.kind === sourceKind && source.name.toLowerCase().includes(sourceSearch.toLowerCase())) && <p className="muted">No matching {sourceKind === 'window' ? 'windows' : 'displays'} available. Try the other source type.</p>}</div><p className="source-picker-note"><Info /> The exact available window title is saved with each capture. Browser URLs can be added to your draft.</p></Dialog>}
    {deleting && <Dialog key="delete" open onOpenChange={open => { if (!open && !deletingBusy) setDeleting(null); }} title={api.isDesktop ? 'Move this session to trash?' : 'Delete this session?'} description={`“${deleting.title}” and its screenshots ${api.isDesktop ? 'will move to your system trash.' : 'will be permanently removed from this browser.'}`}>{deleteError && <p className="error-message dialog-error" role="alert">{deleteError}</p>}<div className="dialog-footer"><Button variant="ghost" disabled={deletingBusy} onClick={() => setDeleting(null)}>Keep session</Button><Button variant="destructive" disabled={deletingBusy} onClick={async () => { if (deletingBusy) return; setDeletingBusy(true); setDeleteError(''); try { await api.deleteSession(deleting.id); setSessions(current => current.filter(item => item.id !== deleting.id)); changeDraft(deleting.id, emptyDraft()); if (selected === deleting.id) setSelected(null); setDeleting(null); notify('Session removed'); } catch (error) { setDeleteError(cleanError(error)); } finally { setDeletingBusy(false); } }}>{deletingBusy ? <><LoaderCircle className="animate-spin" />Removing…</> : 'Remove session'}</Button></div></Dialog>}
    {removeEntry && <Dialog key="remove" open onOpenChange={open => { if (!open && !removingEntryBusy) setRemoveEntry(null); }} title="Remove this entry?" description="The entry will leave the journal. Its screenshot files stay available for any paths you already copied.">{removeEntryError && <p className="error-message dialog-error" role="alert">{removeEntryError}</p>}<div className="dialog-footer"><Button variant="ghost" disabled={removingEntryBusy} onClick={() => setRemoveEntry(null)}>Keep entry</Button><Button variant="destructive" disabled={removingEntryBusy} onClick={async () => { if (removingEntryBusy) return; setRemovingEntryBusy(true); setRemoveEntryError(''); try { updateSession(await api.removeEntry(removeEntry.session.id, removeEntry.entry.id)); setRemoveEntry(null); notify('Entry removed'); } catch (error) { setRemoveEntryError(cleanError(error)); } finally { setRemovingEntryBusy(false); } }}>{removingEntryBusy ? <><LoaderCircle className="animate-spin" />Removing…</> : 'Remove entry'}</Button></div></Dialog>}
    </AnimatePresence>
    <AnimatePresence>{toast && <motion.div key={toast.text} {...surface} className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <Info /> : <Check />}<span>{toast.text}</span><Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={() => setToast(null)}><X /></Button></motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
