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
import { getOperationalSnapshot } from '../simulation/engine';

const CHECKPOINTS = [360, 540, 720, 960, 1200] as const;
const ELEVATION_EQUIVALENCE_TOLERANCE_M = 0.001;

const fileFetcher: JsonFetcher = async (url) => {
  try {
    const relativePath = url.replace(/^\//, '');
    const body = JSON.parse(await readFile(path.join(process.cwd(), 'public', relativePath), 'utf8')) as unknown;
    return { ok: true, json: async () => body };
  } catch {
    return { ok: false, json: async () => ({}) };
  }
};

function contextEventsWithoutSpatialElevationValue(
  snapshot: ReturnType<typeof getOperationalSnapshot>,
) {
  return snapshot.contextEvents.map((event) => event.type === 'HIGH_ELEVATION'
    ? { ...event, value: '<spatial-elevation-value>' }
    : event);
}

function highElevationValues(snapshot: ReturnType<typeof getOperationalSnapshot>): Map<string, number> {
  const values = new Map<string, number>();
  for (const event of snapshot.contextEvents.filter((item) => item.type === 'HIGH_ELEVATION')) {
    if (typeof event.value !== 'number') {
      throw new Error(`HIGH_ELEVATION event ${event.id} must expose a numeric value`);
    }
    values.set(event.id, event.value);
  }
  return values;
}

function nonPositionalSignature(snapshot: ReturnType<typeof getOperationalSnapshot>) {
  return {
    simTime: snapshot.simTime,
    vehicles: snapshot.vehicles.map((vehicle) => ({
      id: vehicle.id,
      type: vehicle.type,
      corridorId: vehicle.corridorId,
      state: vehicle.state,
      direction: vehicle.direction,
      distanceKm: vehicle.distanceKm,
      segmentId: vehicle.segmentId,
      etaMinute: vehicle.etaMinute,
      environmentContext: vehicle.environmentContext,
    })),
    corridorStates: snapshot.corridorStates,
    operationalEvents: snapshot.operationalEvents,
    contextEvents: contextEventsWithoutSpatialElevationValue(snapshot),
    metrics: snapshot.metrics,
  };
}

describe('V0.1 Veladero road-geometry acceptance', () => {
  it('changes spatial positions only while preserving deterministic operational semantics', async () => {
    const [v1Data, v2Data, artifacts, traffic] = await Promise.all([
      loadStaticOperationData(fileFetcher, { veladero: 'v1' }),
      loadStaticOperationData(fileFetcher),
      loadStaticRunArtifacts(fileFetcher),
      loadTrafficCalibration(fileFetcher),
    ]);

    const v1Spec = buildV0OperationSpec(v1Data, artifacts.run.seed, traffic);
    const v2Spec = buildV0OperationSpec(v2Data, artifacts.run.seed, traffic);
    let foundDifferentVeladeroPosition = false;

    for (const minute of CHECKPOINTS) {
      const v1 = getOperationalSnapshot(v1Spec, artifacts.run, minute, artifacts.environment);
      const v2 = getOperationalSnapshot(v2Spec, artifacts.run, minute, artifacts.environment);

      expect(nonPositionalSignature(v2)).toEqual(nonPositionalSignature(v1));

      const v1ElevationValues = highElevationValues(v1);
      const v2ElevationValues = highElevationValues(v2);
      expect([...v2ElevationValues.keys()]).toEqual([...v1ElevationValues.keys()]);
      for (const [eventId, v2Value] of v2ElevationValues) {
        const v1Value = v1ElevationValues.get(eventId);
        expect(v1Value).toBeDefined();
        expect(Math.abs(v2Value - (v1Value as number))).toBeLessThanOrEqual(ELEVATION_EQUIVALENCE_TOLERANCE_M);
      }

      const v1ById = new Map(v1.vehicles.map((vehicle) => [vehicle.id, vehicle]));
      for (const vehicle of v2.vehicles.filter((item) => item.corridorId === 'veladero')) {
        const baseline = v1ById.get(vehicle.id);
        if (!baseline) continue;
        const moved = Math.abs(vehicle.position.lon - baseline.position.lon) > 1e-6
          || Math.abs(vehicle.position.lat - baseline.position.lat) > 1e-6;
        foundDifferentVeladeroPosition ||= moved;
      }
    }

    expect(foundDifferentVeladeroPosition).toBe(true);
    expect(v2Data.corridors.find((corridor) => corridor.id === 'veladero')?.geometrySegments?.length).toBe(11);
    expect(v1Data.corridors.find((corridor) => corridor.id === 'veladero')?.geometrySegments).toBeUndefined();
  });
});
