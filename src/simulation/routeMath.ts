import type { RouteSample } from '../domain/contracts';

export function positionAtDistance(samples: RouteSample[], distanceKm: number): RouteSample {
  if (samples.length === 0) {
    throw new Error('route samples are required');
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (distanceKm <= first.distanceKm) return first;
  if (distanceKm >= last.distanceKm) return last;

  let low = 1;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].distanceKm < distanceKm) low = mid + 1;
    else high = mid;
  }

  const b = samples[low];
  const a = samples[low - 1];
  const t = (distanceKm - a.distanceKm) / (b.distanceKm - a.distanceKm);

  return {
    distanceKm,
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    elevationM: a.elevationM + (b.elevationM - a.elevationM) * t,
    segmentId: b.segmentId,
  };
}
