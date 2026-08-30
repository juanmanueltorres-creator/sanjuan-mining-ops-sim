import type {
  ContextEvent,
  CorridorDefinition,
  CorridorState,
  EnvironmentSnapshot,
  OperationalMetrics,
  OperationalRun,
  OperationalSnapshot,
  SanJuanOperationSpec,
  VehicleSnapshot,
} from '../domain/contracts';
import { deriveContextEvents, V0_CONTEXT_RULES } from '../environment/contextRules';
import { environmentAtPassage } from '../environment/lookup';
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

function minuteFromClock(value: string): number {
  const [hourText, minuteText] = value.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function isoAtSimulationMinute(targetDate: string, simMinute: number): string {
  const secondsOfDay = Math.max(0, Math.min(86_399, Math.round(simMinute * 60)));
  const hour = Math.floor(secondsOfDay / 3600);
  const minute = Math.floor((secondsOfDay % 3600) / 60);
  const second = secondsOfDay % 60;
  return `${targetDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}-03:00`;
}

function validateEnvironmentArtifact(run: OperationalRun, environment: EnvironmentSnapshot): void {
  if (environment.id !== run.environmentSnapshotId) {
    throw new Error(`Environment snapshot ${environment.id} does not match run artifact ${run.environmentSnapshotId}`);
  }
  if (environment.targetDate !== run.targetDate) {
    throw new Error(`Environment target date ${environment.targetDate} does not match run ${run.targetDate}`);
  }
  if (environment.timezone !== run.timezone) {
    throw new Error(`Environment timezone ${environment.timezone} does not match run ${run.timezone}`);
  }
}

export function getOperationalSnapshot(
  spec: SanJuanOperationSpec,
  run: OperationalRun,
  simMinute: number,
  environment?: EnvironmentSnapshot,
): OperationalSnapshot {
  if (run.mode !== 'SIMULATED') throw new Error(`Unsupported operational run mode: ${run.mode}`);
  if (run.timezone !== spec.timezone) {
    throw new Error(`Run timezone ${run.timezone} does not match operation timezone ${spec.timezone}`);
  }
  if (environment) validateEnvironmentArtifact(run, environment);

  const corridorById = new Map(spec.corridors.map((corridor) => [corridor.id, corridor]));
  const passageTime = isoAtSimulationMinute(run.targetDate, simMinute);
  const contextEvents: ContextEvent[] = [];

  const vehicles = spec.fleet.map((vehicle) => {
    const corridor = corridorById.get(vehicle.corridorId);
    if (!corridor) throw new Error(`Missing corridor ${vehicle.corridorId} for vehicle ${vehicle.id}`);

    const movement = snapshotVehicle(vehicle, corridor, simMinute);
    if (!environment) return movement;

    const environmentContext = environmentAtPassage(
      environment,
      movement.corridorId,
      movement.distanceKm,
      passageTime,
    );
    const enriched: VehicleSnapshot = { ...movement, environmentContext };

    if (movement.state !== 'AT_BASE' && movement.state !== 'DONE') {
      const travelMinutes = Math.max(0, simMinute - minuteFromClock(vehicle.departureTime));
      contextEvents.push(...deriveContextEvents(
        movement,
        environmentContext,
        V0_CONTEXT_RULES,
        passageTime,
        travelMinutes,
      ));
    }

    return enriched;
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
    contextEvents,
    metrics: deriveMetrics(vehicles),
  };
}
