import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CKAN_RESOURCE,
  OFFICIAL_RESOURCES,
  acquireVeladeroSources,
  buildOverpassQuery,
  clipFeatureCollectionToBbox,
  fetchOfficialRoadSource,
  fetchOverpassRoadSource,
  normalizeOverpassWays,
  normalizeWfsFeatureCollection,
  normalizeWfsUrl,
  resolveCkanResource,
} from './acquire-road-sources.mjs';

const regionalBbox = [-69.5, -31.8, -68.3, -29.9];
const highMountainBbox = [-70.1, -30.25, -69.2, -29.25];

function lineFeature(id, coordinates, properties = {}) {
  return {
    type: 'Feature',
    id,
    properties,
    geometry: { type: 'LineString', coordinates },
  };
}

describe('road source acquisition helpers', () => {
  it('normalizes a WFS feature collection without discarding stable source ids', () => {
    const raw = {
      type: 'FeatureCollection',
      features: [lineFeature('rutas_nacionales.40', [[-68.6, -31.5], [-68.7, -31.0]], { ruta: '40' })],
    };

    const normalized = normalizeWfsFeatureCollection(raw);

    expect(normalized).toMatchObject({ type: 'FeatureCollection' });
    expect(normalized.features).toHaveLength(1);
    expect(normalized.features[0]).toMatchObject({
      id: 'rutas_nacionales.40',
      properties: { ruta: '40', sourceFeatureId: 'rutas_nacionales.40' },
    });
  });

  it('normalizes Overpass highway ways to GeoJSON while retaining exact OSM way ids and tags', () => {
    const normalized = normalizeOverpassWays({
      elements: [{
        type: 'way',
        id: 123,
        tags: { highway: 'track', surface: 'gravel', name: 'fixture access' },
        geometry: [
          { lon: -69.6, lat: -29.9 },
          { lon: -69.7, lat: -29.8 },
        ],
      }],
    });

    expect(normalized.features).toHaveLength(1);
    expect(normalized.features[0]).toMatchObject({
      id: 'osm-way-123',
      properties: {
        osmWayId: 123,
        highway: 'track',
        surface: 'gravel',
        name: 'fixture access',
      },
    });
    expect(normalized.features[0].geometry.coordinates).toEqual([
      [-69.6, -29.9],
      [-69.7, -29.8],
    ]);
  });

  it('drops source features that do not intersect the acquisition bbox', () => {
    const clipped = clipFeatureCollectionToBbox({
      type: 'FeatureCollection',
      features: [
        lineFeature('inside', [[-68.6, -31.5], [-68.7, -31.0]]),
        lineFeature('outside', [[-70.8, -34.0], [-70.7, -33.9]]),
      ],
    }, regionalBbox);

    expect(clipped.features.map((feature) => feature.id)).toEqual(['inside']);
  });

  it('rewrites WFS resource URLs to request GeoJSON with an explicit regional bbox', () => {
    const url = normalizeWfsUrl(
      'https://example.test/geoserver/wfs?service=WFS&request=GetFeature&typeName=roads&maxFeatures=50&outputFormat=shape-zip',
      regionalBbox,
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get('outputFormat')).toBe('application/json');
    expect(parsed.searchParams.get('maxFeatures')).toBe('10000');
    expect(parsed.searchParams.get('bbox')).toBe('-69.5,-31.8,-68.3,-29.9,EPSG:4326');
    expect(parsed.searchParams.get('typeName')).toBe('roads');
  });

  it('fails closed on malformed WFS or Overpass geometry', () => {
    expect(() => normalizeWfsFeatureCollection({ type: 'FeatureCollection', features: [lineFeature('bad', [[999, -31], [-68, -31]])] }))
      .toThrow(/coordinate/i);
    expect(() => normalizeOverpassWays({ elements: [{ type: 'way', id: 7, tags: { highway: 'track' }, geometry: [{ lon: -69, lat: -30 }] }] }))
      .toThrow(/at least two/i);
  });
});

