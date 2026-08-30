import type { RouteSample } from '../domain/contracts';

export function positionAtDistance(samples: RouteSample[], _distanceKm: number): RouteSample {
  return samples[0];
}
