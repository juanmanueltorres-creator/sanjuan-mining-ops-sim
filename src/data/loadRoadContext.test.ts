import { describe, expect, it } from 'vitest';
import { loadRoadContext, type RoadContextData } from './loadRoadContext';
import type { JsonFetcher } from './loadOperation';

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
  featureCount: 2,
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
        objectType: 'Ruta',
        roadRef: 'RN 40',
        sourceAgency: 'IGN',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-68.7, -31.2],
          [-68.8, -31.1],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'ign:20',
        objectType: 'Huella',
        roadRef: null,
        sourceAgency: 'IGN',
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-69.2, -30.8],
            [-69.25, -30.75],
          ],
        ],
      },
    },
  ],
};

function fetcherFor(metadata: unknown = validMetadata, geojson: unknown = validGeojson): JsonFetcher {
  return async (url: string) => ({
    ok: true,
    json: async () => {
      if (url === '/data/context/roads-context.v1.json') return metadata;
      if (url === '/data/context/roads-context.v1.geojson') return geojson;
      throw new Error(`Unexpected URL ${url}`);
    },
  });
}

async function expectRejected(metadata: unknown, geojson: unknown, pattern: RegExp) {
  await expect(loadRoadContext(fetcherFor(metadata, geojson))).rejects.toThrow(pattern);
}

describe('loadRoadContext', () => {
  it('loads and pairs valid metadata with cartographic-only GeoJSON', async () => {
    const loaded: RoadContextData = await loadRoadContext(fetcherFor());

    expect(loaded.metadata.featureCount).toBe(2);
    expect(loaded.features).toHaveLength(2);
    expect(loaded.features[0]).toEqual(validGeojson.features[0]);
    expect(loaded.features[1]).toEqual(validGeojson.features[1]);
  });

  it('rejects wrong schemaVersion', async () => {
    await expectRejected({ ...validMetadata, schemaVersion: 'wrong/v1' }, validGeojson, /schemaVersion/i);
  });

  it.each(['provider', 'sourceUrl', 'licenseUrl', 'attribution'] as const)(
    'rejects empty metadata field %s',
    async (field) => {
      await expectRejected({ ...validMetadata, [field]: '' }, validGeojson, new RegExp(field, 'i'));
    },
  );

  it('rejects featureCount mismatch', async () => {
    await expectRejected({ ...validMetadata, featureCount: 3 }, validGeojson, /featureCount/i);
  });

  it('rejects non-FeatureCollection geometry documents', async () => {
    await expectRejected(validMetadata, { type: 'Feature', properties: {}, geometry: null }, /FeatureCollection/i);
  });

  it('rejects unsupported geometry types', async () => {
    await expectRejected(validMetadata, {
      ...validGeojson,
      features: [{
        ...validGeojson.features[0],
        geometry: { type: 'Point', coordinates: [-68.7, -31.2] },
      }, validGeojson.features[1]],
    }, /geometry/i);
  });

  it('rejects invalid coordinate pairs', async () => {
    await expectRejected(validMetadata, {
      ...validGeojson,
      features: [{
        ...validGeojson.features[0],
        geometry: { type: 'LineString', coordinates: [[-68.7], [-68.8, -31.1]] },
      }, validGeojson.features[1]],
    }, /coordinate/i);
  });

  it.each(['id', 'objectType', 'sourceAgency'] as const)(
    'rejects missing feature property %s',
    async (field) => {
      const properties = { ...validGeojson.features[0].properties } as Record<string, unknown>;
      delete properties[field];
      await expectRejected(validMetadata, {
        ...validGeojson,
        features: [{ ...validGeojson.features[0], properties }, validGeojson.features[1]],
      }, new RegExp(field, 'i'));
    },
  );
});
