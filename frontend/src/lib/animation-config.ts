export type EffectsLevel = 'full' | 'reduced' | 'off';
export const animationConfig = {
  duration: 0.2,
  stagger: 0.03,
  ease: [0.22, 1, 0.36, 1] as const,
  reducedDuration: 0,
};
export function recommendedEffects(): EffectsLevel {
  if (typeof window === 'undefined') return 'reduced';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off';
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return navigator.hardwareConcurrency <= 4 || (device.deviceMemory ?? 8) <= 4 || device.connection?.saveData ? 'reduced' : 'full';
}
