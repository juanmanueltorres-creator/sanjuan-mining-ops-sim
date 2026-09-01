import { describe, expect, it } from 'vitest';
import { validateRoadContextArtifacts } from './validate-road-context.mjs';

const validMetadata = {
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
  featureCount: 1,
  limitations: [
    'Cartographic reference only; not an operational route, access authorization, road-status or navigation dataset.',
  ],
};

const validGeojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'ign:10',
        objectType: 'Huella',
        roadRef: null,
        sourceAgency: 'IGN',
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: [[[ -69.2, -30.8 ], [ -69.25, -30.75 ]]],
      },
    },
  ],
};

function clone(value) {
  return structuredClone(value);
}

describe('offline road-context validator', () => {
  it('accepts a complete cartographic-only IGN artifact pair', () => {
    expect(validateRoadContextArtifacts(validMetadata, validGeojson)).toEqual({ featureCount: 1 });
  });

  it.each([
    ['schemaVersion', 'wrong'],
    ['provider', ''],
    ['sourceUrl', ''],
    ['licenseUrl', ''],
    ['attribution', ''],
    ['sourceCommit', ''],
    ['sourceBlobSha', ''],
  ])('rejects invalid required metadata field %s', (field, value) => {
    const metadata = clone(validMetadata);
    metadata[field] = value;
    expect(() => validateRoadContextArtifacts(metadata, validGeojson)).toThrow(new RegExp(field, 'i'));
  });

  it('rejects feature-count mismatch and malformed GeoJSON geometry', () => {
    const metadata = { ...validMetadata, featureCount: 2 };
    expect(() => validateRoadContextArtifacts(metadata, validGeojson)).toThrow(/featureCount/i);

    const unsupported = clone(validGeojson);
    unsupported.features[0].geometry = { type: 'Point', coordinates: [-69.2, -30.8] };
    expect(() => validateRoadContextArtifacts(validMetadata, unsupported)).toThrow(/geometry/i);

    const invalidCoordinate = clone(validGeojson);
    invalidCoordinate.features[0].geometry.coordinates = [[[null, -30.8], [-69.25, -30.75]]];
    expect(() => validateRoadContextArtifacts(validMetadata, invalidCoordinate)).toThrow(/coordinate/i);
  });

  it('rejects missing identity/source fields and duplicate feature ids', () => {
    for (const field of ['id', 'objectType', 'sourceAgency']) {
      const geojson = clone(validGeojson);
      delete geojson.features[0].properties[field];
      expect(() => validateRoadContextArtifacts(validMetadata, geojson)).toThrow(new RegExp(field, 'i'));
    }

    const wrongAgency = clone(validGeojson);
    wrongAgency.features[0].properties.sourceAgency = 'UNKNOWN';
    expect(() => validateRoadContextArtifacts(validMetadata, wrongAgency)).toThrow(/sourceAgency|IGN/i);

    const duplicate = clone(validGeojson);
    duplicate.features.push(clone(duplicate.features[0]));
    const duplicateMetadata = { ...validMetadata, featureCount: 2 };
    expect(() => validateRoadContextArtifacts(duplicateMetadata, duplicate)).toThrow(/duplicate/i);
  });

  it('rejects operational semantics leaking into road-context properties', () => {
    for (const forbidden of [
      'corridorId',
      'distanceKm',
      'segmentId',
      'speedKph',
      'eta',
      'accessAllowed',
      'routeMembership',
    ]) {
      const geojson = clone(validGeojson);
      geojson.features[0].properties[forbidden] = 'forbidden';
      expect(() => validateRoadContextArtifacts(validMetadata, geojson)).toThrow(new RegExp(forbidden, 'i'));
    }
  });
});
