import { createNamedRng } from './rng';

export type BackgroundCorridorId = 'hualilan' | 'veladero' | 'los-azules';

export interface TrafficTimeBand {
  startMinute: number;
  endMinute: number;
  relativeIntensity: number;
}

export interface TrafficCorridorWeight {
  corridorId: BackgroundCorridorId;
  weight: number;
}

export interface TrafficCalibration {
  baseVisibleVehicles: number;
  maxVisibleVehicles: number;
  timeBands: TrafficTimeBand[];
  corridorWeights: TrafficCorridorWeight[];
}

export interface BackgroundTrafficVehicle {
  id: string;
  corridorId: BackgroundCorridorId;
  direction: 'OUTBOUND' | 'INBOUND';
  progress: number;
  visualWeight: 'BACKGROUND';
}

function corridorFor(value: number, weights: TrafficCorridorWeight[]): BackgroundCorridorId {
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) throw new Error('Background traffic corridor weights must be positive');

  let cursor = value * totalWeight;
  for (const entry of weights) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.corridorId;
  }

  return weights.at(-1)!.corridorId;
}

export function backgroundTrafficAt(
  seed: string | number,
  minuteOfDay: number,
  calibration: TrafficCalibration,
): BackgroundTrafficVehicle[] {
  const timeBand = calibration.timeBands.find(
    (band) => minuteOfDay >= band.startMinute && minuteOfDay < band.endMinute,
  );
  if (!timeBand) throw new Error(`No background traffic time band covers minute ${minuteOfDay}`);

  const requestedCount = Math.round(calibration.baseVisibleVehicles * timeBand.relativeIntensity);
  const count = Math.max(0, Math.min(calibration.maxVisibleVehicles, requestedCount));
  const rng = createNamedRng(seed, `background-traffic:${minuteOfDay}`);

  return Array.from({ length: count }, (_, index) => ({
    id: `BG-${String(index + 1).padStart(3, '0')}`,
    corridorId: corridorFor(rng(), calibration.corridorWeights),
    direction: rng() < 0.5 ? 'OUTBOUND' : 'INBOUND',
    progress: rng(),
    visualWeight: 'BACKGROUND' as const,
  }));
}
