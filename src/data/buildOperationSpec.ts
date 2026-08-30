import type { EvidenceRef, SanJuanOperationSpec } from '../domain/contracts';
import { assertEvidenceRefsExist } from '../domain/evidence';
import { V0_CONTEXT_RULES } from '../environment/contextRules';
import { buildV0Schedule } from '../simulation/schedule';
import type { StaticOperationData, StaticTrafficCalibration } from './loadOperation';

const SYNTHETIC_PLAN_EVIDENCE: EvidenceRef = {
  id: 'synthetic-operating-plan-v1',
  role: 'SYNTHETIC_ASSUMPTION',
  sourceName: 'San Juan Mining Ops Sim — V0 operating plan',
  retrievedAt: '2026-08-30',
  method: 'Seeded deterministic schedule for demonstration and software validation.',
  limitations: [
    'Vehicle assignments, departure times, dwell times and speed profiles are synthetic.',
    'The scenario does not represent operator dispatch, live telemetry or a safety recommendation.',
  ],
};

const SCENARIO_DISPLAY_RULES_EVIDENCE: EvidenceRef = {
  id: 'scenario-display-rules-v1',
  role: 'SYNTHETIC_ASSUMPTION',
  sourceName: 'San Juan Mining Ops Sim — V0 scenario display rules',
  retrievedAt: '2026-08-30',
  method: 'Static thresholds used only to surface contextual signals in the synthetic scenario.',
  limitations: [
    'Thresholds are visualization rules, not safety, transitability, occupational-health or operational decision thresholds.',
  ],
};

function assertScenarioEvidence(spec: SanJuanOperationSpec): void {
  const referencedIds = [
    ...spec.calibration.evidenceRefs,
    ...spec.territory.projects.flatMap((project) => project.evidenceRefs),
    ...spec.corridors.flatMap((corridor) => [
      ...corridor.evidenceRefs,
      ...corridor.nodes.flatMap((node) => node.evidenceRefs),
    ]),
    ...spec.fleet.flatMap((vehicle) => [
      ...vehicle.evidenceRefs,
      ...vehicle.plannedStops.flatMap((stop) => stop.evidenceRefs),
    ]),
    ...V0_CONTEXT_RULES.flatMap((rule) => rule.evidenceRefs),
  ];

  assertEvidenceRefsExist([...new Set(referencedIds)], spec.provenance);
}

export function buildV0OperationSpec(
  data: StaticOperationData,
  seed: string | number,
  traffic: StaticTrafficCalibration,
): SanJuanOperationSpec {
  const spec: SanJuanOperationSpec = {
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
    provenance: [
      ...data.evidence,
      ...traffic.evidence,
      SYNTHETIC_PLAN_EVIDENCE,
      SCENARIO_DISPLAY_RULES_EVIDENCE,
    ],
  };

  assertScenarioEvidence(spec);
  return spec;
}
