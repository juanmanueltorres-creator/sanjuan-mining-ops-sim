import { describe, expect, it, vi } from 'vitest';
import { CKAN_RESOURCE, OFFICIAL_RESOURCES, fetchOfficialRoadSource, resolveCkanResource } from './acquire-road-sources.mjs';

const CKAN_PACKAGE = 'https://datos.gob.ar/api/3/action/package_show?id=';
const regionalBbox = [-69.5, -31.8, -68.3, -29.9];
const resource = {
  id: 'dnv-rutas-nacionales-20260830',
  datasetId: 'transporte-rutas-nacionales',
  resourceId: 'stale-resource-id',
  provider: 'Dirección Nacional de Vialidad / Datos Argentina',
};

function lineFeature(id, coordinates, properties = {}) {
  return { type: 'Feature', id, properties, geometry: { type: 'LineString', coordinates } };
}

describe('CKAN dataset fallback', () => {
  it('stores the published direct WFS descriptors used for acquisition', () => {
    expect(OFFICIAL_RESOURCES).toMatchObject([
      {
        resourceId: 'd58b91ee-c46a-4260-8d89-69438417d73b',
        format: 'wfs',
        url: 'https://wms.ign.gob.ar/geoserver/transporte/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=transporte:vial_nacional',
        catalogUrl: 'https://datos.transporte.gob.ar/dataset/rutas-nacionales/archivo/d58b91ee-c46a-4260-8d89-69438417d73b',
      },
      {
        resourceId: '903edc8b-da5b-4f3e-b555-eef41b89c3f3',
        format: 'wfs',
        url: 'https://wms.ign.gob.ar/geoserver/transporte/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=transporte:vial_provincial',
        catalogUrl: 'https://datos.transporte.gob.ar/dataset/rutas-provinciales/archivo/903edc8b-da5b-4f3e-b555-eef41b89c3f3',
      },
    ]);
  });

  it('prefers a published direct WFS source without touching CKAN metadata', async () => {
    const directResource = {
      id: 'dnv-rutas-nacionales-wfs-20260830',
      resourceId: 'd58b91ee-c46a-4260-8d89-69438417d73b',
      provider: 'Dirección Nacional de Vialidad / Datos Abiertos de Transporte',
      name: 'Rutas Nacionales WFS',
      format: 'wfs',
      url: 'https://wms.ign.gob.ar/geoserver/transporte/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=transporte:vial_nacional',
    };
    const fetcher = vi.fn(async (url) => {
      const text = String(url);
      if (text.startsWith('https://wms.ign.gob.ar/geoserver/transporte/ows?')) {
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [
          lineFeature('rn40-inside', [[-68.6, -31.5], [-68.7, -31.0]], { ruta: '40' }),
        ] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await fetchOfficialRoadSource(directResource, regionalBbox, fetcher);

    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith(CKAN_RESOURCE))).toBe(false);
    expect(result.source).toMatchObject({
      resourceId: 'd58b91ee-c46a-4260-8d89-69438417d73b',
      format: 'wfs',
      url: directResource.url,
    });
    expect(result.requestUrl).toContain('typeName=transporte%3Avial_nacional');
    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual(['rn40-inside']);
  });

  it('falls back from a stale resource id to package_show and selects the published GeoJSON resource', async () => {
    const fetcher = vi.fn(async (url) => {
      const text = String(url);
      if (text === `${CKAN_RESOURCE}${resource.resourceId}`) return { ok: false, status: 404, json: async () => ({}) };
      if (text === `${CKAN_PACKAGE}${resource.datasetId}`) {
        return { ok: true, json: async () => ({ success: true, result: { resources: [
          { id: 'shape-id', name: 'Rutas Nacionales Shape', format: 'zip', url: 'https://example.test/roads.zip' },
          { id: 'current-geojson-id', name: 'Rutas Nacionales Archivo GeoJSON', format: 'geojson', url: 'https://example.test/roads.geojson' },
        ] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const resolved = await resolveCkanResource(resource, fetcher);
    expect(resolved).toMatchObject({ resourceId: 'current-geojson-id', format: 'geojson', url: 'https://example.test/roads.geojson' });
  });

  it('accepts a direct GeoJSON resource and clips it to the acquisition bbox', async () => {
    const fetcher = vi.fn(async (url) => {
      const text = String(url);
      if (text === `${CKAN_RESOURCE}${resource.resourceId}`) return { ok: false, status: 404, json: async () => ({}) };
      if (text === `${CKAN_PACKAGE}${resource.datasetId}`) {
        return { ok: true, json: async () => ({ success: true, result: { resources: [
          { id: 'current-geojson-id', name: 'Rutas Nacionales Archivo GeoJSON', format: 'geojson', url: 'https://example.test/roads.geojson' },
        ] } }) };
      }
      if (text === 'https://example.test/roads.geojson') {
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [
          lineFeature('rn40-inside', [[-68.6, -31.5], [-68.7, -31.0]], { ruta: '40' }),
          lineFeature('outside', [[-70.8, -34.0], [-70.7, -33.9]], { ruta: '3' }),
        ] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await fetchOfficialRoadSource(resource, regionalBbox, fetcher);
    expect(result.source.resourceId).toBe('current-geojson-id');
    expect(result.requestUrl).toBe('https://example.test/roads.geojson');
    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual(['rn40-inside']);
  });
});
