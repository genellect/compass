import authored from '../../../public/habitat/v3/manifest.json';

// Offer the full authored scene to conventional Desktop input and to wide,
// landscape touch tablets. Runtime frame-budget checks keep unsupported tablets
// on the matching offline render instead of lowering the approved scene quality.
export const DESKTOP_QUERY = [
  '(min-width: 901px) and (pointer: fine) and (hover: hover)',
  '(min-width: 901px) and (orientation: landscape) and (pointer: coarse)'
].join(', ');
export const ASSET_BASE = '/habitat/v3/';
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
export const sections: SectionSceneConfig[] = sectionIds.map(id => {
  const pose = authored.sections.find(section => section.id === id)!;
  return {id, origin: pose.origin as unknown as Vec3, arrival: pose.arrival as unknown as Vec3,
    reading: pose.camera as unknown as Vec3, exit: pose.exit as unknown as Vec3,
    target: pose.target as unknown as Vec3, filmOffset: pose.filmOffset};
});
export const chapters = [
  {id:'vision',label:'Vision',title:'VISION'},
  {id:'experience',label:'Experience',title:'EXPERIENCE'},
  {id:'technology',label:'Interactive',title:'INTERACTIVE'},
  {id:'community',label:'Community',title:'COMMUNITY'},
  {id:'contact',label:'Contact',title:'CONTACT'},
] as const;
export function chapterIndex(sectionIndex:number) { return sectionIndex<2?0:sectionIndex===2?1:sectionIndex<6?2:sectionIndex<8?3:4; }
export interface SceneManifest {
  version: string;
  architecture: string;
  environment: string;
  lighting: string;
  zones: { id: SectionId; model: string; poster: string; architectureLightmap?: string }[];
}
const authoredLightmaps=(authored as typeof authored & {lightmaps?:{file:string}[]}).lightmaps??[];
export const manifest: SceneManifest = {
  version: '3', architecture: ASSET_BASE + 'architecture.glb',
  environment: ASSET_BASE + 'environment.glb',
  lighting: ASSET_BASE + 'room.hdr',
  zones: sectionIds.map(id => ({ id, model: ASSET_BASE + id + '.glb', poster: ASSET_BASE + id + '.webp',
    architectureLightmap:authoredLightmaps.some(item=>item.file===`architecture-${id}.webp`)?ASSET_BASE+`architecture-${id}.webp`:undefined })),
};
export interface TourPosition { index: number; next: number; blend: number; local: number }
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };

/** Actual DOM offsets, not document-height percentages. The reading portion stays steady. */
export function locateTour(scrollY: number, viewport: number, starts: readonly number[], ends: readonly number[]): TourPosition {
  const probe = scrollY + viewport * .34;
  let index = 0;
  for (let i = 1; i < starts.length; i++) if (probe >= starts[i]) index = i;
  const next = Math.min(index + 1, starts.length - 1);
  const span = Math.max(1, (starts[next] ?? starts[index] + viewport) - starts[index]);
  const local = clamp((probe - starts[index]) / span);
  // Travel in the actual empty space after the copy. Expanding a disclosure extends
  // the reading interval instead of making the camera leave while text is on screen.
  const travelStart = ends[index] - viewport * .25;
  const travelEnd = starts[next] - viewport * .34;
  const blend = next === index || travelEnd <= travelStart ? 0 : smooth((scrollY - travelStart) / (travelEnd - travelStart));
  return { index, next, blend, local };
}
