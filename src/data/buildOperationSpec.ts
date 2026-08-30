import type { SanJuanOperationSpec } from '../domain/contracts';
import { buildV0Schedule } from '../simulation/schedule';
import type { StaticOperationData, StaticTrafficCalibration } from './loadOperation';

export function buildV0OperationSpec(
  data: StaticOperationData,
  seed: string | number,
  traffic: StaticTrafficCalibration,
): SanJuanOperationSpec {
  return {
    schemaVersion: 'sanjuan.operation/v1',
    scenarioId: 'sanjuan-mining-ops-v0',
    timezone: 'America/Argentina/San_Juan',
    seed,
    territory: { projects: data.projects },
    corridors: data.corridors,
    fleet: buildV0Schedule(seed),
    schedule: {
      startMinute: 360,
      endMinute: 1200,
      defaultPlayback: 300,
      playbackOptions: [60, 120, 300, 600],
    },
    calibration: { evidenceRefs: traffic.evidenceRefs },
    provenance: [...data.evidence, ...traffic.evidence],
  };
}
