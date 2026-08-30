import type { VehicleDefinition, VehicleType } from '../domain/contracts';
import { createNamedRng } from './rng';

export type SyntheticRoadClass = 'pavedLowland' | 'mountainRoad' | 'highMountain' | 'approach';

export const SPEED_PROFILES: Record<VehicleType, Record<SyntheticRoadClass, number>> = {
  PERSONNEL: { pavedLowland: 70, mountainRoad: 45, highMountain: 30, approach: 25 },
  FIELD: { pavedLowland: 75, mountainRoad: 50, highMountain: 35, approach: 30 },
  LOGISTICS: { pavedLowland: 60, mountainRoad: 38, highMountain: 25, approach: 20 },
};

const ACTIVE_CORRIDORS = ['hualilan', 'veladero', 'los-azules'] as const;
const CORRIDOR_DISTANCE_KM: Record<(typeof ACTIVE_CORRIDORS)[number], number> = {
  hualilan: 120,
  veladero: 360,
  'los-azules': 276,
};

const MIX: ReadonlyArray<{ type: VehicleType; count: number; prefix: string }> = [
  { type: 'PERSONNEL', count: 12, prefix: 'PERS' },
  { type: 'FIELD', count: 6, prefix: 'FIELD' },
  { type: 'LOGISTICS', count: 6, prefix: 'LOG' },
];

function formatMinuteOfDay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function buildV0Schedule(seed: string | number): VehicleDefinition[] {
  const departures = createNamedRng(seed, 'departures');
  const vehicleAssignment = createNamedRng(seed, 'vehicleAssignment');
  const dwellTimes = createNamedRng(seed, 'dwellTimes');
  const returnOffsets = createNamedRng(seed, 'returnOffsets');
  const fleet: VehicleDefinition[] = [];
  let globalIndex = 0;

  for (const group of MIX) {
    const corridorOffset = Math.floor(vehicleAssignment() * ACTIVE_CORRIDORS.length);

    for (let index = 0; index < group.count; index += 1) {
      const corridorId = ACTIVE_CORRIDORS[(index + corridorOffset) % ACTIVE_CORRIDORS.length];
      const departureMinute = 360 + globalIndex * 4 + Math.floor(departures() * 4);
      const projectDwell = 25 + Math.floor(dwellTimes() * 21) + Math.floor(returnOffsets() * 10);
      const sequence = String(index + 1).padStart(2, '0');

      fleet.push({
        id: `VEH-${group.prefix}-${sequence}`,
        type: group.type,
        corridorId,
        direction: 'TO_PROJECT',
        departureTime: formatMinuteOfDay(departureMinute),
        speedProfileId: `synthetic-v1-${group.type}`,
        plannedStops: [
          {
            id: `${corridorId}-project-dwell-${group.prefix.toLowerCase()}-${sequence}`,
            type: 'PROJECT',
            distanceKm: CORRIDOR_DISTANCE_KM[corridorId],
            dwellMinutes: projectDwell,
            synthetic: true,
            evidenceRefs: ['synthetic-operating-plan-v1'],
          },
        ],
        synthetic: true,
        evidenceRefs: ['synthetic-operating-plan-v1'],
      });

      globalIndex += 1;
    }
  }

  return fleet;
}
