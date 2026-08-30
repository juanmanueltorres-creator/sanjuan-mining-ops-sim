import type { OperationalRun, OperationalSnapshot, SanJuanOperationSpec } from '../domain/contracts';

export function getOperationalSnapshot(
  _spec: SanJuanOperationSpec,
  _run: OperationalRun,
  simMinute: number,
): OperationalSnapshot {
  return {
    simTime: simMinute,
    vehicles: [],
    corridorStates: [],
    operationalEvents: [],
    contextEvents: [],
    metrics: { activeVehicles: 0, atProject: 0, returning: 0, done: 0 },
  };
}
