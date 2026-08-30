import { describe, expect, it } from 'vitest';
import {
  clipFeatureCollectionToBbox,
  normalizeOverpassWays,
  normalizeWfsFeatureCollection,
  normalizeWfsUrl,
} from './acquire-road-sources.mjs';

const regionalBbox = [-69.5, -31.8, -68.3, -29.9];

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
