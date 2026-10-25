import { useEffect, useRef, useState } from 'react';
import { Check, Maximize, X, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
export interface Region { x: number; y: number; width: number; height: number }
export function RegionPicker({ source, liveSize, liveOffset, sourceTitle, immediate, onSelect, onCancel }: { source?: string; liveSize?: { width: number; height: number }; liveOffset?: { x: number; y: number }; sourceTitle?: string; immediate?: boolean; onSelect: (region: Region) => void; onCancel: () => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [size, setSize] = useState(liveSize ?? { width: 0, height: 0 });
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); if (event.key === 'Enter' && region && region.width > 1 && region.height > 1) onSelect(region); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [region, onCancel, onSelect]);
  const position = (event: React.PointerEvent) => {
    const rect = (liveSize ? surfaceRef.current! : imageRef.current!).getBoundingClientRect();
    return { x: Math.round(Math.max(0, Math.min(size.width, (event.clientX - rect.left) / rect.width * size.width))), y: Math.round(Math.max(0, Math.min(size.height, (event.clientY - rect.top) / rect.height * size.height))) };
  };
  return <div className={`region-picker${liveSize ? ' region-picker-live' : ''}`}>
    <header><div><Scan /><span title={sourceTitle || (liveSize ? 'Swipe between desktops, then drag an area' : 'Drag to capture an area')}>{sourceTitle || 'Select area'}</span></div><div>
      <Button variant="ghost" size="icon" aria-label="Cancel" title="Cancel · Esc" onClick={onCancel}><X /></Button>
      <Button variant="outline" size="icon" aria-label="Entire source" title="Entire source" disabled={!size.width} onClick={() => onSelect({ x: 0, y: 0, ...size })}><Maximize /></Button>
      {!immediate && <Button className="primary-button" disabled={!region || region.width < 2 || region.height < 2} onClick={() => region && onSelect(region)}><Check /> Use selection</Button>}
    </div></header>
    <div className="region-viewport"><div ref={surfaceRef} className="region-image" style={liveSize && liveOffset ? { left: liveOffset.x, top: liveOffset.y, width: liveSize.width, height: liveSize.height, right: 'auto', bottom: 'auto' } : undefined} role="img" aria-label={liveSize ? 'Drag on the desktop to select a screenshot area' : 'Drag on the image to select a screenshot area'} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0 || !size.width) return; event.currentTarget.setPointerCapture(event.pointerId); start.current = position(event); setRegion(null); }}
      onPointerMove={event => { if (!start.current) return; const point = position(event); setRegion({ x: Math.min(start.current.x, point.x), y: Math.min(start.current.y, point.y), width: Math.abs(point.x - start.current.x), height: Math.abs(point.y - start.current.y) }); }}
      onPointerUp={event => { if (!start.current) return; const point = position(event); const selected = { x: Math.min(start.current.x, point.x), y: Math.min(start.current.y, point.y), width: Math.abs(point.x - start.current.x), height: Math.abs(point.y - start.current.y) }; start.current = null; setRegion(selected); if (immediate && selected.width > 1 && selected.height > 1) onSelect(selected); }} onPointerCancel={() => { start.current = null; setRegion(null); }}>
      {source && <img ref={imageRef} src={source} alt="Source to capture" draggable={false} onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />}
      {region ? <div className="selection-rectangle" style={{ left: `${region.x / size.width * 100}%`, top: `${region.y / size.height * 100}%`, width: `${region.width / size.width * 100}%`, height: `${region.height / size.height * 100}%` }}><span>{region.width} × {region.height}</span></div> : <div className="selection-shade" />}
    </div></div>
  </div>;
}
export async function cropImage(source: string, region: Region) {
  const image = new Image(); image.src = source; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = region.width; canvas.height = region.height;
  canvas.getContext('2d')!.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  return canvas.toDataURL('image/png');
}
