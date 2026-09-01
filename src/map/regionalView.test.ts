import { describe, expect, it } from 'vitest';
import { REGIONAL_VIEW, estimateRegionalViewAimPoint } from './regionalView';

describe('regional camera preset', () => {
  it('aims into the San Juan operational belt instead of hundreds of kilometres north', () => {
    const aim = estimateRegionalViewAimPoint(REGIONAL_VIEW);

    expect(aim.forwardDistanceKm).toBeLessThan(180);
    expect(aim.lat).toBeGreaterThanOrEqual(-31.2);
    expect(aim.lat).toBeLessThanOrEqual(-29.2);
    expect(aim.lon).toBeGreaterThanOrEqual(-70.1);
    expect(aim.lon).toBeLessThanOrEqual(-68.7);
    expect(REGIONAL_VIEW.pitchDeg).toBeLessThanOrEqual(-65);
  });
});
