import type {
  CorridorDefinition,
  CorridorState,
  OperationalMetrics,
  OperationalRun,
  OperationalSnapshot,
  SanJuanOperationSpec,
  VehicleSnapshot,
} from '../domain/contracts';
import { deriveOperationalEvents, sortOperationalEvents } from './events';
import { snapshotVehicle } from './vehicle';

function deriveMetrics(vehicles: VehicleSnapshot[]): OperationalMetrics {
  return {
    activeVehicles: vehicles.filter((vehicle) => vehicle.state !== 'AT_BASE' && vehicle.state !== 'DONE').length,
    atProject: vehicles.filter((vehicle) => vehicle.state === 'AT_PROJECT').length,
    returning: vehicles.filter((vehicle) => vehicle.state === 'RETURNING').length,
    done: vehicles.filter((vehicle) => vehicle.state === 'DONE').length,
  };
}

function deriveCorridorStates(vehicles: VehicleSnapshot[], corridors: CorridorDefinition[]): CorridorState[] {
  return corridors.map((corridor) => {
    const members = vehicles.filter((vehicle) => vehicle.corridorId === corridor.id);
    return {
      corridorId: corridor.id,
      activeVehicles: members.filter((vehicle) => vehicle.state !== 'AT_BASE' && vehicle.state !== 'DONE').length,
      outbound: members.filter(
        (vehicle) => vehicle.direction === 'TO_PROJECT' && (vehicle.state === 'EN_ROUTE' || vehicle.state === 'AT_STOP'),
      ).length,
      returning: members.filter((vehicle) => vehicle.state === 'RETURNING').length,
    };
  });
}

export function getOperationalSnapshot(
  spec: SanJuanOperationSpec,
  run: OperationalRun,
  simMinute: number,
): OperationalSnapshot {
  if (run.mode !== 'SIMULATED') throw new Error(`Unsupported operational run mode: ${run.mode}`);
  if (run.timezone !== spec.timezone) {
    throw new Error(`Run timezone ${run.timezone} does not match operation timezone ${spec.timezone}`);
  }

  const corridorById = new Map(spec.corridors.map((corridor) => [corridor.id, corridor]));

  const vehicles = spec.fleet.map((vehicle) => {
    const corridor = corridorById.get(vehicle.corridorId);
    if (!corridor) throw new Error(`Missing corridor ${vehicle.corridorId} for vehicle ${vehicle.id}`);
    return snapshotVehicle(vehicle, corridor, simMinute);
  });

  const allEvents = sortOperationalEvents(
    spec.fleet.flatMap((vehicle) => {
      const corridor = corridorById.get(vehicle.corridorId);
      if (!corridor) throw new Error(`Missing corridor ${vehicle.corridorId} for vehicle ${vehicle.id}`);
      return deriveOperationalEvents(vehicle, corridor);
    }),
  );

  return {
    simTime: simMinute,
    vehicles,
    corridorStates: deriveCorridorStates(vehicles, spec.corridors),
    operationalEvents: allEvents.filter((event) => event.t <= simMinute),
    contextEvents: [],
    metrics: deriveMetrics(vehicles),
  };
}
