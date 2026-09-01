import { describe, expect, it } from 'vitest';
import * as regionalView from './regionalView';

const { REGIONAL_VIEW, estimateRegionalViewAimPoint } = regionalView;

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

  it('provides an oblique Veladero verification view aimed at the project area', () => {
    const preset = (regionalView as unknown as Record<string, unknown>).VELADERO_VIEW as
      | regionalView.RegionalViewPreset
      | undefined;

    expect(preset).toBeDefined();
    if (!preset) return;

    const aim = estimateRegionalViewAimPoint(preset);
    expect(preset.heightM).toBeLessThanOrEqual(50_000);
    expect(preset.pitchDeg).toBeGreaterThan(-60);
    expect(preset.pitchDeg).toBeLessThan(-20);
    expect(aim.lat).toBeGreaterThanOrEqual(-29.55);
    expect(aim.lat).toBeLessThanOrEqual(-29.20);
    expect(aim.lon).toBeGreaterThanOrEqual(-70.15);
    expect(aim.lon).toBeLessThanOrEqual(-69.75);
  });
});
