import { describe, expect, it } from 'vitest';
import type { CorridorDefinition } from '../domain/contracts';
import { buildCorridorRenderLines, routeGeometryStyle } from './routeGeometryStyle';

function corridor(overrides: Partial<CorridorDefinition> = {}): CorridorDefinition {
  return {
    id: 'veladero',
    name: 'Veladero',
    origin: { id: 'origin', name: 'Origin', lon: -68.5, lat: -31.5 },
    destination: { id: 'destination', name: 'Destination', lon: -69.9, lat: -29.3 },
    geometry: { type: 'LineString', coordinates: [[-68.5, -31.5], [-69.9, -29.3]] },
    geometryClass: 'RECONSTRUCTED_ACCESS',
    segments: [],
    nodes: [],
    elevationProfile: { source: 'fixture', resolution: 'fixture', method: 'fixture', samples: [], limitations: [] },
    routeSamples: [
      { distanceKm: 0, lon: -68.5, lat: -31.5, elevationM: 650, segmentId: 'veladero-01' },
      { distanceKm: 180, lon: -69.2, lat: -30.4, elevationM: 1900, segmentId: 'veladero-03' },
      { distanceKm: 360, lon: -69.9, lat: -29.3, elevationM: 4300, segmentId: 'veladero-06' },
    ],
    evidenceRefs: [],
    retrievedAt: '2026-08-30',
    limitations: [],
    ...overrides,
  };
}

describe('route geometry rendering contract', () => {
  it('maps evidence classes to distinct visual patterns', () => {
    expect(routeGeometryStyle('PUBLIC_ROAD')).toMatchObject({ pattern: 'solid', alpha: 0.92 });
    expect(routeGeometryStyle('RECONSTRUCTED_ACCESS')).toMatchObject({ pattern: 'dash', alpha: 0.72 });
    expect(routeGeometryStyle('APPROXIMATE_APPROACH')).toMatchObject({ pattern: 'dot', alpha: 0.5 });
    expect(routeGeometryStyle('APPROXIMATE_APPROACH').width).toBeLessThan(routeGeometryStyle('PUBLIC_ROAD').width);
  });

  it('renders one line per V2 physical geometry segment', () => {
    const v2 = corridor({
      geometrySegments: [
        {
          id: 'public-01',
          corridorId: 'veladero',
          geometryClass: 'PUBLIC_ROAD',
          geometry: { type: 'LineString', coordinates: [[-68.5, -31.5], [-69.2, -30.4]] },
          sourceFeatureIds: ['official-1'],
          evidenceRefs: ['official-evidence'],
          sourceDatasetId: 'official',
          sourceRetrievedAt: '2026-08-30',
          limitations: [],
        },
        {
          id: 'access-01',
          corridorId: 'veladero',
          geometryClass: 'RECONSTRUCTED_ACCESS',
          geometry: { type: 'LineString', coordinates: [[-69.2, -30.4], [-69.9, -29.3]] },
          sourceFeatureIds: ['osm-way-1'],
          evidenceRefs: ['osm-evidence'],
          sourceDatasetId: 'osm',
          sourceRetrievedAt: '2026-08-30',
          limitations: [],
        },
      ],
      routeSamples: [
        { distanceKm: 0, lon: -68.5, lat: -31.5, elevationM: 650, segmentId: 'veladero-01', geometrySegmentId: 'public-01', geometryClass: 'PUBLIC_ROAD' },
        { distanceKm: 180, lon: -69.2, lat: -30.4, elevationM: 1900, segmentId: 'veladero-03', geometrySegmentId: 'access-01', geometryClass: 'RECONSTRUCTED_ACCESS' },
        { distanceKm: 360, lon: -69.9, lat: -29.3, elevationM: 4300, segmentId: 'veladero-06', geometrySegmentId: 'access-01', geometryClass: 'RECONSTRUCTED_ACCESS' },
      ],
    });

    const lines = buildCorridorRenderLines(v2);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.id)).toEqual(['public-01', 'access-01']);
    expect(lines.map((line) => line.geometryClass)).toEqual(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS']);
    expect(lines.every((line) => line.points.length >= 2)).toBe(true);
  });

  it('keeps one route-sample polyline for V1 corridors', () => {
    const lines = buildCorridorRenderLines(corridor());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id: 'veladero:legacy',
      geometryClass: 'RECONSTRUCTED_ACCESS',
    });
    expect(lines[0].points).toHaveLength(3);
  });
});
