export const DESKTOP_QUERY = '(min-width: 901px) and (pointer: fine) and (hover: hover)';
export const ASSET_BASE = '/habitat/v1/';
export const sectionIds = ['top', 'vision', 'experience', 'technology', 'resources', 'manifesto', 'community', 'founder', 'contact'] as const;
export type SectionId = typeof sectionIds[number];
export type Vec3 = readonly [number, number, number];
export type SceneState = 'loading' | 'ready' | 'paused' | 'static' | 'failed';
export type Quality = 'standard' | 'low';
export interface SectionSceneConfig {
  id: SectionId;
  origin: Vec3;
  arrival: Vec3;
  reading: Vec3;
  exit: Vec3;
  target: Vec3;
  filmOffset: number;
}
export const sections: SectionSceneConfig[] = sectionIds.map((id, index) => ({
  id, origin: [index * 22, 0, 0],
  arrival: [index * 22 + 5.9, 2.7, 10.4],
  reading: [index * 22 + 5.7, 2.65, 10],
  exit: [index * 22 + 5.4, 2.6, 9.6],
  target: [index * 22, 2, -1],
  filmOffset: [ -4.32, 4.32, -1.728, 4.32, -4.32, 4.32, -4.32, 4.32, -4.32 ][index],
}));
export const chapters = [
  {id:'vision',label:'考え方',title:'VISION'},
  {id:'experience',label:'できること',title:'EXPERIENCE'},
  {id:'technology',label:'体験する',title:'SYSTEMS'},
  {id:'community',label:'人と活動',title:'PEOPLE'},
  {id:'contact',label:'次の一歩',title:'CONNECT'},
] as const;
export function chapterIndex(sectionIndex:number) { return sectionIndex<2?0:sectionIndex===2?1:sectionIndex<6?2:sectionIndex<8?3:4; }
export interface SceneManifest {
  version: string;
  architecture: string;
  environment: string;
  lighting: string;
  zones: { id: SectionId; model: string; poster: string }[];
}
export const manifest: SceneManifest = {
  version: '1', architecture: ASSET_BASE + 'architecture.glb',
  environment: ASSET_BASE + 'environment.glb',
  lighting: ASSET_BASE + 'room.hdr',
  zones: sectionIds.map(id => ({ id, model: ASSET_BASE + id + '.glb', poster: ASSET_BASE + id + '.webp' })),
};
export interface TourPosition { index: number; next: number; blend: number; local: number }
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };

/** Actual DOM offsets, not document-height percentages. The reading portion stays steady. */
export function locateTour(scrollY: number, viewport: number, starts: readonly number[]): TourPosition {
  const probe = scrollY + viewport * .34;
  let index = 0;
  for (let i = 1; i < starts.length; i++) if (probe >= starts[i]) index = i;
  const next = Math.min(index + 1, starts.length - 1);
  const span = Math.max(1, (starts[next] ?? starts[index] + viewport) - starts[index]);
  const local = clamp((probe - starts[index]) / span);
  // Only travel in the final quarter of the section; long copy gets a longer reading interval.
  const blend = next === index ? 0 : smooth((local - .76) / .24);
  return { index, next, blend, local };
}
