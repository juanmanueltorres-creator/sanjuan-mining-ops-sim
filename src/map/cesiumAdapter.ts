import type { CorridorDefinition, OperationalSnapshot } from '../domain/contracts';
import type { BackgroundTrafficVehicle } from '../simulation/backgroundTraffic';
import { positionAtDistance } from '../simulation/routeMath';

export interface VehicleEntitySink {
  ensure(id: string): void;
  setPosition(id: string, lon: number, lat: number, elevationM: number): void;
  setVisible(id: string, visible: boolean): void;
}

export interface OperationalMapAdapter {
  apply(snapshot: OperationalSnapshot): void;
}

export function createOperationalAdapter(
  sink: VehicleEntitySink,
  vehicleIds: string[],
): OperationalMapAdapter {
  const known = new Set(vehicleIds);
  if (known.size !== vehicleIds.length) throw new Error('Duplicate vehicle id in map adapter');
  vehicleIds.forEach((id) => sink.ensure(id));

  return {
    apply(snapshot) {
      for (const vehicle of snapshot.vehicles) {
        if (!known.has(vehicle.id)) throw new Error(`Unknown vehicle id: ${vehicle.id}`);
        sink.setPosition(vehicle.id, vehicle.position.lon, vehicle.position.lat, vehicle.elevationM);
        sink.setVisible(vehicle.id, vehicle.state !== 'DONE');
      }
    },
  };
}

export function resolveBackgroundTrafficPoint(
  vehicle: BackgroundTrafficVehicle,
  corridors: CorridorDefinition[],
): { lon: number; lat: number; elevationM: number } {
  const corridor = corridors.find((item) => item.id === vehicle.corridorId);
  if (!corridor) throw new Error(`Unknown background traffic corridor: ${vehicle.corridorId}`);
  if (corridor.routeSamples.length < 2) throw new Error(`Background traffic corridor ${vehicle.corridorId} has no route samples`);

  const totalDistanceKm = corridor.routeSamples.at(-1)!.distanceKm;
  const outboundDistanceKm = vehicle.progress * totalDistanceKm;
  const distanceKm = vehicle.direction === 'OUTBOUND'
    ? outboundDistanceKm
    : totalDistanceKm - outboundDistanceKm;
  const point = positionAtDistance(corridor.routeSamples, distanceKm);
  return { lon: point.lon, lat: point.lat, elevationM: point.elevationM };
}
