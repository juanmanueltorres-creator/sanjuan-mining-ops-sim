function formatCoordinate(value: number, positiveHemisphere: string, negativeHemisphere: string): string {
  const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${formatCoordinate(lat, 'N', 'S')} · ${formatCoordinate(lon, 'E', 'W')}`;
}

export function formatElevation(elevationM: number | null | undefined): string {
  if (!Number.isFinite(elevationM)) return '—';
  return `${Math.round(elevationM as number).toLocaleString('en-US')} m`;
}

export function selectScaleBarMeters(maxDistanceM: number): number | null {
  if (!Number.isFinite(maxDistanceM) || maxDistanceM <= 0) return null;

  const magnitude = 10 ** Math.floor(Math.log10(maxDistanceM));
  for (const multiplier of [5, 2, 1]) {
    const candidate = multiplier * magnitude;
    if (candidate <= maxDistanceM) return candidate;
  }

  return magnitude / 2;
}
