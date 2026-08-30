import { describe, expect, it } from 'vitest';
import type { CorridorDefinition, VehicleDefinition } from '../domain/contracts';
import { snapshotVehicle } from './vehicle';

const corridor: CorridorDefinition = {
  id: 'fixture',
  name: 'Fixture corridor',
  origin: { id: 'origin', name: 'Origin', lat: -31, lon: -68 },
  destination: { id: 'project', name: 'Project', lat: -30.9, lon: -68.1 },
  geometry: { type: 'LineString', coordinates: [[-68, -31], [-68.05, -30.95], [-68.1, -30.9]] },
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [
    { id: 's1', corridorId: 'fixture', startKm: 0, endKm: 5, distanceKm: 5, elevationMinM: 600, elevationMaxM: 800, roadClass: 'pavedLowland', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
    { id: 's2', corridorId: 'fixture', startKm: 5, endKm: 10, distanceKm: 5, elevationMinM: 800, elevationMaxM: 1000, roadClass: 'pavedLowland', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
  ],
  nodes: [],
  elevationProfile: { source: 'fixture', resolution: 'fixture', method: 'fixture', samples: [{ distanceKm: 0, elevationM: 600 }, { distanceKm: 10, elevationM: 1000 }], limitations: [] },
  routeSamples: [
    { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 's1' },
    { distanceKm: 5, lon: -68.05, lat: -30.95, elevationM: 800, segmentId: 's2' },
    { distanceKm: 10, lon: -68.1, lat: -30.9, elevationM: 1000, segmentId: 's2' },
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
  plannedStops: [
    { id: 'rest-1', type: 'REST', distanceKm: 5, dwellMinutes: 10, synthetic: true, evidenceRefs: ['synthetic-operating-plan-v1'] },
    { id: 'project-dwell', type: 'PROJECT', distanceKm: 10, dwellMinutes: 20, synthetic: true, evidenceRefs: ['synthetic-operating-plan-v1'] },
  ],
  synthetic: true,
  evidenceRefs: ['synthetic-operating-plan-v1'],
};

describe('snapshotVehicle', () => {
  it('walks the complete deterministic operational state machine', () => {
    expect(snapshotVehicle(vehicle, corridor, 350).state).toBe('AT_BASE');
    expect(snapshotVehicle(vehicle, corridor, 362).state).toBe('EN_ROUTE');
    expect(snapshotVehicle(vehicle, corridor, 365).state).toBe('AT_STOP');
    expect(snapshotVehicle(vehicle, corridor, 385).state).toBe('AT_PROJECT');
    expect(snapshotVehicle(vehicle, corridor, 400).state).toBe('RETURNING');
    expect(snapshotVehicle(vehicle, corridor, 410).state).toBe('DONE');
  });

  it('uses a monotonic corridor distance for outbound and return positions', () => {
    const outbound = snapshotVehicle(vehicle, corridor, 362);
    const returning = snapshotVehicle(vehicle, corridor, 400);

    expect(outbound.distanceKm).toBeGreaterThan(0);
    expect(outbound.distanceKm).toBeLessThan(10);
    expect(returning.distanceKm).toBeGreaterThanOrEqual(0);
    expect(returning.distanceKm).toBeLessThan(10);
    expect(Number.isFinite(returning.position.lon)).toBe(true);
    expect(Number.isFinite(returning.position.lat)).toBe(true);
  });

  it('derives ETA from the same travel model and never reports an ETA after completion', () => {
    expect(snapshotVehicle(vehicle, corridor, 362).etaMinute).toBeGreaterThan(362);
    expect(snapshotVehicle(vehicle, corridor, 410).etaMinute).toBeNull();
  });
});
