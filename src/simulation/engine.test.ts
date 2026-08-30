import { describe, expect, it } from 'vitest';
import type { CorridorDefinition, OperationalRun, SanJuanOperationSpec, VehicleDefinition } from '../domain/contracts';
import { getOperationalSnapshot } from './engine';

const corridor: CorridorDefinition = {
  id: 'fixture',
  name: 'Fixture corridor',
  origin: { id: 'origin', name: 'Origin', lat: -31, lon: -68 },
  destination: { id: 'project', name: 'Project', lat: -30.9, lon: -68.1 },
  geometry: { type: 'LineString', coordinates: [[-68, -31], [-68.1, -30.9]] },
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [
    { id: 's1', corridorId: 'fixture', startKm: 0, endKm: 10, distanceKm: 10, elevationMinM: 600, elevationMaxM: 1000, roadClass: 'pavedLowland', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
  ],
  nodes: [],
  elevationProfile: { source: 'fixture', resolution: 'fixture', method: 'fixture', samples: [{ distanceKm: 0, elevationM: 600 }, { distanceKm: 10, elevationM: 1000 }], limitations: [] },
  routeSamples: [
    { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 's1' },
    { distanceKm: 10, lon: -68.1, lat: -30.9, elevationM: 1000, segmentId: 's1' },
  ],
  evidenceRefs: ['fixture-evidence'],
  retrievedAt: '2026-08-30',
  limitations: [],
};

const vehicle: VehicleDefinition = {
  id: 'VEH-PERS-01',
  type: 'PERSONNEL',
  corridorId: 'fixture',
  direction: 'TO_PROJECT',
  departureTime: '06:00',
  speedProfileId: 'synthetic-v1-PERSONNEL',
  plannedStops: [{ id: 'project-dwell', type: 'PROJECT', distanceKm: 10, dwellMinutes: 20, synthetic: true, evidenceRefs: ['synthetic-operating-plan-v1'] }],
  synthetic: true,
  evidenceRefs: ['synthetic-operating-plan-v1'],
};

const spec: SanJuanOperationSpec = {
  schemaVersion: 'sanjuan.operation/v1',
  scenarioId: 'fixture',
  timezone: 'America/Argentina/San_Juan',
  seed: 'fixture-seed',
  territory: { projects: [] },
  corridors: [corridor],
  fleet: [vehicle],
  schedule: { startMinute: 360, endMinute: 1200, defaultPlayback: 300, playbackOptions: [60, 120, 300, 600] },
  calibration: { evidenceRefs: [] },
  provenance: [],
};

const run: OperationalRun = {
  id: 'run-fixture',
  targetDate: '2026-08-30',
  issuedAt: '2026-08-30T05:30:00-03:00',
  dataAsOf: '2026-08-30T05:30:00-03:00',
  timezone: 'America/Argentina/San_Juan',
  mode: 'SIMULATED',
  modelVersion: 'engine-v0',
  scenarioVersion: 'fixture-v1',
  environmentSnapshotId: 'fixture-environment',
  provenance: [],
};

describe('getOperationalSnapshot', () => {
  it('is deterministic and keeps movement separate from environment context', () => {
    const a = getOperationalSnapshot(spec, run, 362);
    const b = getOperationalSnapshot(spec, run, 362);

    expect(a).toEqual(b);
    expect(a.vehicles).toHaveLength(1);
    expect(a.vehicles[0].state).toBe('EN_ROUTE');
    expect(Number.isFinite(a.vehicles[0].position.lon)).toBe(true);
    expect(Number.isFinite(a.vehicles[0].position.lat)).toBe(true);
    expect(a.contextEvents).toEqual([]);
    expect(a.vehicles[0].environmentContext).toBeUndefined();
  });

  it('derives compact metrics and corridor state from vehicle snapshots', () => {
    const snapshot = getOperationalSnapshot(spec, run, 362);

    expect(snapshot.metrics).toEqual({ activeVehicles: 1, atProject: 0, returning: 0, done: 0 });
    expect(snapshot.corridorStates).toEqual([{ corridorId: 'fixture', activeVehicles: 1, outbound: 1, returning: 0 }]);
    expect(snapshot.operationalEvents.map((event) => event.event)).toEqual(['DEPART_BASE', 'ENTER_CORRIDOR']);
  });

  it('fails closed when a vehicle references a missing corridor', () => {
    const broken: SanJuanOperationSpec = { ...spec, fleet: [{ ...vehicle, corridorId: 'missing' }] };
    expect(() => getOperationalSnapshot(broken, run, 362)).toThrow(/missing corridor/i);
  });
});
