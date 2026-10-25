import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { QuickCopy } from './components/quick-copy';
import { RegionPicker, type Region } from './components/region-picker';
import { CaptureCaption } from './components/capture-caption';
import { Button } from './components/ui/button';
import type { DraftImage } from './types';
import './styles.css';
type CaptureFrame = { mode: 'selection'; source?: string; liveSize?: { width: number; height: number }; liveOffset?: { x: number; y: number }; immediate?: boolean; sourceTitle?: string } | { mode: 'caption'; image: DraftImage; sessionId?: string; sessionTitle: string } | { mode: 'error'; message: string; permission: boolean };
declare global { interface Window { captureOverlay?: { frame(): Promise<CaptureFrame>; complete(region: Region): Promise<void>; cancel(): Promise<void>; save(input: { image: DraftImage; caption: string }): Promise<void>; resize(input: { editing: boolean; expanded: boolean }): Promise<void>; openSettings(): Promise<void>; onStage(callback: (frame: CaptureFrame) => void): () => void } } }
function CaptureOverlay() {
  const [frame, setFrame] = useState<CaptureFrame | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const update = (value: CaptureFrame) => { document.documentElement.classList.toggle('live-capture-window', value.mode !== 'selection' || Boolean(value.liveSize)); setFrame(value); setError(''); };
    const unsubscribe = window.captureOverlay?.onStage(update);
    window.captureOverlay?.frame().then(update).catch(error => setError(String(error)));
    return unsubscribe;
  }, []);
  const cancel = () => { void window.captureOverlay?.cancel(); };
  if (frame?.mode === 'error' || error) return <section className="capture-card capture-error"><h1>Capture unavailable</h1><p role="alert">{frame?.mode === 'error' && frame.permission ? 'Enable CanvasPilot in Screen Recording settings, then restart the app.' : frame?.mode === 'error' ? frame.message : error}</p>{frame?.mode === 'error' && frame.permission && <Button onClick={() => void window.captureOverlay?.openSettings()}>Open System Settings</Button>}<Button onClick={cancel}>Close</Button></section>;
  if (frame?.mode === 'caption') return <CaptureCaption image={frame.image} sessionId={frame.sessionId} sessionTitle={frame.sessionTitle} onSave={(image, caption) => window.captureOverlay!.save({ image, caption })} onCancel={cancel} onResize={(editing, expanded) => window.captureOverlay!.resize({ editing, expanded })} />;
  return frame ? <RegionPicker {...frame} onSelect={region => { window.captureOverlay?.complete(region).catch(error => setError(String(error))); }} onCancel={cancel} /> : <div className="startup-state">Preparing capture…</div>;
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="startup-state"><h1>Something interrupted your workspace.</h1><p>{this.state.error}</p><p>Restart CanvasPilot to restore your saved journal and drafts.</p></div> : this.props.children; }
}
if (location.hash === '#quick-copy') document.documentElement.classList.add('quick-copy-window');
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{location.hash === '#capture' && window.captureOverlay ? <CaptureOverlay /> : location.hash === '#quick-copy' && window.quickCopy ? <QuickCopy /> : <App />}</ErrorBoundary>);
