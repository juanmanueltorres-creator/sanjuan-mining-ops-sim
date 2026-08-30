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

function normalizedProgress(value: number): number {
  return ((value % 1) + 1) % 1;
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
  const elapsedMinutes = minuteOfDay - 360;

  return Array.from({ length: count }, (_, index) => {
    const id = `BG-${String(index + 1).padStart(3, '0')}`;
    const rng = createNamedRng(seed, `background-traffic:${id}`);
    const corridorId = corridorFor(rng(), calibration.corridorWeights);
    const direction = rng() < 0.5 ? 'OUTBOUND' as const : 'INBOUND' as const;
    const baseProgress = rng();
    const progressPerMinute = 0.0015 + rng() * 0.0015;

    return {
      id,
      corridorId,
      direction,
      progress: normalizedProgress(baseProgress + elapsedMinutes * progressPerMinute),
      visualWeight: 'BACKGROUND' as const,
    };
  });
}
