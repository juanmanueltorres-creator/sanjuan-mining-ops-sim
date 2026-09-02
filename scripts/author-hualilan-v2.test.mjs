import { describe, expect, it } from 'vitest';
import {
  HUALILAN_SOURCE_SELECTION,
  buildHualilanAuthoringBundle,
  clipSourceFeature,
} from './author-hualilan-v2.mjs';

function feature(id, route, coordinates, extra = {}) {
  return {
    type: 'Feature',
    id,
    properties: {
      designacion_de_red_vial: route,
      sourceFeatureId: id,
      ...extra,
    },
    geometry: { type: 'LineString', coordinates },
  };
}

describe('Hualilan V2 authoring contract', () => {
  it('pins the reviewed source-feature chain and keeps OSM access separate from public-road claims', () => {
    expect(HUALILAN_SOURCE_SELECTION.dnv.map((entry) => entry.id)).toEqual([
      'vial_nacional.2175',
      'vial_nacional.2570',
      'vial_nacional.2565',
      'vial_nacional.1192',
      'vial_nacional.2201',
      'vial_nacional.1174',
      'vial_nacional.1175',
      'vial_nacional.1172',
      'vial_nacional.280',
      'vial_nacional.1870',
    ]);
    expect(HUALILAN_SOURCE_SELECTION.ign.map((entry) => entry.id)).toEqual([
      'vial_provincial.10291',
      'vial_provincial.10290',
      'vial_provincial.10289',
    ]);
    expect(HUALILAN_SOURCE_SELECTION.osm.map((entry) => entry.id)).toEqual([
      'osm-way-408648158',
      'osm-way-644573146',
    ]);
  });

  it('clips one reviewed source feature between exact source junctions and preserves the source id', () => {
    const raw = feature('road-a', '40', [
      [-68.0, -31.0],
      [-68.1, -31.1],
      [-68.2, -31.2],
      [-68.3, -31.3],
    ]);

    const clipped = clipSourceFeature(raw, {
      id: 'road-a',
      expectedRoute: '40',
      entry: [-68.3, -31.3],
      exit: [-68.1, -31.1],
    }, 'hualilan');

    expect(clipped).toMatchObject({
      id: 'road-a',
      properties: {
        sourceFeatureId: 'road-a',
        selectedForCorridor: 'hualilan',
        sourceGeometryClipped: true,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-68.3, -31.3],
          [-68.2, -31.2],
          [-68.1, -31.1],
        ],
      },
    });
  });

  it('fails closed when an expected source junction or route designation is absent', () => {
    const raw = feature('road-a', '149', [[-68.0, -31.0], [-68.1, -31.1]]);

    expect(() => clipSourceFeature(raw, {
      id: 'road-a',
      expectedRoute: '40',
      entry: [-68.0, -31.0],
      exit: [-68.1, -31.1],
    }, 'hualilan')).toThrow(/route designation/i);

    expect(() => clipSourceFeature(feature('road-b', '40', [[-68.0, -31.0], [-68.1, -31.1]]), {
      id: 'road-b',
      expectedRoute: '40',
      entry: [-68.0, -31.0],
      exit: [-68.2, -31.2],
    }, 'hualilan')).toThrow(/junction/i);
  });

  it('builds a manifest that preserves 0→120 operational calibration and never promotes OSM access to PUBLIC_ROAD', () => {
    const selected = {
      dnv: [feature('dnv-a', '40', [[-68.55, -31.53], [-68.64, -31.10]])],
      ign: [feature('ign-a', '436', [[-68.64, -31.10], [-68.80, -30.98]])],
      osm: [feature('osm-a', null, [[-68.80, -30.98], [-68.95, -30.735]], { highway: 'service' })],
    };
    const inventory = {
      corridorId: 'hualilan',
      generatedAt: '2026-09-02T02:02:45.989Z',
      sources: [
        { id: 'dnv-rutas-nacionales-20260830', provider: 'DNV', sourceUrl: 'https://dnv.test', catalogUrl: 'https://catalog.test/dnv', retrievedAt: '2026-09-02T02:02:45.989Z', license: 'Otra (Abierta)' },
        { id: 'ign-rutas-provinciales-2016-20260830', provider: 'IGN', sourceUrl: 'https://ign.test', catalogUrl: 'https://catalog.test/ign', retrievedAt: '2026-09-02T02:02:45.989Z', license: 'Otra (Abierta)' },
        { id: 'osm-road-access-hualilan-v2', provider: 'OSM', sourceUrl: 'https://overpass.test', retrievedAt: '2026-09-02T02:02:45.989Z', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' },
      ],
    };

    const bundle = buildHualilanAuthoringBundle({
      selected,
      inventory,
      acquisition: { workflowRunId: 123, headSha: 'abc' },
      origin: [-68.5364, -31.5375],
      destination: [-68.95, -30.73333],
    });

    expect(bundle.manifest.corridorId).toBe('hualilan');
    expect(bundle.manifest.anchors.filter((anchor) => Number.isFinite(anchor.operationalKm))).toEqual([
      expect.objectContaining({ id: 'san-juan', operationalKm: 0 }),
      expect.objectContaining({ id: 'hualilan', operationalKm: 120 }),
    ]);
    expect(bundle.manifest.routeSegments.find((segment) => segment.sourceDatasetId === 'osm-hualilan-access-v2')?.geometryClass)
      .toBe('RECONSTRUCTED_ACCESS');
    expect(bundle.manifest.routeSegments.at(-1)?.geometryClass).toBe('APPROXIMATE_APPROACH');
    expect(bundle.manifest.guards.maxDerivedChordKm).toBe(2);
  });
});
