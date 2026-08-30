import type { CorridorDefinition, VehicleDefinition, VehicleSnapshot } from '../domain/contracts';

export function snapshotVehicle(vehicle: VehicleDefinition, corridor: CorridorDefinition, _simMinute: number): VehicleSnapshot {
  const point = corridor.routeSamples[0];
  return {
    id: vehicle.id,
    type: vehicle.type,
    corridorId: corridor.id,
    state: 'AT_BASE',
    direction: 'TO_PROJECT',
    position: { lon: point.lon, lat: point.lat },
    distanceKm: point.distanceKm,
    elevationM: point.elevationM,
    segmentId: point.segmentId,
    etaMinute: null,
  };
}
