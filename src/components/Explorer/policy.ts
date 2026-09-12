export const EXPLORER_VERSION = '2';
// Emergency switch: disabling this leaves the existing Habitat and ISS path intact.
export const EXPLORER_ENABLED = process.env.NEXT_PUBLIC_COMPASS_EXPLORER !== 'off';
export const PREFERENCE_KEY = 'compass-3d-mode';
export const FAILURE_KEY = 'compass-explorer-failed-' + EXPLORER_VERSION;
export const PC_QUERY = '(min-width: 901px) and (pointer: fine) and (hover: hover)';

export function isPC(input: { eligible: boolean; fine: boolean; userAgent: string; platform: string; touchPoints: number }) {
  const ipad = /iPad|iPhone|iPod|Android/i.test(input.userAgent)
    || (/Mac/i.test(input.platform) && input.touchPoints > 1);
  return input.eligible && input.fine && !ipad;
}

/** Storage can be unavailable in private sessions; it must never break navigation. */
export function readPreference(): 'on' | 'off' {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    if (value === 'on' || value === 'off') return value;
    // v1 "standard" still meant realtime 3D, so none of its three choices
    // represents a 3D OFF request. Only this explicit binary setting persists.
    return 'on';
  } catch { return 'on'; }
}