describe('official-first acquisition transport', () => {
  it('retains CKAN resolution as a fallback for descriptors without a direct source URL', async () => {
    const resource = {
      id: 'legacy-official-resource',
      resourceId: 'legacy-resource-id',
      provider: 'Official fixture provider',
    };
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          id: resource.resourceId,
          name: 'Legacy official WFS',
          format: 'WFS',
          url: 'https://example.test/geoserver/wfs?service=WFS&request=GetFeature&typeName=roads',
        },
      }),
    }));

    const resolved = await resolveCkanResource(resource, fetcher);

    expect(fetcher).toHaveBeenCalledWith(`${CKAN_RESOURCE}${resource.resourceId}`);
    expect(resolved).toMatchObject({
      resourceId: resource.resourceId,
      provider: resource.provider,
      format: 'WFS',
      url: 'https://example.test/geoserver/wfs?service=WFS&request=GetFeature&typeName=roads',
    });
  });

  it('fetches a published direct official WFS source and retains only the requested region', async () => {
    const resource = OFFICIAL_RESOURCES[0];
    const fetcher = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      expect(parsed.origin).toBe('https://wms.ign.gob.ar');
      expect(parsed.searchParams.get('outputFormat')).toBe('application/json');
      expect(parsed.searchParams.get('bbox')).toBe('-69.5,-31.8,-68.3,-29.9,EPSG:4326');
      expect(parsed.searchParams.get('typeName')).toBe('transporte:vial_nacional');
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            lineFeature('rn40-inside', [[-68.6, -31.5], [-68.7, -31.0]], { ruta: '40' }),
            lineFeature('outside', [[-70.8, -34], [-70.7, -33.9]], { ruta: '3' }),
          ],
        }),
      };
    });

    const result = await fetchOfficialRoadSource(resource, regionalBbox, fetcher);

    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual(['rn40-inside']);
    expect(result.source).toMatchObject({ id: resource.id, resourceId: resource.resourceId });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('builds the exact high-mountain Overpass highway query from the acquisition bbox', () => {
    const query = buildOverpassQuery(highMountainBbox);

    expect(query).toContain('[out:json][timeout:120]');
    expect(query).toContain('way["highway"](-30.25,-70.1,-29.25,-69.2);');
    expect(query).toContain('out tags geom;');
  });

  it('falls back to the secondary Overpass endpoint and normalizes returned ways', async () => {
    const endpoints = ['https://primary.test/interpreter', 'https://fallback.test/interpreter'];
    const fetcher = vi.fn(async (url, options) => {
      expect(options.method).toBe('POST');
      expect(options.headers['content-type']).toMatch(/form-urlencoded/i);
      if (url === endpoints[0]) return { ok: false, status: 429, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          elements: [{
            type: 'way',
            id: 321,
            tags: { highway: 'track' },
            geometry: [{ lon: -69.6, lat: -29.9 }, { lon: -69.7, lat: -29.8 }],
          }],
        }),
      };
    });

    const result = await fetchOverpassRoadSource(highMountainBbox, fetcher, endpoints);

    expect(result.endpoint).toBe(endpoints[1]);
    expect(result.featureCollection.features[0].properties.osmWayId).toBe(321);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails closed when fallback CKAN metadata cannot resolve a usable source URL', async () => {
    const resource = {
      id: 'legacy-official-resource',
      resourceId: 'legacy-resource-id',
      provider: 'Official fixture provider',
    };
    const fetcher = async () => ({ ok: true, json: async () => ({ success: true, result: { id: resource.resourceId } }) });

    await expect(resolveCkanResource(resource, fetcher)).rejects.toThrow(/source url/i);
  });
});

describe('Veladero acquisition artifact set', () => {
  it('writes an auditable source inventory and three clipped candidate snapshots', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'veladero-acquisition-'));
    const outputDir = path.join(tempRoot, 'artifacts');
    const overpassEndpoint = 'https://overpass.test/interpreter';
    const now = () => '2026-08-30T19:20:00.000Z';
    const fetcher = vi.fn(async (url) => {
      const text = String(url);
      if (text.includes('typeName=transporte%3Avial_nacional')) {
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [lineFeature('dnv-40', [[-68.55, -31.53], [-68.7, -31.0]], { ruta: '40' })] }) };
      }
      if (text.includes('typeName=transporte%3Avial_provincial')) {
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [lineFeature('ign-436', [[-68.7, -31.0], [-69.27, -30.19]], { ruta: '436' })] }) };
      }
      if (text === overpassEndpoint) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            elements: [{
              type: 'way', id: 999, tags: { highway: 'track' },
              geometry: [{ lon: -69.3, lat: -30.18 }, { lon: -69.9, lat: -29.4 }],
            }],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    try {
      const result = await acquireVeladeroSources({
        fetcher,
        outputDir,
        overpassEndpoints: [overpassEndpoint],
        now,
      });

      expect(result.inventory).toMatchObject({
        schemaVersion: 'sanjuan.road-source-inventory/v1',
        corridorId: 'veladero',
        generatedAt: '2026-08-30T19:20:00.000Z',
      });
      expect(result.inventory.sources.map((source) => [source.id, source.featureCount])).toEqual([
        ['dnv-rutas-nacionales-20260830', 1],
        ['ign-rutas-provinciales-2016-20260830', 1],
        ['osm-high-mountain-access-20260830', 1],
      ]);

      const dnv = JSON.parse(await readFile(path.join(outputDir, 'dnv-national-roads.v1.geojson'), 'utf8'));
      const ign = JSON.parse(await readFile(path.join(outputDir, 'ign-provincial-roads.v1.geojson'), 'utf8'));
      const osm = JSON.parse(await readFile(path.join(outputDir, 'osm-high-mountain-access.v1.geojson'), 'utf8'));
      const inventory = JSON.parse(await readFile(path.join(outputDir, 'source-inventory.json'), 'utf8'));
      expect(dnv.features[0].id).toBe('dnv-40');
      expect(ign.features[0].id).toBe('ign-436');
      expect(osm.features[0].id).toBe('osm-way-999');
      expect(inventory).toEqual(result.inventory);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
