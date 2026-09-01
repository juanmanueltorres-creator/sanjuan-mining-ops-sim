import { describe, expect, it } from 'vitest';
import {
  buildRoadContext,
  deriveExpandedOperationalBounds,
  featureIntersectsBounds,
  normalizeRoadProperties,
  validateIgnSource,
} from './build-road-context.mjs';

const routeDocuments = [
  {
    schemaVersion: 'sanjuan.route-samples/v1',
    corridorId: 'hualilan',
    samples: [
      { distanceKm: 0, lon: -68.54, lat: -31.54, elevationM: 650, segmentId: 'h-1' },
      { distanceKm: 120, lon: -68.95, lat: -30.73, elevationM: 1700, segmentId: 'h-2' },
    ],
  },
  {
    schemaVersion: 'sanjuan.route-samples/v1',
    corridorId: 'los-azules',
    samples: [
      { distanceKm: 0, lon: -68.60, lat: -31.50, elevationM: 700, segmentId: 'l-1' },
      { distanceKm: 200, lon: -69.84, lat: -31.12, elevationM: 3600, segmentId: 'l-2' },
    ],
  },
  {
    schemaVersion: 'sanjuan.route-samples/v2',
    corridorId: 'veladero',
    samples: [
      { distanceKm: 0, lon: -68.5364, lat: -31.5375, elevationM: 650, segmentId: 'v-1' },
      { distanceKm: 360, lon: -69.95222, lat: -29.36833, elevationM: 4200, segmentId: 'v-2' },
    ],
  },
];

const sourceIdentity = {
  repository: 'juanmanueltorres-creator/Geo_Platform',
  path: 'web/public/data/san_juan_rutas.geojson',
  commit: 'a4812d053f4f381b9d3e1d5ff30abb9fed7d6772',
  blobSha: '1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70',
};

const insideGeometry = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-69.2, -30.8],
      [-69.25, -30.75],
      [-69.3, -30.7],
    ],
  ],
};

const outsideGeometry = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-66.2, -27.2],
      [-66.1, -27.1],
    ],
  ],
};

describe('IGN road-context builder', () => {
  it('derives one combined operational bbox and expands every side by exactly 0.25 degrees', () => {
    expect(deriveExpandedOperationalBounds(routeDocuments)).toEqual({
      west: -70.20222,
      south: -31.79,
      east: -68.2864,
      north: -29.11833,
      bufferDegrees: 0.25,
    });
  });

  it('selects features by feature-level geometry bbox intersection without clipping coordinates', () => {
    const bounds = deriveExpandedOperationalBounds(routeDocuments);
    expect(featureIntersectsBounds({ type: 'Feature', properties: {}, geometry: insideGeometry }, bounds)).toBe(true);
    expect(featureIntersectsBounds({ type: 'Feature', properties: {}, geometry: outsideGeometry }, bounds)).toBe(false);
  });

  it('normalizes only the minimal cartographic properties', () => {
    expect(normalizeRoadProperties({ objeto: 'Huella', nomencla: 'RP 999', sag: 'IGN', noisy: 'drop-me' })).toEqual({
      sourceClass: 'Huella',
      sourceLabel: 'RP 999',
    });
  });

  it('fails closed when the authoring source does not carry an IGN provenance signature', () => {
    expect(() => validateIgnSource({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { objeto: 'Huella', sag: 'UNKNOWN' }, geometry: insideGeometry }],
    })).toThrow(/IGN/i);
  });

  it('builds deterministic cartographic-only output with pinned source identity and untouched geometry', () => {
    const source = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { objeto: 'Huella', nomencla: 'B', sag: 'IGN', noisy: 'drop-me' },
          geometry: insideGeometry,
        },
        {
          type: 'Feature',
          properties: { objeto: 'Ruta', nomencla: 'OUTSIDE', sag: 'IGN' },
          geometry: outsideGeometry,
        },
        {
          type: 'Feature',
          properties: { objeto: 'Ruta', nomencla: 'A', sag: 'IGN' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-68.7, -31.2],
              [-68.8, -31.1],
            ],
          },
        },
      ],
    };

    const first = buildRoadContext({ source, routeDocuments, sourceIdentity });
    const second = buildRoadContext({ source, routeDocuments, sourceIdentity });

    expect(first).toEqual(second);
    expect(first.geojson.type).toBe('FeatureCollection');
    expect(first.geojson.features).toHaveLength(2);
    expect(first.geojson.features.map((feature) => feature.properties.sourceLabel)).toEqual(['A', 'B']);
    expect(first.geojson.features[1].geometry).toEqual(insideGeometry);
    expect(first.geojson.features[1].properties).toEqual({ sourceClass: 'Huella', sourceLabel: 'B' });

    expect(first.metadata).toMatchObject({
      schemaVersion: 'sanjuan.road-context/v1',
      purpose: 'CARTOGRAPHIC_REFERENCE',
      source: sourceIdentity,
      transformation: {
        selectionMethod: 'feature-bbox-intersects-expanded-operational-bbox',
        bufferDegrees: 0.25,
        geometryMutation: 'none',
      },
      featureCount: 2,
    });
    expect(first.metadata.limitations.join(' ')).toMatch(/not.*routing/i);
    expect(first.metadata.limitations.join(' ')).toMatch(/not.*road condition/i);
  });
});
