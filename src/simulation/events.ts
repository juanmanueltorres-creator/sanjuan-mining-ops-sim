import type { CorridorDefinition, OperationalEvent, VehicleDefinition } from '../domain/contracts';
import { positionAtDistance } from './routeMath';
import { getVehicleTiming, outboundPassageMinuteAtDistance } from './vehicle';

export function sortOperationalEvents(events: OperationalEvent[]): OperationalEvent[] {
  return [...events].sort(
    (a, b) => a.t - b.t || a.vehicleId.localeCompare(b.vehicleId) || a.event.localeCompare(b.event),
  );
}

export function deriveOperationalEvents(vehicle: VehicleDefinition, corridor: CorridorDefinition): OperationalEvent[] {
  const timing = getVehicleTiming(vehicle, corridor);
  const first = corridor.routeSamples[0];
  const last = corridor.routeSamples.at(-1);
  if (!first || !last) throw new Error(`Corridor ${corridor.id} has no route samples`);

  const nodeEvents: OperationalEvent[] = [...corridor.nodes]
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .map((node) => {
      const point = positionAtDistance(corridor.routeSamples, node.distanceKm);
      return {
        t: outboundPassageMinuteAtDistance(vehicle, corridor, node.distanceKm),
        vehicleId: vehicle.id,
        corridorId: corridor.id,
        event: 'PASS_NODE' as const,
        locationId: node.id,
        distanceKm: node.distanceKm,
        elevationM: node.elevationM ?? point.elevationM,
      };
    });

  return sortOperationalEvents([
    {
      t: timing.departureMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'DEPART_BASE',
      locationId: corridor.origin.id,
      distanceKm: 0,
      elevationM: first.elevationM,
    },
    {
      t: timing.departureMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'ENTER_CORRIDOR',
      locationId: corridor.origin.id,
      distanceKm: 0,
      elevationM: first.elevationM,
    },
    ...nodeEvents,
    {
      t: timing.projectArrivalMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'ARRIVE_PROJECT',
      locationId: corridor.destination.id,
      distanceKm: last.distanceKm,
      elevationM: last.elevationM,
    },
    {
      t: timing.returnStartMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'DEPART_PROJECT',
      locationId: corridor.destination.id,
      distanceKm: last.distanceKm,
      elevationM: last.elevationM,
    },
    {
      t: timing.returnStartMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'ENTER_RETURN',
      locationId: corridor.destination.id,
      distanceKm: last.distanceKm,
      elevationM: last.elevationM,
    },
    {
      t: timing.baseArrivalMinute,
      vehicleId: vehicle.id,
      corridorId: corridor.id,
      event: 'ARRIVE_BASE',
      locationId: corridor.origin.id,
      distanceKm: 0,
      elevationM: first.elevationM,
    },
  ]);
}
