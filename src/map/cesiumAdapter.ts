import type { OperationalSnapshot } from '../domain/contracts';

export interface VehicleEntitySink {
  ensure(id: string): void;
  setPosition(id: string, lon: number, lat: number, elevationM: number): void;
  setVisible(id: string, visible: boolean): void;
}

export interface OperationalMapAdapter {
  apply(snapshot: OperationalSnapshot): void;
}

export function createOperationalAdapter(_sink: VehicleEntitySink, _vehicleIds: string[]): OperationalMapAdapter {
  return { apply: () => undefined };
}
