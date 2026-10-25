import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Square, Circle, PenLine, Highlighter, Type, Shield, Undo2, Redo2, Check, Minus, Plus } from 'lucide-react';
import Toolbar from '@/components/kokonutui/toolbar';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/interior/popover';
import { SegmentedControl } from '@/components/interior/segmented-control';
import type { DraftImage, AnnotationMark } from '@/types';
type Point = { x: number; y: number };
type Mark = AnnotationMark;
const tools = [
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight, shortcut: 'A', cursor: 'crosshair' },
  { id: 'rectangle', label: 'Rectangle', icon: Square, shortcut: 'R', cursor: 'crosshair' },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, shortcut: 'O', cursor: 'crosshair' },
  { id: 'pen', label: 'Pen', icon: PenLine, shortcut: 'P', cursor: 'crosshair' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, shortcut: 'H', cursor: 'crosshair' },
  { id: 'text', label: 'Text', icon: Type, shortcut: 'T', cursor: 'text' },
  { id: 'redact', label: 'Redact', icon: Shield, shortcut: 'D', cursor: 'crosshair' },
];
const colors = [{ name: 'Blue', value: '#3b82f6' }, { name: 'Red', value: '#f87171' }, { name: 'Amber', value: '#fbbf24' }, { name: 'Green', value: '#34d399' }, { name: 'White', value: '#ffffff' }];

function paint(context: CanvasRenderingContext2D, mark: Mark) {
  const first = mark.points[0], last = mark.points.at(-1)!;
  context.save(); context.strokeStyle = mark.color; context.fillStyle = mark.color; context.lineWidth = mark.width; context.lineCap = 'round'; context.lineJoin = 'round';
  const x = Math.min(first.x, last.x), y = Math.min(first.y, last.y), w = Math.abs(last.x - first.x), h = Math.abs(last.y - first.y);
  if (mark.tool === 'text') {
    const size = mark.fontSize ?? Math.max(18, mark.width * 6);
    context.font = `500 ${size}px Inter, sans-serif`; context.textBaseline = 'top';
    let offset = 0;
    for (const paragraph of (mark.text ?? '').split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && context.measureText(line + char).width > context.canvas.width - first.x - 8) { context.fillText(line, first.x, first.y + offset); offset += size * 1.35; line = ''; }
        line += char;
      }
      context.fillText(line, first.x, first.y + offset); offset += size * 1.35;
    }
  }
  else if (mark.tool === 'rectangle') context.strokeRect(x, y, w, h);
  else if (mark.tool === 'redact') { context.fillStyle = '#111318'; context.fillRect(x, y, w, h); }
  else if (mark.tool === 'highlight') { context.globalAlpha = 0.3; context.fillRect(x, y, w, h); }
  else if (mark.tool === 'ellipse') { context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.stroke(); }
  else {
    context.beginPath(); context.moveTo(first.x, first.y); for (const point of mark.points.slice(1)) context.lineTo(point.x, point.y); context.stroke();
    if (mark.tool === 'arrow') {
      const angle = Math.atan2(last.y - first.y, last.x - first.x), head = Math.max(14, mark.width * 4);
      context.beginPath(); context.moveTo(last.x, last.y); context.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6)); context.moveTo(last.x, last.y); context.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6)); context.stroke();
    }
  }
  context.restore();
}

