import { describe, expect, it } from 'vitest';
import { locateTour, sectionIds } from '../src/components/Habitat/scene-config';

describe('habitat DOM-relative camera tour', () => {
  const offsets = sectionIds.map((_, i) => i * 1000);
  it('keeps the reading interval still, then travels near the boundary', () => {
    expect(locateTour(100, 600, offsets)).toMatchObject({ index: 0, blend: 0 });
    const transition = locateTour(700, 600, offsets);
    expect(transition.index).toBe(0); expect(transition.blend).toBeGreaterThan(.5);
    expect(locateTour(1000, 600, offsets)).toMatchObject({ index: 1, blend: 0 });
  });
  it('seeks directly on deep-link arrival and stays at Contact in the footer', () => {
    expect(locateTour(6000, 600, offsets).index).toBe(6);
    expect(locateTour(12000, 600, offsets)).toMatchObject({ index: 8, next: 8, blend: 0 });
  });
  it('uses remeasured offsets after the Community disclosure expands', () => {
    const expanded = offsets.map((y, i) => i > 6 ? y + 1800 : y);
    expect(locateTour(7500, 600, offsets).index).toBe(7);
    expect(locateTour(7500, 600, expanded).index).toBe(6);
  });
  it('clamps elastic overscroll and degenerate boundaries', () => {
    expect(locateTour(-1000, 600, offsets).blend).toBe(0);
    expect(Number.isFinite(locateTour(0, 600, [0, 0]).blend)).toBe(true);
  });
});
