import { describe, expect, it } from 'vitest';
import { routeGeometryStyle } from './routeGeometryStyle';
import { roadContextStyle } from './roadContextStyle';

describe('roadContextStyle', () => {
  const weakestOperational = routeGeometryStyle('APPROXIMATE_APPROACH');

  it('keeps Huella context visually weaker than the weakest operational corridor geometry', () => {
    const style = roadContextStyle('Huella');
    expect(style.width).toBeLessThan(weakestOperational.width);
    expect(style.alpha).toBeLessThan(weakestOperational.alpha);
    expect(style.width).toBeLessThanOrEqual(0.75);
    expect(style.alpha).toBeLessThanOrEqual(0.12);
    expect(style.color).toBe('#cbd5e1');
  });

  it('keeps other IGN road context visually weaker than the weakest operational corridor geometry', () => {
    const style = roadContextStyle('Ruta Provincial');
    expect(style.width).toBeLessThan(weakestOperational.width);
    expect(style.alpha).toBeLessThan(weakestOperational.alpha);
    expect(style.width).toBeLessThanOrEqual(1);
    expect(style.alpha).toBeLessThanOrEqual(0.18);
    expect(style.color).toBe('#cbd5e1');
  });
});
