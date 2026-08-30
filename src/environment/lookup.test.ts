import { describe, expect, it } from 'vitest';
import type { EnvironmentSnapshot } from '../domain/contracts';
import { environmentAtPassage } from './lookup';

const snapshot: EnvironmentSnapshot = {
  schemaVersion: 'sanjuan.environment/v1',
  id: 'fixture-environment',
  issuedAt: '2026-08-30T06:00:00-03:00',
  dataAsOf: '2026-08-30T06:00:00-03:00',
  targetDate: '2026-08-30',
  timezone: 'America/Argentina/San_Juan',
  provider: 'Open-Meteo fixture',
  modelKind: 'FORECAST',
  sourceState: 'READY',
  evidenceRefs: ['open-meteo-forecast'],
  limitations: ['Test fixture only.'],
  nodes: [
    {
      id: 'veladero-low',
      name: 'Veladero low node',
      corridorId: 'veladero',
      distanceKm: 0,
      lat: -31.5,
      lon: -68.5,
      elevationM: 650,
      hourly: [
        { time: '2026-08-30T09:00:00-03:00', temperatureC: 10, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 12, windGustKmh: 20, windDirectionDeg: 350 },
        { time: '2026-08-30T10:00:00-03:00', temperatureC: 12, precipitationMm: 1, snowfallCm: 0, windSpeedKmh: 18, windGustKmh: 30, windDirectionDeg: 10 },
      ],
    },
    {
      id: 'veladero-high',
      name: 'Veladero high node',
      corridorId: 'veladero',
      distanceKm: 100,
      lat: -30.5,
      lon: -69.5,
      elevationM: 4300,
      hourly: [
        { time: '2026-08-30T09:00:00-03:00', temperatureC: 0, precipitationMm: 2, snowfallCm: 0.2, windSpeedKmh: 28, windGustKmh: 40, windDirectionDeg: 20 },
        { time: '2026-08-30T10:00:00-03:00', temperatureC: 2, precipitationMm: 3, snowfallCm: 0.1, windSpeedKmh: 34, windGustKmh: 50, windDirectionDeg: 40 },
      ],
    },
  ],
};

describe('environmentAtPassage', () => {
  it('interpolates continuous weather by time and route distance without mutating the snapshot', () => {
    const before = structuredClone(snapshot);
    const context = environmentAtPassage(snapshot, 'veladero', 50, '2026-08-30T09:30:00-03:00');

    expect(context.sourceState).toBe('READY');
    expect(context.temperatureC).toBeCloseTo(6, 6);
    expect(context.windGustKmh).toBeCloseTo(35, 6);
    expect(context.windDirectionDeg).toBeGreaterThanOrEqual(0);
    expect(context.windDirectionDeg).toBeLessThanOrEqual(360);
    expect(context.evidenceRefs).toEqual(['open-meteo-forecast']);
    expect(snapshot).toEqual(before);
  });

  it('fails closed when no environment nodes exist for the requested corridor', () => {
    const context = environmentAtPassage(snapshot, 'missing', 50, '2026-08-30T09:30:00-03:00');

    expect(context.sourceState).toBe('UNAVAILABLE');
    expect(context.temperatureC).toBeNull();
    expect(context.windGustKmh).toBeNull();
    expect(context.evidenceRefs).toEqual([]);
  });

  it('fails closed when the requested passage time is outside the versioned snapshot window', () => {
    const context = environmentAtPassage(snapshot, 'veladero', 50, '2026-08-30T13:00:00-03:00');
    expect(context.sourceState).toBe('UNAVAILABLE');
  });
});
