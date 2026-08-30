import { describe, expect, it } from 'vitest';
import type { CorridorDefinition, OperationalEvent, VehicleDefinition } from '../domain/contracts';
import { deriveOperationalEvents, sortOperationalEvents } from './events';

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
  nodes: [
    { id: 'mid-node', name: 'Mid node', lat: -30.95, lon: -68.05, distanceKm: 5, elevationM: 800, evidenceRefs: ['fixture-evidence'] },
  ],
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
    { id: 'project-dwell', type: 'PROJECT', distanceKm: 10, dwellMinutes: 20, synthetic: true, evidenceRefs: ['synthetic-operating-plan-v1'] },
  ],
  synthetic: true,
  evidenceRefs: ['synthetic-operating-plan-v1'],
};

describe('operational event log', () => {
  it('derives the complete outbound/project/return lifecycle with versioned node passage', () => {
    const events = deriveOperationalEvents(vehicle, corridor);

    expect(events.map((event) => event.event)).toEqual([
      'DEPART_BASE',
      'ENTER_CORRIDOR',
      'PASS_NODE',
      'ARRIVE_PROJECT',
      'DEPART_PROJECT',
      'ENTER_RETURN',
      'ARRIVE_BASE',
    ]);
    expect(events.find((event) => event.event === 'PASS_NODE')).toMatchObject({
      locationId: 'mid-node',
      distanceKm: 5,
      elevationM: 800,
    });
  });

  it('sorts deterministically by time, vehicle id, then event name', () => {
    const unsorted: OperationalEvent[] = [
      { t: 400, vehicleId: 'B', corridorId: 'fixture', event: 'ARRIVE_BASE' },
      { t: 360, vehicleId: 'A', corridorId: 'fixture', event: 'ENTER_CORRIDOR' },
      { t: 360, vehicleId: 'A', corridorId: 'fixture', event: 'DEPART_BASE' },
    ];

    expect(sortOperationalEvents(unsorted).map((event) => event.event)).toEqual([
      'DEPART_BASE',
      'ENTER_CORRIDOR',
      'ARRIVE_BASE',
    ]);
  });
});
