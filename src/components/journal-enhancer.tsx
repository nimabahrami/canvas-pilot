import { useState } from 'react';
import { Button } from './ui/button';
import { AiBlobWarpAvatar } from './cult/ai-blob-warp';

export function JournalEnhancer({ canEnhance, saving, enhancing, onEnhance }: {
  canEnhance: boolean; saving: boolean; enhancing: boolean; onEnhance: () => void;
}) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const disabled = !canEnhance || saving || enhancing;
  return <Button variant="ghost" className="orb-action" aria-label={enhancing ? 'Enhancing journal' : 'Enhance journal'} aria-busy={enhancing}
    title={canEnhance ? 'Enhance the entire saved journal' : 'Add a card to enhance your journal'} disabled={disabled} onClick={onEnhance}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocus={event => setFocused(event.currentTarget.matches(':focus-visible'))} onBlur={() => setFocused(false)}>
    <AiBlobWarpAvatar className="enhancer-orb" active={!saving && !enhancing && (hovered || focused)} warpProps={{ speed: enhancing ? 1.5 : .35, maxPixelCount: 16384 }} />
  </Button>;
}
