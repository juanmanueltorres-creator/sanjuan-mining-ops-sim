import { describe, expect, it } from 'vitest';
import {
  LOS_AZULES_SOURCE_SELECTION,
  buildLosAzulesAuthoringBundle,
  clipSourceFeature,
} from './author-los-azules-v2.mjs';

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

describe('Los Azules V2 authoring contract', () => {
  it('pins the reviewed official and OSM source-feature chain', () => {
    expect(LOS_AZULES_SOURCE_SELECTION.dnv.map((entry) => entry.id)).toEqual([
      'vial_nacional.2175',
      'vial_nacional.2570',
      'vial_nacional.2565',
      'vial_nacional.1192',
      'vial_nacional.2201',
      'vial_nacional.1174',
      'vial_nacional.1175',
      'vial_nacional.1172',
      'vial_nacional.280',
      'vial_nacional.1869',
    ]);
    expect(LOS_AZULES_SOURCE_SELECTION.ign.map((entry) => entry.id)).toEqual([
      'vial_provincial.10291',
      'vial_provincial.10290',
      'vial_provincial.10289',
      'vial_provincial.10272',
    ]);
    expect(LOS_AZULES_SOURCE_SELECTION.osm.map((entry) => entry.id)).toEqual([
      'osm-way-179986953',
      'osm-way-996528070',
      'osm-way-1436597152',
      'osm-way-996528083',
      'osm-way-1436646663',
      'osm-way-1436646662',
      'osm-way-1436828911',
      'osm-way-1436828910',
      'osm-way-1436828909',
      'osm-way-1436828908',
      'osm-way-1436828902',
      'osm-way-1436828898',
      'osm-way-1441747900',
      'osm-way-1441747899',
      'osm-way-1441747905',
      'osm-way-1442787217',
      'osm-way-1444386972',
      'osm-way-1444392118',
    ]);
  });

  it('clips reviewed source geometry between exact source junctions and fails closed on the wrong route', () => {
    const raw = feature('road-a', '149', [
      [-68.0, -31.0],
      [-68.1, -31.1],
      [-68.2, -31.2],
      [-68.3, -31.3],
    ]);

    const clipped = clipSourceFeature(raw, {
      id: 'road-a',
      expectedRoute: '149',
      entry: [-68.3, -31.3],
      exit: [-68.1, -31.1],
    }, 'los-azules');

    expect(clipped).toMatchObject({
      id: 'road-a',
      properties: {
        sourceFeatureId: 'road-a',
        selectedForCorridor: 'los-azules',
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

    expect(() => clipSourceFeature(raw, {
      id: 'road-a',
      expectedRoute: '40',
      entry: [-68.3, -31.3],
      exit: [-68.1, -31.1],
    }, 'los-azules')).toThrow(/route designation/i);
  });

  it('preserves 0→164→276 operational calibration without a duplicate RP406→OSM handoff anchor and never promotes OSM access to PUBLIC_ROAD', () => {
    const selected = {
      dnv: [
        feature('dnv-regional', '40', [[-68.55, -31.53], [-68.80, -30.98]]),
        feature('dnv-rn149', '149', [[-68.80, -30.98], [-69.44, -31.56]]),
      ],
      ign: [
        feature('ign-rp436', '436', [[-68.80, -30.98], [-68.81, -30.99]]),
        feature('ign-rp406', '406', [[-69.44, -31.56], [-69.428, -31.347]]),
      ],
      osm: [feature('osm-access', null, [[-69.428, -31.347], [-70.2209, -31.1126]], {
        highway: 'tertiary',
        ref: 'RP437',
        name: 'Camino a Los Azules',
      })],
    };
    const inventory = {
      corridorId: 'los-azules',
      generatedAt: '2026-09-02T02:44:49.121Z',
      sources: [
        { id: 'dnv-rutas-nacionales-20260830', provider: 'DNV', sourceUrl: 'https://dnv.test', catalogUrl: 'https://catalog.test/dnv', retrievedAt: '2026-09-02T02:44:49.121Z', license: 'Otra (Abierta)' },
        { id: 'ign-rutas-provinciales-2016-20260830', provider: 'IGN', sourceUrl: 'https://ign.test', catalogUrl: 'https://catalog.test/ign', retrievedAt: '2026-09-02T02:44:49.121Z', license: 'Otra (Abierta)' },
        { id: 'osm-road-access-los-azules-v2', provider: 'OSM', sourceUrl: 'https://overpass.test', retrievedAt: '2026-09-02T02:44:49.121Z', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' },
      ],
    };

    const bundle = buildLosAzulesAuthoringBundle({
      selected,
      inventory,
      acquisition: { workflowRunId: 123, headSha: 'abc' },
      origin: [-68.5364, -31.5375],
      calingasta: [-69.427381783, -31.335410441],
      destination: [-70.22138, -31.11277],
    });

    expect(bundle.manifest.corridorId).toBe('los-azules');
    expect(bundle.manifest.anchors.filter((anchor) => Number.isFinite(anchor.operationalKm))).toEqual([
      expect.objectContaining({ id: 'san-juan', operationalKm: 0 }),
      expect.objectContaining({ id: 'calingasta', operationalKm: 164 }),
      expect.objectContaining({ id: 'los-azules', operationalKm: 276 }),
    ]);
    expect(bundle.manifest.anchors.map((anchor) => anchor.id)).not.toContain('rp406-osm-access-junction');
    expect(bundle.manifest.routeSegments.some((segment) => segment.sourceDatasetId === 'osm-los-azules-access-v2' && segment.geometryClass === 'PUBLIC_ROAD')).toBe(false);
    expect(bundle.manifest.routeSegments.find((segment) => segment.sourceDatasetId === 'osm-los-azules-access-v2')?.geometryClass).toBe('RECONSTRUCTED_ACCESS');
    expect(bundle.manifest.routeSegments.at(-1)?.geometryClass).toBe('APPROXIMATE_APPROACH');
    expect(bundle.manifest.guards.maxDerivedChordKm).toBe(2);
  });
});