export function AnnotationEditor({ image, onApply, applyLabel = 'Apply markup' }: { image: DraftImage; onApply: (image: DraftImage) => void | Promise<void>; applyLabel?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), bitmap = useRef<HTMLImageElement | null>(null), active = useRef<Mark | null>(null), frame = useRef(0);
  const [marks, setMarks] = useState<Mark[]>(() => structuredClone(image.editState?.marks ?? [])), [redo, setRedo] = useState<Mark[]>([]);
  const marksRef = useRef<Mark[]>(structuredClone(image.editState?.marks ?? [])), textRef = useRef<Mark | null>(null);
  const [tool, setTool] = useState('arrow'), [color, setColor] = useState('#3b82f6'), [width, setWidth] = useState(4), [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const [textDraft, setTextState] = useState<Mark | null>(null);
  const [view, setView] = useState('fit');
  const setText = (next: Mark | null) => { textRef.current = next; setTextState(next); };
  const replaceMarks = (next: Mark[]) => { marksRef.current = next; setMarks(next); };
  const render = useCallback(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx || !bitmap.current) return;
    ctx.clearRect(0, 0, image.width, image.height); ctx.drawImage(bitmap.current, 0, 0);
    for (const mark of marksRef.current) paint(ctx, mark);
    if (active.current) paint(ctx, active.current);
    if (textRef.current?.text?.trim()) paint(ctx, textRef.current);
  }, [image]);
  useEffect(() => { let valid = true; const img = new Image(); img.src = image.editState?.baseDataUrl ?? image.dataUrl; Promise.all([img.decode(), document.fonts.load('500 24px Inter')]).then(() => { if (valid) { bitmap.current = img; setReady(true); render(); } }).catch(() => { if (valid) setSaveError('This screenshot or its annotation font could not be opened. Try importing it again.'); }); return () => { valid = false; cancelAnimationFrame(frame.current); }; }, [image.dataUrl, render]);
  useEffect(render, [render, ready, marks, textDraft]);
  const commitText = () => {
    const mark = textRef.current;
    if (mark?.text?.trim()) { replaceMarks([...marksRef.current, mark]); setRedo([]); }
    originalText.current = null; setText(null);
  };
  const originalText = useRef<Mark | null>(null);
  const startText = (at: Point) => setText({ ...(textRef.current ?? { tool: 'text', color, width, text: '', fontSize: Math.max(24, Math.round(image.width / 30)) }), points: [at] });
  const editTextAt = (at: Point) => {
    const ctx = canvas.current!.getContext('2d')!;
    const found = marksRef.current.reduce((found, mark, index) => {
      if (mark.tool !== 'text') return found;
      const size = mark.fontSize ?? 24, origin = mark.points[0]; ctx.font = `500 ${size}px Inter, sans-serif`;
      const lines = (mark.text || '').split('\n'), w = Math.max(...lines.map(line => ctx.measureText(line).width));
      return at.x >= origin.x - 6 && at.x <= origin.x + Math.min(w, image.width - origin.x) + 6 && at.y >= origin.y - 6 && at.y <= origin.y + lines.length * size * 1.35 + 6 ? index : found;
    }, -1);
    if (found >= 0) { const mark = marksRef.current[found]; originalText.current = mark; replaceMarks(marksRef.current.filter((_, index) => index !== found)); setText({ ...mark }); }
    else startText(at);
  };
  const cancelText = () => { if (originalText.current) replaceMarks([...marksRef.current, originalText.current]); originalText.current = null; setText(null); };
  const selectTool = (next: string) => { commitText(); setTool(next); if (next === 'text') startText({ x: Math.round(image.width * .1), y: Math.round(image.height * .12) }); };
  const undo = () => { if (marksRef.current.length) { const last = marksRef.current.at(-1)!; setRedo(items => [...items, last]); replaceMarks(marksRef.current.slice(0, -1)); } };
  const redoMark = () => { if (redo.length) { replaceMarks([...marksRef.current, redo.at(-1)!]); setRedo(items => items.slice(0, -1)); } };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(image.width, (event.clientX - rect.left) / rect.width * image.width)), y: Math.max(0, Math.min(image.height, (event.clientY - rect.top) / rect.height * image.height)) }; };
  const commit = () => { if (!active.current) return; const mark = active.current; active.current = null; if (mark.points.length > 1) { replaceMarks([...marksRef.current, mark]); setRedo([]); } else render(); };
  return <div className="annotation-editor" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); event.shiftKey ? redoMark() : undo(); } }}>
    <div className="annotation-options">
      <div className="color-options">{colors.map(item => <Button key={item.value} variant="ghost" size="icon" className={`color-button ${color === item.value ? 'selected' : ''}`} aria-label={`${item.name} annotation color`} aria-pressed={color === item.value} onClick={() => { setColor(item.value); if (textRef.current) setText({ ...textRef.current, color: item.value }); }}><span style={{ backgroundColor: item.value }} /></Button>)}</div>
      <div className="stroke-control"><Button variant="ghost" size="icon" aria-label="Thinner stroke" onClick={() => setWidth(v => Math.max(2, v - 2))}><Minus /></Button><span>{width}px</span><Button variant="ghost" size="icon" aria-label="Thicker stroke" onClick={() => setWidth(v => Math.min(16, v + 2))}><Plus /></Button></div>
      <div className="grow" /><SegmentedControl className="annotation-zoom" label="Screenshot zoom" options={[{ value: 'fit', label: 'Fit' }, { value: 'actual', label: '100%' }]} value={view} onValueChange={setView} /><Button variant="ghost" size="icon" disabled={!marks.length} onClick={undo} aria-label="Undo annotation"><Undo2 /></Button><Button variant="ghost" size="icon" disabled={!redo.length} onClick={redoMark} aria-label="Redo annotation"><Redo2 /></Button>
    </div>
    <Toolbar tools={tools} value={tool} onValueChange={selectTool} className="annotation-stage" dockClassName="annotation-dock" ariaLabel="Annotation tools">
      <div className={`canvas-holder${view === 'actual' ? ' canvas-actual-size' : ''}`}><canvas ref={canvas} width={image.width} height={image.height} style={view === 'actual' ? { width: image.width, height: image.height } : undefined} className="annotation-canvas" aria-label="Screenshot annotation canvas" tabIndex={0}
        onPointerDown={event => { if (event.button !== 0 || !ready) return; if (tool === 'text') { event.preventDefault(); editTextAt(point(event)); return; } event.currentTarget.setPointerCapture(event.pointerId); active.current = { tool, color, width, points: [point(event)] }; }}
        onPointerMove={event => { if (!active.current) return; const p = point(event); active.current.points = tool === 'pen' ? [...active.current.points, p] : [active.current.points[0], p]; cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(render); }}
        onPointerUp={commit} onPointerCancel={() => { active.current = null; render(); }} /></div>
        {textDraft && <div className="annotation-text-anchor"><Popover label="Edit annotation text" trigger={<Type />} open onOpenChange={open => { if (!open) commitText(); }} side="top" align="end" className="annotation-text-popover">
          <label htmlFor="markup-text">Text on screenshot</label>
          <textarea id="markup-text" aria-label="Annotation text" autoFocus maxLength={20000} rows={4} placeholder="Type your annotation…" value={textDraft.text} onChange={e => setText({ ...textRef.current!, text: e.target.value })} onKeyDown={e => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitText(); } }} />
          <div className="text-editor-actions"><div><Button variant="ghost" size="icon" aria-label="Smaller annotation text" onClick={() => setText({ ...textRef.current!, fontSize: Math.max(12, (textRef.current!.fontSize ?? 24) - 4) })}><Minus /></Button><span>{textDraft.fontSize}px</span><Button variant="ghost" size="icon" aria-label="Larger annotation text" onClick={() => setText({ ...textRef.current!, fontSize: Math.min(144, (textRef.current!.fontSize ?? 24) + 4) })}><Plus /></Button></div><Button variant="ghost" onClick={cancelText}>Cancel text</Button><Button onClick={commitText}><Check />Done</Button></div>
        </Popover></div>}
    </Toolbar>
    {marks.some(mark => mark.tool === 'redact') && <p className="muted">Applying redaction permanently flattens this image and its existing markup.</p>}
    {saveError && <p role="alert" className="error-message">{saveError}</p>}
    <footer><span>{image.width} × {image.height} px <span className="muted">· {tool === 'text' ? 'Click text to edit it, or click an empty area to add more.' : 'Draw on the image to add markup'}</span></span><Button className="primary-button" disabled={!ready || saving} onClick={async () => { commitText(); active.current = null; render(); setSaving(true); setSaveError('');
      try {
        const dataUrl = canvas.current!.toDataURL('image/png');
        const editState = marksRef.current.some(mark => mark.tool === 'redact')
          ? { baseDataUrl: dataUrl, marks: [], sealed: true }
          : { baseDataUrl: image.editState?.baseDataUrl ?? image.dataUrl, marks: marksRef.current, sealed: image.editState?.sealed };
        await onApply({ ...image, dataUrl, editState });
      }
      catch (error) { setSaveError(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
    }}><Check /> {saving ? 'Saving…' : applyLabel}</Button></footer>
  </div>;
}
