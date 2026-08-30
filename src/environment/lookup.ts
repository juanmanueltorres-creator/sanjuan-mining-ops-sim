import type { EnvironmentContext, EnvironmentSnapshot } from '../domain/contracts';

export function environmentAtPassage(
  _snapshot: EnvironmentSnapshot,
  _corridorId: string,
  _distanceKm: number,
  _time: string,
): EnvironmentContext {
  return {
    sourceState: 'UNAVAILABLE',
    temperatureC: null,
    precipitationMm: null,
    snowfallCm: null,
    windSpeedKmh: null,
    windGustKmh: null,
    windDirectionDeg: null,
    evidenceRefs: [],
  };
}
