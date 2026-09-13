import type { SectionId } from '../Habitat/scene-config';

// Keep the Founder reading desk clear of the reused planter and its canopy.
export const exhibitAnchor = (id: SectionId): readonly [number, number] => id === 'founder' ? [-4.8, -2.8] : [4.8, -1];
export const televisionLocal = [-4.8, 2.6, -2.5] as const;
