import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildV0OperationSpec } from '../data/buildOperationSpec';
import {
  loadStaticOperationData,
  loadStaticRunArtifacts,
  loadTrafficCalibration,
  type JsonFetcher,
} from '../data/loadOperation';
import { V0_CONTEXT_RULES } from '../environment/contextRules';
import { backgroundTrafficAt } from '../simulation/backgroundTraffic';
import { getOperationalSnapshot } from '../simulation/engine';

const CHECKPOINTS = [360, 540, 720, 960, 1200] as const;

const fileFetcher: JsonFetcher = async (url) => {
  try {
    const relativePath = url.replace(/^\//, '');
    const body = JSON.parse(await readFile(path.join(process.cwd(), 'public', relativePath), 'utf8')) as unknown;
    return { ok: true, json: async () => body };
  } catch {
    return { ok: false, json: async () => ({}) };
  }
};

async function loadCheckedInScenario() {
  const [operation, artifacts, traffic] = await Promise.all([
    loadStaticOperationData(fileFetcher),
    loadStaticRunArtifacts(fileFetcher),
    loadTrafficCalibration(fileFetcher),
  ]);

  const spec = buildV0OperationSpec(operation, artifacts.run.seed, traffic);
  return { spec, artifacts, traffic, operation };
}

function replay(
  spec: ReturnType<typeof buildV0OperationSpec>,
  artifacts: Awaited<ReturnType<typeof loadStaticRunArtifacts>>,
  traffic: Awaited<ReturnType<typeof loadTrafficCalibration>>,
) {
  return CHECKPOINTS.map((minuteOfDay) => ({
    minuteOfDay,
    operational: getOperationalSnapshot(spec, artifacts.run, minuteOfDay, artifacts.environment),
    backgroundTraffic: backgroundTrafficAt(artifacts.run.seed, minuteOfDay, traffic),
  }));
}

describe('V0 checked-in replay acceptance', () => {
  it('serializes identical operational and background snapshots across two complete checkpoint passes', async () => {
    const { spec, artifacts, traffic } = await loadCheckedInScenario();

    const firstPass = replay(spec, artifacts, traffic);
    const secondPass = replay(spec, artifacts, traffic);

    expect(firstPass.map((item) => item.minuteOfDay)).toEqual(CHECKPOINTS);
    expect(JSON.stringify(firstPass)).toBe(JSON.stringify(secondPass));
    expect(firstPass).toEqual(secondPass);
  });

  it('resolves every fleet, calibration, context-rule, and emitted context evidence reference', async () => {
    const { spec, artifacts, traffic } = await loadCheckedInScenario();
    const known = new Set(spec.provenance.map((evidence) => evidence.id));

    const declaredRefs = [
      ...spec.calibration.evidenceRefs,
      ...spec.fleet.flatMap((vehicle) => [
        ...vehicle.evidenceRefs,
        ...vehicle.plannedStops.flatMap((stop) => stop.evidenceRefs),
      ]),
      ...V0_CONTEXT_RULES.flatMap((rule) => rule.evidenceRefs),
    ];

    expect([...new Set(declaredRefs.filter((id) => !known.has(id)))]).toEqual([]);

    const emittedRefs = replay(spec, artifacts, traffic)
      .flatMap((item) => item.operational.contextEvents)
      .flatMap((event) => event.evidenceRefs);
    expect([...new Set(emittedRefs.filter((id) => !known.has(id)))]).toEqual([]);
  });

  it('fails closed when a scenario-level evidence reference is not registered', async () => {
    const { operation, artifacts, traffic } = await loadCheckedInScenario();
    const driftedTraffic = {
      ...traffic,
      evidenceRefs: [...traffic.evidenceRefs, 'missing-scenario-evidence'],
    };

    expect(() => buildV0OperationSpec(operation, artifacts.run.seed, driftedTraffic))
      .toThrow(/Missing evidence refs: missing-scenario-evidence/);
  });
});
