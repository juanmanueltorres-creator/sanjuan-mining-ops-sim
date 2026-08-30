import type { OperationalSnapshot } from '../domain/contracts';

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
