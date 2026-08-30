import { describe, expect, it } from 'vitest';
import type { CorridorDefinition, OperationalSnapshot, VehicleSnapshot } from '../domain/contracts';
import type { BackgroundTrafficVehicle } from '../simulation/backgroundTraffic';
import { createOperationalAdapter, resolveBackgroundTrafficPoint, type VehicleEntitySink } from './cesiumAdapter';

class FakeSink implements VehicleEntitySink {
  readonly ids = new Set<string>();
  readonly positions = new Map<string, [number, number, number]>();
  readonly visibility = new Map<string, boolean>();

  ensure(id: string) {
    this.ids.add(id);
  }

  setPosition(id: string, lon: number, lat: number, elevationM: number) {
    this.positions.set(id, [lon, lat, elevationM]);
  }

  setVisible(id: string, visible: boolean) {
    this.visibility.set(id, visible);
  }

  size() {
    return this.ids.size;
  }
}

function vehicle(id: string, state: VehicleSnapshot['state'], lon: number): VehicleSnapshot {
  return {
    id,
    type: 'PERSONNEL',
    corridorId: 'hualilan',
    state,
    direction: state === 'RETURNING' || state === 'DONE' ? 'RETURN_TO_BASE' : 'TO_PROJECT',
    position: { lon, lat: -31 },
    distanceKm: 10,
    elevationM: 800,
    segmentId: 'segment-1',
    etaMinute: state === 'DONE' ? null : 500,
  };
}

function snapshot(vehicles: VehicleSnapshot[]): OperationalSnapshot {
  return {
    simTime: 480,
    vehicles,
    corridorStates: [],
    operationalEvents: [],
    contextEvents: [],
    metrics: { activeVehicles: vehicles.filter((item) => item.state !== 'DONE').length, atProject: 0, returning: 0, done: 0 },
  };
}

const corridor: CorridorDefinition = {
  id: 'hualilan',
  name: 'San Juan → Hualilán',
  origin: { id: 'san-juan', name: 'San Juan', lat: -31, lon: -68 },
  destination: { id: 'hualilan', name: 'Hualilán', lat: -30, lon: -69 },
  geometry: { type: 'LineString', coordinates: [[-68, -31], [-69, -30]] },
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [{
    id: 'segment-1', corridorId: 'hualilan', startKm: 0, endKm: 100, distanceKm: 100,
    elevationMinM: 600, elevationMaxM: 1600, roadClass: 'mountainRoad',
    geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [],
  }],
  nodes: [],
  elevationProfile: {
    source: 'fixture', resolution: 'fixture', method: 'fixture', limitations: [],
    samples: [{ distanceKm: 0, elevationM: 600 }, { distanceKm: 100, elevationM: 1600 }],
  },
  routeSamples: [
    { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 'segment-1' },
    { distanceKm: 100, lon: -69, lat: -30, elevationM: 1600, segmentId: 'segment-1' },
  ],
  evidenceRefs: ['fixture'],
  retrievedAt: '2026-08-30',
  limitations: [],
};

function background(direction: BackgroundTrafficVehicle['direction'], progress: number): BackgroundTrafficVehicle {
  return { id: 'BG-001', corridorId: 'hualilan', direction, progress, visualWeight: 'BACKGROUND' };
}

describe('createOperationalAdapter', () => {
  it('creates the fixed fleet entity set once and never grows while applying snapshots', () => {
    const ids = Array.from({ length: 24 }, (_, index) => `VEH-${index + 1}`);
    const sink = new FakeSink();
    const adapter = createOperationalAdapter(sink, ids);

    expect(sink.size()).toBe(24);
    adapter.apply(snapshot([vehicle('VEH-1', 'EN_ROUTE', -68.5)]));
    adapter.apply(snapshot([vehicle('VEH-1', 'RETURNING', -68.7)]));

    expect(sink.size()).toBe(24);
    expect(sink.positions.get('VEH-1')).toEqual([-68.7, -31, 800]);
  });

  it('hides completed vehicles without deleting or recreating their entity', () => {
    const sink = new FakeSink();
    const adapter = createOperationalAdapter(sink, ['VEH-1']);

    adapter.apply(snapshot([vehicle('VEH-1', 'DONE', -68)]));

    expect(sink.size()).toBe(1);
    expect(sink.visibility.get('VEH-1')).toBe(false);
  });

  it('fails closed if a snapshot contains an unknown vehicle id', () => {
    const sink = new FakeSink();
    const adapter = createOperationalAdapter(sink, ['VEH-1']);

    expect(() => adapter.apply(snapshot([vehicle('VEH-2', 'EN_ROUTE', -68.4)]))).toThrow(/unknown vehicle/i);
  });
});

describe('resolveBackgroundTrafficPoint', () => {
  it('maps outbound and inbound progress onto the versioned corridor samples', () => {
    expect(resolveBackgroundTrafficPoint(background('OUTBOUND', 0.25), [corridor])).toMatchObject({
      lon: -68.25, lat: -30.75, elevationM: 850,
    });
    expect(resolveBackgroundTrafficPoint(background('INBOUND', 0.25), [corridor])).toMatchObject({
      lon: -68.75, lat: -30.25, elevationM: 1350,
    });
  });

  it('fails closed if a background vehicle references an unknown corridor', () => {
    const missing = { ...background('OUTBOUND', 0.5), corridorId: 'veladero' as const };
    expect(() => resolveBackgroundTrafficPoint(missing, [corridor])).toThrow(/unknown background traffic corridor/i);
  });
});
