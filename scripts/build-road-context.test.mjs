import { describe, expect, it } from 'vitest';
import {
  buildRoadContext,
  deriveExpandedOperationalBounds,
  featureIntersectsBounds,
  normalizeRoadFeature,
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

const forbiddenOperationalKeys = [
  'corridorId',
  'distanceKm',
  'segmentId',
  'speedKph',
  'eta',
  'accessAllowed',
  'routeMembership',
];

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

  it('normalizes a source feature to stable cartographic-only properties', () => {
    expect(normalizeRoadFeature({
      type: 'Feature',
      properties: {
        gid: 10,
        objeto: 'Huella',
        rtn: null,
        sag: 'IGN',
        corridorId: 'must-drop',
        speedKph: 80,
      },
      geometry: insideGeometry,
    })).toEqual({
      type: 'Feature',
      properties: {
        id: 'ign:10',
        objectType: 'Huella',
        roadRef: null,
        sourceAgency: 'IGN',
      },
      geometry: insideGeometry,
    });
  });

  it('accepts numbered compound IGN provenance signatures but still rejects non-IGN sources', () => {
    expect(normalizeRoadFeature({
      type: 'Feature',
      properties: {
        gid: 11,
        objeto: 'Huella',
        rtn: null,
        sag: 'IGN01/ESRI World Imagery',
      },
      geometry: insideGeometry,
    }).properties.sourceAgency).toBe('IGN');

    expect(() => normalizeRoadFeature({
      type: 'Feature',
      properties: {
        gid: 12,
        objeto: 'Huella',
        rtn: null,
        sag: 'ESRI World Imagery',
      },
      geometry: insideGeometry,
    })).toThrow(/IGN/i);
  });

  it('fails closed when any authoring-source record lacks an IGN provenance signature', () => {
    expect(() => validateIgnSource({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { gid: 1, objeto: 'Huella', sag: 'IGN' }, geometry: insideGeometry },
        { type: 'Feature', properties: { gid: 2, objeto: 'Huella', sag: 'UNKNOWN' }, geometry: insideGeometry },
      ],
    })).toThrow(/IGN/i);
  });

  it('builds deterministic cartographic-only output with complete provenance and untouched geometry', () => {
    const source = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { gid: 20, objeto: 'Huella', rtn: null, sag: 'IGN', noisy: 'drop-me' },
          geometry: insideGeometry,
        },
        {
          type: 'Feature',
          properties: { gid: 30, objeto: 'Ruta', rtn: 'OUTSIDE', sag: 'IGN' },
          geometry: outsideGeometry,
        },
        {
          type: 'Feature',
          properties: { gid: 10, objeto: 'Ruta', rtn: 'RN 40', sag: 'IGN' },
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
    expect(first.geojson.features.map((feature) => feature.properties.id)).toEqual(['ign:10', 'ign:20']);
    expect(first.geojson.features[1].geometry).toEqual(insideGeometry);
    expect(first.geojson.features[1].properties).toEqual({
      id: 'ign:20',
      objectType: 'Huella',
      roadRef: null,
      sourceAgency: 'IGN',
    });

    for (const feature of first.geojson.features) {
      for (const key of forbiddenOperationalKeys) {
        expect(feature.properties).not.toHaveProperty(key);
      }
    }

    expect(first.metadata).toEqual({
      schemaVersion: 'sanjuan.road-context/v1',
      id: 'san-juan-ign-road-context-v1',
      provider: 'Instituto Geográfico Nacional de la República Argentina',
      authoringSource: 'Geo_Platform/web/public/data/san_juan_rutas.geojson',
      sourceCommit: 'a4812d053f4f381b9d3e1d5ff30abb9fed7d6772',
      sourceBlobSha: '1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70',
      sourceUrl: 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG',
      licenseUrl: 'https://www.ign.gob.ar/descargas/tyc1.html',
      attribution: 'FUENTE: Instituto Geográfico Nacional de la República Argentina',
      selectionMethod: 'feature-bbox intersection around active-corridor route-sample bbox + 0.25 degrees',
      contextPaddingDegrees: 0.25,
      featureCount: 2,
      limitations: [
        'Cartographic reference only; not an operational route, access authorization, road-status or navigation dataset.',
        'The exact historical IGN download endpoint used when the GeoPlatform authoring file was added was not recorded; provider identity is retained in the source attributes and official IGN reuse terms are cited separately.',
      ],
    });
  });
});
