import type { SectionId } from '../Habitat/scene-config';

export type Point = readonly [number, number];
export type Vector = readonly [number, number, number];
export type Preference = 'on' | 'off';
export type ExplorerPhase = 'preparing' | 'walking' | 'entering' | 'idle' | 'reading' | 'paused';
export interface Room {
  id: SectionId;
  label: string;
  origin: Vector;
  yaw: number;
  model: string;
  shell: string;
  door: Vector;
  reading: Vector;
  panel: Vector;
  panelYaw: number;
  neighbours: SectionId[];
}
export interface SpatialManifest {
  version: string;
  blender: string;
  architecture: string;
  signs: string;
  exhibits: string;
  lighting: string;
  nav: string;
  rooms: Room[];
  assets: { file: string; bytes: number; triangles: number }[];
}
export interface NavMesh { cellSize: number; cells: Point[] }
export interface ExplorerSnapshot {
  room: SectionId;
  position: Vector;
  yaw: number;
  pitch: number;
  reading: boolean;
}
export interface FrameSample { fps: number; p95: number; frames: number; gpuMs: number | null }
export interface ExplorerController {
  start(room: SectionId, snapshot?: ExplorerSnapshot): Promise<boolean>;
  goTo(room: SectionId): Promise<void>;
  stop(): void;
  setPaused(paused: boolean): void;
  setSound(enabled: boolean): Promise<boolean>;
  setVolume(value: number): void;
  snapshot(): ExplorerSnapshot;
  dispose(): void;
}
export interface ExplorerHooks {
  change(room: SectionId, phase: ExplorerPhase): void;
  visit(room: SectionId): void;
  ready(): void;
  failure(reason: 'performance' | 'asset' | 'context' | 'render'): void;
  metrics(sample: FrameSample): void;
}
