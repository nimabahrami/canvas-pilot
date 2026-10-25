import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { CommandPalette } from '@/components/interior/command-palette';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { Button } from '@/components/ui/button';
import { formatItems } from '@/lib/formats';
import type { Format, QuickCopySnapshot } from '@/types';

export function QuickCopy() {
  const bridge = window.quickCopy!;
  const [snapshot, setSnapshot] = useState<QuickCopySnapshot | null>(null);
  const [formatOverride, setFormatOverride] = useState<Format | null>(null);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);

  const reset = useCallback(() => {
    const current = ++request.current;
    setSnapshot(null);
    setFormatOverride(null);
    setError('');
    setCopying(false);
    setRevision(current);
    return current;
  }, []);

  const refresh = useCallback(async () => {
    const current = reset();
    try {
      const value = await bridge.list();
      if (current === request.current) setSnapshot(value);
    } catch (error) {
      if (current === request.current) setError(String(error));
    }
  }, [bridge, reset]);

  useEffect(() => {
    const stopShow = bridge.onShow(() => void refresh());
    const stopHide = bridge.onHide(reset);
    void refresh();
    return () => { stopShow(); stopHide(); request.current++; };
  }, [bridge, refresh, reset]);

  async function copy(id: string) {
    if (!snapshot || copying) return;
    const current = request.current;
    setCopying(true);
    setError('');
    try {
      // An omitted override resolves to the saved default in the main process.
      await bridge.copy(id, formatOverride ?? undefined);
    } catch (error) {
      if (current === request.current) setError(String(error));
    } finally {
      if (current === request.current) setCopying(false);
    }
  }

  const close = () => { void bridge.close().catch(error => setError(String(error))); };
  const loading = !snapshot && !error;

  return <div className="quick-copy-shell" aria-busy={loading || copying}>
    <header>
      <span><Copy />Copy a session</span>
      <Button variant="ghost" size="icon" aria-label="Close copy picker" onClick={close}><X /></Button>
    </header>
    <CommandPalette
      key={revision}
      autoFocus
      label="Search sessions to copy"
      placeholder="Find a session…"
      emptyLabel={loading ? 'Loading sessions…' : error ? 'Sessions unavailable' : 'No saved sessions found'}
      maxRows={6}
      items={(snapshot?.sessions ?? []).map(session => ({ id: session.id, label: session.title, hint: `${session.entries} entries` }))}
      onDismiss={close}
      onSelect={item => void copy(item.id)}
      className="quick-copy-list"
    />
    <footer>
      <SegmentedControl
        label="Copy format"
        options={formatItems.map(option => ({ ...option, disabled: !snapshot || copying }))}
        value={formatOverride ?? snapshot?.format ?? 'md'}
        onValueChange={value => setFormatOverride(value as Format)}
      />
      <span>{copying ? 'Copying…' : 'Enter to copy · Esc to close'}</span>
    </footer>
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
