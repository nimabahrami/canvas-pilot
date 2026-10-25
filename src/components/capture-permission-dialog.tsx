import { useEffect, useState, useRef } from 'react';
import { ExternalLink, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/bridge';
import type { CaptureAccess } from '@/types';

export function CapturePermissionDialog({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const [access, setAccess] = useState<CaptureAccess>(), [error, setError] = useState('');
  const retried = useRef(false);
  useEffect(() => { if (access?.status === 'granted' && !retried.current) { retried.current = true; onRetry(); } }, [access, onRetry]);
  useEffect(() => {
    const refresh = () => { void api.captureAccess().then(setAccess).catch(e => setError(String(e))); };
    refresh(); window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const act = (action: () => Promise<void>) => { setError(''); void action().catch(e => setError(String(e))); };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title="Reconnect screen capture" description="CanvasPilot cannot access other windows in this running copy yet." className="permission-dialog">
    <div className="permission-body">
      <p className="permission-restart-note">Already enabled? Restart CanvasPilot first to reload macOS access. If this app was just updated, macOS may still have the older copy’s approval.</p><ol>
        <li>Open <strong>Screen &amp; System Audio Recording</strong> in System Settings.</li>
        <li>Enable <strong>{access?.appName || 'CanvasPilot'}</strong>. If it isn't listed, use the <strong>+</strong> button and choose the app shown by “Show app in Finder”.</li>
        <li>Quit and reopen the app if macOS asks, then try capturing again.</li>
      </ol>
      {access && !access.packaged && <p>This is the Electron development launcher. For a CanvasPilot entry in Settings, open the built CanvasPilot.app.</p>}
      <div className="permission-actions"><Button className="primary-button" onClick={() => act(api.openCaptureSettings)}><ExternalLink /> Open System Settings</Button><Button variant="outline" onClick={() => act(api.revealApplication)}><FolderOpen /> Show app in Finder</Button></div>
      <div className="permission-status"><ShieldCheck />{access?.status === 'granted' ? 'Screen recording is allowed.' : 'This running copy does not have access yet.'}</div>
      {error && <p role="alert" className="error-message">{error}</p>}
    </div>
    <footer className="dialog-footer"><Button variant="ghost" onClick={() => act(api.restart)}><RefreshCw /> Restart app</Button><Button variant="outline" onClick={onRetry}>Try capture again</Button></footer>
  </Dialog>;
}
