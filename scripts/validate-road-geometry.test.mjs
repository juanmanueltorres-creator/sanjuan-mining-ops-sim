import { describe, expect, it } from 'vitest';
import { buildRoadGeometry } from './build-road-geometry.mjs';
import { validateRoadGeometry } from './validate-road-geometry.mjs';

const metadataV1 = {
  id: 'veladero', name: 'Fixture',
  origin: { id: 'san-juan', name: 'San Juan', lon: 0, lat: 0 },
  destination: { id: 'veladero', name: 'Veladero', lon: 0.03, lat: 0 },
  geometryClass: 'RECONSTRUCTED_ACCESS', totalDistanceKm: 360,
  segments: [
    { id: 'veladero-01', corridorId: 'veladero', startKm: 0, endKm: 205, distanceKm: 205, elevationMinM: 100, elevationMaxM: 200, roadClass: 'pavedLowland', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
    { id: 'veladero-02', corridorId: 'veladero', startKm: 205, endKm: 360, distanceKm: 155, elevationMinM: 200, elevationMaxM: 300, roadClass: 'highMountain', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
  ],
  nodes: [{ id: 'tudcum', name: 'Tudcum', lon: 0.015, lat: 0, distanceKm: 205, elevationM: 200, evidenceRefs: ['tudcum'] }],
  evidenceRefs: ['baseline-route'], retrievedAt: '2026-08-30', limitations: [],
  evidence: [
    { id: 'baseline-route', role: 'DERIVED', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
    { id: 'tudcum', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
  ],
};
const profileV1 = { samples: [{ distanceKm: 0, elevationM: 100 }, { distanceKm: 205, elevationM: 200 }, { distanceKm: 360, elevationM: 300 }] };
const sourceDocs = {
  official: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'official-1', properties: { sourceFeatureId: 'official-1' }, geometry: { type: 'LineString', coordinates: [[0, 0], [0.015, 0]] } }] },
  osm: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'osm-way-1', properties: { sourceFeatureId: 'osm-way-1' }, geometry: { type: 'LineString', coordinates: [[0.015, 0], [0.03, 0]] } }] },
};
const manifest = {
  schemaVersion: 'sanjuan.road-geometry-sources/v2', corridorId: 'veladero', generatedAt: '2026-08-30',
  guards: { sourceConnectionToleranceM: 250, maxUndocumentedGapKm: 2, maxDerivedChordKm: 5, chainageMinKm: 1, chainageMaxKm: 10 },
  anchors: [
    { id: 'san-juan', lon: 0, lat: 0, operationalKm: 0, maxDistanceToRouteKm: 0.1 },
    { id: 'tudcum', lon: 0.015, lat: 0, operationalKm: 205, maxDistanceToRouteKm: 0.1 },
    { id: 'conconta', lon: 0.02, lat: 0, maxDistanceToRouteKm: 0.1 },
    { id: 'despoblados', lon: 0.025, lat: 0, maxDistanceToRouteKm: 0.1 },
    { id: 'veladero', lon: 0.03, lat: 0, operationalKm: 360, maxDistanceToRouteKm: 0.1 },
  ],
  sources: [
    { id: 'official', provider: 'fixture', datasetName: 'official', sourceUrl: 'fixture://official', retrievedAt: '2026-08-30', role: 'PRIMARY', format: 'GeoJSON', featureIds: ['official-1'], limitations: [] },
    { id: 'osm', provider: 'fixture', datasetName: 'osm', sourceUrl: 'fixture://osm', retrievedAt: '2026-08-30', role: 'FALLBACK', format: 'OSM', featureIds: ['osm-way-1'], limitations: [] },
  ],
  evidence: [
    { id: 'official-evidence', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
    { id: 'osm-evidence', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
  ],
  routeSegments: [
    { id: 'public-01', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: 'official', sourceFeatureIds: ['official-1'], evidenceRefs: ['official-evidence'] },
    { id: 'access-01', geometryClass: 'RECONSTRUCTED_ACCESS', sourceDatasetId: 'osm', sourceFeatureIds: ['osm-way-1'], evidenceRefs: ['osm-evidence'] },
  ],
};

function validBundle() {
  const built = buildRoadGeometry(manifest, sourceDocs, metadataV1, profileV1);
  return { manifest, sourceDocs, v1Metadata: metadataV1, ...built };
}

describe('Veladero V2 road geometry validator', () => {
  it('accepts a valid deterministic V2 bundle and reports calibration/chainage metrics', () => {
    const report = validateRoadGeometry(validBundle());
    expect(report.measuredChainageKm).toBeGreaterThan(1);
    expect(report.operationalStartKm).toBe(0);
    expect(report.operationalEndKm).toBe(360);
    expect(report.tudcumOperationalKm).toBe(205);
  });

  it('fails closed if a V2 source feature id does not exist in the frozen snapshot', () => {
    const bundle = validBundle();
    bundle.segments.features[0].properties.sourceFeatureIds = ['missing-source-id'];
    expect(() => validateRoadGeometry(bundle)).toThrow(/missing-source-id/i);
  });

  it('fails closed if V2 changes the V1 operational segments or runtime nodes', () => {
    const bundle = validBundle();
    bundle.metadata.segments = bundle.metadata.segments.map((segment) => ({ ...segment }));
    bundle.metadata.segments[0].endKm = 204;
    expect(() => validateRoadGeometry(bundle)).toThrow(/operational segments/i);
  });
});
