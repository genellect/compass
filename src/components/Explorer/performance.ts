import type { FrameSample } from './contracts';

/** Samples actual rendered intervals; visibility/loading resets belong to the caller. */
export class FrameWindow {
  private times: number[] = [];
  private previous = 0;
  reset() { this.times = []; this.previous = 0; }
  add(time: number) {
    if (this.previous) this.times.push(time - this.previous);
    this.previous = time;
  }
  result(gpuMs: number | null = null): FrameSample {
    const values = [...this.times].sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)] ?? Infinity;
    return { fps: 1000 / median, p95: values[Math.floor(values.length * .95)] ?? Infinity, frames: values.length, gpuMs };
  }
  averageFPS() { return this.times.length ? this.times.length * 1000 / this.times.reduce((sum, value) => sum + value, 0) : 0; }
}

export function passesEntry(sample: FrameSample) {
  // A stable 30–60fps render is usable. A 60fps target is not an admission
  // requirement; 33ms frames are normal on an integrated GPU / 30Hz display.
  return sample.frames >= 60 && sample.fps >= 28 && sample.p95 <= 55 && (sample.gpuMs === null || sample.gpuMs <= 40);
}

/** Optional, nonblocking WebGL2 GPU timer. Never reads unavailable or disjoint data. */
export class GPUTimer {
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private current: WebGLQuery | null = null;
  private values: number[] = [];
  constructor(private gl: WebGL2RenderingContext) { this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2'); }
  begin() {
    const ext = this.extension;
    if (!ext || this.current || this.pending.length >= 4) return;
    this.current = this.gl.createQuery();
    if (this.current) this.gl.beginQuery(ext.TIME_ELAPSED_EXT, this.current);
  }
  end() {
    if (!this.extension || !this.current) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.current); this.current = null;
  }
  poll() {
    if (!this.extension) return;
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) { this.clear(); return; }
    while (this.pending[0] && this.gl.getQueryParameter(this.pending[0], this.gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      this.values.push(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) / 1e6);
      if (this.values.length > 180) this.values.shift();
      this.gl.deleteQuery(query);
    }
  }
  value() { const sorted = [...this.values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length * .95)] : null; }
  clear() { this.pending.forEach(query => this.gl.deleteQuery(query)); this.pending = []; this.values = []; }
  dispose() { if (this.current && this.extension) { this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); this.gl.deleteQuery(this.current); this.current = null; } this.clear(); }
}
