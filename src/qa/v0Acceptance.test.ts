import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SanJuanOperationSpec } from '../domain/contracts';
import {
  loadStaticOperationData,
  loadStaticRunArtifacts,
  loadTrafficCalibration,
  type JsonFetcher,
} from '../data/loadOperation';
import { backgroundTrafficAt } from '../simulation/backgroundTraffic';
import { getOperationalSnapshot } from '../simulation/engine';
import { buildV0Schedule } from '../simulation/schedule';

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

  const spec: SanJuanOperationSpec = {
    schemaVersion: 'sanjuan.operation/v1',
    scenarioId: 'sanjuan-mining-ops-v0',
    timezone: 'America/Argentina/San_Juan',
    seed: artifacts.run.seed,
    territory: { projects: operation.projects },
    corridors: operation.corridors,
    fleet: buildV0Schedule(artifacts.run.seed),
    schedule: {
      startMinute: 360,
      endMinute: 1200,
      defaultPlayback: 300,
      playbackOptions: [60, 120, 300, 600],
    },
    calibration: { evidenceRefs: traffic.evidenceRefs },
    provenance: [...operation.evidence, ...traffic.evidence],
  };

  return { spec, artifacts, traffic };
}

function replay(
  spec: SanJuanOperationSpec,
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
});
