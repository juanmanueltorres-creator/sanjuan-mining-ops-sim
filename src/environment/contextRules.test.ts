import { describe, expect, it } from 'vitest';
import type { EnvironmentContext, VehicleSnapshot } from '../domain/contracts';
import { deriveContextEvents, V0_CONTEXT_RULES } from './contextRules';

const vehicle: VehicleSnapshot = {
  id: 'VEH-PERS-07',
  type: 'PERSONNEL',
  corridorId: 'veladero',
  state: 'EN_ROUTE',
  direction: 'TO_PROJECT',
  position: { lon: -69.5, lat: -29.9 },
  distanceKm: 260,
  elevationM: 3900,
  segmentId: 'veladero-05',
  etaMinute: 690,
};

const environment: EnvironmentContext = {
  sourceState: 'READY',
  temperatureC: -2,
  precipitationMm: 0.4,
  snowfallCm: 0,
  windSpeedKmh: 36,
  windGustKmh: 58,
  windDirectionDeg: 275,
  evidenceRefs: ['open-meteo-forecast'],
};

describe('deriveContextEvents', () => {
  it('emits only informational/attention signals and never mutates movement state', () => {
    const before = structuredClone(vehicle);
    const events = deriveContextEvents(
      vehicle,
      environment,
      V0_CONTEXT_RULES,
      '2026-08-30T09:42:00-03:00',
      270,
    );

    expect(vehicle).toEqual(before);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'HIGH_ELEVATION',
      'STRONG_GUST',
      'FREEZING_TEMPERATURE',
      'PRECIPITATION_SIGNAL',
      'LONG_TRAVEL_WINDOW',
    ]));
    expect(events.every((event) => event.severity === 'INFO' || event.severity === 'ATTENTION')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/safe|unsafe|road closed|stop required/i);
  });

  it('does not invent weather signals when the environment is unavailable', () => {
    const unavailable: EnvironmentContext = {
      sourceState: 'UNAVAILABLE',
      temperatureC: null,
      precipitationMm: null,
      snowfallCm: null,
      windSpeedKmh: null,
      windGustKmh: null,
      windDirectionDeg: null,
      evidenceRefs: [],
    };

    const events = deriveContextEvents(vehicle, unavailable, V0_CONTEXT_RULES, '2026-08-30T09:42:00-03:00', 90);
    expect(events.map((event) => event.type)).toEqual(['HIGH_ELEVATION']);
  });
});
