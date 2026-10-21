'use client';

import { useEffects } from '@/context/EffectsContext';
import type { EffectsLevel } from '@/lib/animation-config';

export function EffectsSetting() {
  const { level, preference, setPreference } = useEffects();
  return <div className="ui-field"><label htmlFor="effects-level">Effects level</label><select id="effects-level" className="ui-select" value={preference} onChange={event => setPreference(event.target.value as EffectsLevel | 'auto')} aria-describedby="effects-help"><option value="auto">Automatic</option><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select><p id="effects-help" className="ui-hint">Currently {level}. Automatic reduces effects on slower devices and data-saving connections. Your system’s reduced motion preference always takes priority.</p></div>;
}
