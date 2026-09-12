export const EXPLORER_VERSION = '1';
// Emergency switch: disabling this leaves the existing Habitat and ISS path intact.
export const EXPLORER_ENABLED = process.env.NEXT_PUBLIC_COMPASS_EXPLORER !== 'off';
export const PREFERENCE_KEY = 'compass-explorer-preference';
export const FAILURE_KEY = 'compass-explorer-failed-' + EXPLORER_VERSION;
export const PC_QUERY = '(min-width: 901px) and (pointer: fine) and (hover: hover)';

export function isPC(input: { eligible: boolean; fine: boolean; userAgent: string; platform: string; touchPoints: number }) {
  const ipad = /iPad|iPhone|iPod|Android/i.test(input.userAgent)
    || (/Mac/i.test(input.platform) && input.touchPoints > 1);
  return input.eligible && input.fine && !ipad;
}

/** Storage can be unavailable in private sessions; it must never break navigation. */
export function readPreference(): 'auto' | 'explore' | 'standard' {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === 'explore' || value === 'standard' ? value : 'auto';
  } catch { return 'auto'; }
}
