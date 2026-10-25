import { useEffect, useRef, useState } from 'react';
import { Bot, FolderOpen, KeyRound, ShieldCheck, Save, LoaderCircle, Monitor, SlidersHorizontal, ChevronDown, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CommandPalette } from '@/components/interior/command-palette';
import { useSurfaceMotion } from '@/components/interior/surface-motion';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { api } from '@/lib/bridge';
import { formatItems } from '@/lib/formats';
import type { Provider, ProviderModel, Settings, Format } from '@/types';
const providers: { id: Provider; name: string; baseUrl: string }[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'nvidia', name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'compatible', name: 'Custom', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434' },
];
export function SettingsDialog({ settings, onClose, onSave }: { settings: Settings; onClose: () => void; onSave: (settings: Settings) => Promise<void> }) {
  const [value, setValue] = useState(settings), [key, setKey] = useState(''), [clearKey, setClearKey] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [models, setModels] = useState<ProviderModel[]>([]), [loading, setLoading] = useState(false), [modelError, setModelError] = useState(''), [modelsOpen, setModelsOpen] = useState(false), [refresh, setRefresh] = useState(0), [manual, setManual] = useState(false);
  const surface = useSurfaceMotion();
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const closeModels = () => { setModelsOpen(false); modelTrigger.current?.focus(); };
  const savedKey = settings.hasApiKey && value.provider === settings.provider && value.baseUrl === settings.baseUrl && !clearKey;
  const canLoad = api.isDesktop && (value.provider === 'ollama' || !!key.trim() || savedKey);
  useEffect(() => {
    let current = true;
    setModels([]); setModelError(''); setLoading(canLoad);
    if (!canLoad) return;
    const timer = setTimeout(() => {
      api.listModels({ provider: value.provider, baseUrl: value.baseUrl, apiKey: key || undefined, clearApiKey: clearKey }).then(items => {
        if (!current) return;
        setModels(items);
        if (!items.length) setModelError(value.provider === 'ollama' ? 'No text models installed. Install one in Ollama, then refresh.' : 'No text models are available for this account.');
      }).catch(e => { if (current) setModelError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': Error: /, '')); }).finally(() => { if (current) setLoading(false); });
    }, key ? 600 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [value.provider, value.baseUrl, key, clearKey, canLoad, refresh]);
  const provider = providers.find(p => p.id === value.provider)!;
  async function save() {
    setBusy(true); setError('');
    try { const next = await api.saveSettings({ ...value, apiKey: key || undefined, clearApiKey: clearKey }); await onSave(next); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} onEscapeKeyDown={event => { if (modelsOpen) { event.preventDefault(); closeModels(); } }} title="Make it yours" description="Your workspace, your files, your AI." className="settings-dialog">
    <div className="settings-body">
      <section><h3><Bot /> Journal enhancement</h3><p>The orb improves every saved card together. Review the full journal before applying it.</p>
        <label className="field-label">AI provider</label><div className="provider-options">{providers.map(p => <Button key={p.id} variant="outline" aria-pressed={value.provider === p.id} className={value.provider === p.id ? 'is-selected' : ''} disabled={busy} onClick={() => { if (p.id === value.provider) return; setModelsOpen(false); setManual(false); setValue(v => ({ ...v, provider: p.id, baseUrl: p.baseUrl, model: p.id === settings.provider ? settings.model : '' })); setKey(''); setClearKey(false); }}>{p.name}</Button>)}</div>
        <AnimatePresence initial={false} mode="wait"><motion.div key={value.provider} {...surface}>
        {['compatible', 'ollama'].includes(value.provider) && <><label className="field-label" htmlFor="endpoint">API base URL</label><Input id="endpoint" value={value.baseUrl} onChange={e => setValue(v => ({ ...v, baseUrl: e.target.value }))} placeholder={provider.baseUrl} /></>}
        {value.provider !== 'ollama' && <><label className="field-label" htmlFor="api-key"><KeyRound /> API key {savedKey && <span className="key-saved">{value.secureStorage === false ? 'Saved for this launch' : 'Saved key'}</span>}</label><Input id="api-key" type="password" autoComplete="off" spellCheck={false} disabled={!api.isDesktop} value={key} onChange={e => setKey(e.target.value)} placeholder={api.isDesktop ? 'Paste your API key' : 'Available in the desktop app'} />{settings.hasApiKey && value.provider === settings.provider && value.baseUrl === settings.baseUrl && <Button variant="link" className="remove-key" onClick={() => { setClearKey(!clearKey); setKey(''); }}>{clearKey ? 'Keep saved key' : 'Remove saved key'}</Button>}</>}
        <label className="field-label" id="model-label">Model</label>
        <div className="model-control"><Button ref={modelTrigger} variant="outline" aria-label="Choose model" aria-expanded={modelsOpen} disabled={busy || !models.length} onClick={() => setModelsOpen(!modelsOpen)}><span>{value.model ? models.find(model => model.id === value.model)?.name || value.model : models[0] ? `Automatic · ${models[0].name}` : 'Automatic'}</span>{loading ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}</Button><Button variant="ghost" size="icon" aria-label="Refresh models" disabled={busy || loading || !canLoad} onClick={() => setRefresh(n => n + 1)}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button></div>
        <AnimatePresence initial={false}>{modelsOpen && <motion.div key="models" {...surface} className="model-picker"><CommandPalette autoFocus label="Search models" placeholder="Find a model…" maxRows={4} items={[{ id: '', label: 'Automatic', hint: models[0]?.name }, ...models.map(model => ({ id: model.id, label: model.name, keywords: model.id }))]} onDismiss={closeModels} onSelect={model => { setValue(v => ({ ...v, model: model.id })); closeModels(); }} /></motion.div>}</AnimatePresence>
        <p className="field-help" role="status">{loading ? 'Loading available models…' : !api.isDesktop ? 'Models load in the desktop app.' : !canLoad ? 'Paste your API key. Available models appear automatically.' : modelError || `${models.length} models available. Automatic chooses a text model for you.`}</p>
        {value.provider === 'compatible' && <><Button variant="link" className="manual-model-toggle" aria-expanded={manual} onClick={() => setManual(!manual)}>Custom model override</Button><AnimatePresence initial={false}>{manual && <motion.div {...surface}><Input aria-label="Custom model ID" value={value.model} onChange={e => setValue(v => ({ ...v, model: e.target.value }))} placeholder="Only needed if your endpoint cannot list models" /></motion.div>}</AnimatePresence></>}
        <div className="settings-note"><ShieldCheck /><span>{api.isDesktop ? value.secureStorage === null ? 'Protected storage is checked when you save a key. Your system may ask to unlock it. Journal text, source titles, and paths are sent; screenshot pixels stay local.' : value.secureStorage ? 'Keys are encrypted using your operating system. Journal text, source titles, and paths are sent; screenshot pixels stay local.' : 'Protected storage is unavailable. API keys stay in memory for this launch only.' : 'The browser preview keeps files in this browser. Use the desktop app for protected API keys and native window capture.'}</span></div>
        </motion.div></AnimatePresence>
      </section>
      <section><h3><FolderOpen /> Your library</h3><p>A separate folder for every session. Your screenshots and journals stay together.</p><div className="folder-field"><Input aria-label="Session library folder" value={value.rootFolder} readOnly /><Button variant="outline" disabled={!api.isDesktop} onClick={async () => { try { const rootFolder = await api.chooseFolder(); if (rootFolder) setValue(v => ({ ...v, rootFolder })); } catch (e) { setError(String(e)); } }}><FolderOpen /> Choose</Button></div><p className="field-help">Changing folders opens a different library. Existing sessions stay in their original folder.</p></section>
      <section><h3><SlidersHorizontal /> Default export format</h3><SegmentedControl className="format-control" options={formatItems} value={value.format} onValueChange={format => setValue(v => ({ ...v, format: format as Format }))} label="Default export format" /></section>
      <div className="shortcut-setting"><Monitor /><span>Capture from anywhere</span><kbd>{settings.shortcut || 'Use Capture in the app'}</kbd></div>
      {api.isDesktop && <div className="background-settings"><Button variant="outline" onClick={() => void api.openCopyPicker()}>Copy a session…</Button><p>Close the window to keep CanvasPilot in the menu bar. Hold Option/Alt, then U → I for capture; add P for the copy picker.</p></div>}
      {error && <p role="alert" className="error-message">{error}</p>}
    </div><footer className="dialog-footer"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button className="primary-button" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />} Save settings</Button></footer>
  </Dialog>;
}
