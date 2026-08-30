import { describe, expect, it } from 'vitest';
import { positionAtDistance } from './routeMath';

const samples = [
  { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 'a' },
  { distanceKm: 10, lon: -69, lat: -30, elevationM: 1600, segmentId: 'b' },
];

describe('positionAtDistance', () => {
  it('interpolates position and elevation along a corridor', () => {
    expect(positionAtDistance(samples, 5)).toMatchObject({
      distanceKm: 5,
      lon: -68.5,
      lat: -30.5,
      elevationM: 1100,
      segmentId: 'b',
    });
  });

  it('clamps before the first sample', () => {
    expect(positionAtDistance(samples, -5)).toEqual(samples[0]);
  });

  it('clamps after the final sample', () => {
    expect(positionAtDistance(samples, 15)).toEqual(samples[1]);
  });
});
