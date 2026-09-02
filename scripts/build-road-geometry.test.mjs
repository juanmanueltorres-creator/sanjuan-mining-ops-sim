import { describe, expect, it } from 'vitest';
import { buildRoadGeometry } from './build-road-geometry.mjs';

const v1Metadata = {
  id: 'veladero',
  name: 'Fixture Veladero',
  origin: { id: 'san-juan', name: 'San Juan', lon: 0, lat: 0 },
  destination: { id: 'veladero', name: 'Veladero', lon: 0.03, lat: 0 },
  geometryClass: 'RECONSTRUCTED_ACCESS',
  totalDistanceKm: 360,
  segments: [
    { id: 'veladero-01', corridorId: 'veladero', startKm: 0, endKm: 205, distanceKm: 205, elevationMinM: 100, elevationMaxM: 200, roadClass: 'pavedLowland', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
    { id: 'veladero-02', corridorId: 'veladero', startKm: 205, endKm: 360, distanceKm: 155, elevationMinM: 200, elevationMaxM: 300, roadClass: 'highMountain', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
  ],
  nodes: [
    { id: 'tudcum', name: 'Tudcum', lon: 0.015, lat: 0, distanceKm: 205, elevationM: 200, evidenceRefs: ['tudcum'] },
  ],
  evidenceRefs: ['baseline-route'],
  retrievedAt: '2026-08-30',
  limitations: ['fixture'],
  evidence: [
    { id: 'baseline-route', role: 'DERIVED', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
    { id: 'tudcum', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
  ],
};

const v1Profile = {
  samples: [
    { distanceKm: 0, elevationM: 100 },
    { distanceKm: 205, elevationM: 200 },
    { distanceKm: 360, elevationM: 300 },
  ],
};

const sourceDocs = {
  official: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'official-1',
      properties: { sourceFeatureId: 'official-1' },
      geometry: { type: 'LineString', coordinates: [[0, 0], [0.015, 0]] },
    }],
  },
  osm: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'osm-way-1',
      properties: { sourceFeatureId: 'osm-way-1' },
      geometry: { type: 'LineString', coordinates: [[0.015, 0], [0.03, 0]] },
    }],
  },
};

function fixtureManifest() {
  return {
    schemaVersion: 'sanjuan.road-geometry-sources/v2',
    corridorId: 'veladero',
    guards: {
      sourceConnectionToleranceM: 250,
      maxUndocumentedGapKm: 2,
      maxDerivedChordKm: 5,
      chainageMinKm: 1,
      chainageMaxKm: 10,
    },
    anchors: [
      { id: 'san-juan', lon: 0, lat: 0, operationalKm: 0, maxDistanceToRouteKm: 0.1 },
      { id: 'tudcum', lon: 0.015, lat: 0, operationalKm: 205, maxDistanceToRouteKm: 0.1 },
      { id: 'conconta', lon: 0.02, lat: 0, maxDistanceToRouteKm: 0.1 },
      { id: 'despoblados', lon: 0.025, lat: 0, maxDistanceToRouteKm: 0.1 },
      { id: 'veladero', lon: 0.03, lat: 0, operationalKm: 360, maxDistanceToRouteKm: 0.1 },
    ],
    sources: [
      { id: 'official', provider: 'fixture', datasetName: 'official', sourceUrl: 'fixture://official', retrievedAt: '2026-08-30', role: 'PRIMARY', format: 'GeoJSON', featureIds: ['official-1'], limitations: [] },
      { id: 'osm', provider: 'fixture', datasetName: 'osm', sourceUrl: 'fixture://osm', retrievedAt: '2026-08-30', role: 'FALLBACK', format: 'OSM', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', featureIds: ['osm-way-1'], limitations: [] },
    ],
    evidence: [
      { id: 'official-evidence', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
      { id: 'osm-evidence', role: 'PRIMARY', sourceName: 'fixture', retrievedAt: '2026-08-30', limitations: [] },
      { id: 'build-evidence', role: 'DERIVED', sourceName: 'fixture build', retrievedAt: '2026-08-30', limitations: [] },
    ],
    routeSegments: [
      { id: 'public-01', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: 'official', sourceFeatureIds: ['official-1'], evidenceRefs: ['official-evidence'] },
      { id: 'access-01', geometryClass: 'RECONSTRUCTED_ACCESS', sourceDatasetId: 'osm', sourceFeatureIds: ['osm-way-1'], evidenceRefs: ['osm-evidence'] },
    ],
  };
}

describe('Veladero V2 road geometry builder', () => {
  it('calibrates 0 / Tudcum 205 / Veladero 360 and preserves V1 operational semantics', () => {
    const built = buildRoadGeometry(fixtureManifest(), sourceDocs, v1Metadata, v1Profile, { spacingMeters: 250 });

    expect(built.routeSamples.samples[0].distanceKm).toBe(0);
    expect(built.routeSamples.samples.some((sample) => Math.abs(sample.distanceKm - 205) < 1e-9)).toBe(true);
    expect(built.routeSamples.samples.at(-1).distanceKm).toBe(360);
    expect(built.metadata.segments).toEqual(v1Metadata.segments);
    expect(built.metadata.nodes).toEqual(v1Metadata.nodes);
    expect(built.corridor.properties.geometryClass).toBe('RECONSTRUCTED_ACCESS');
    expect(built.segments.features.map((feature) => feature.properties.geometryClass)).toEqual([
      'PUBLIC_ROAD',
      'RECONSTRUCTED_ACCESS',
    ]);
  });

  it('uses V1 route samples as the canonical legacy segment-label source', () => {
    const compatibilityMetadata = {
      ...v1Metadata,
      segments: [
        { ...v1Metadata.segments[0], id: 'veladero-01', startKm: 0, endKm: 205, distanceKm: 205 },
        { ...v1Metadata.segments[1], id: 'veladero-02', startKm: 205, endKm: 300, distanceKm: 95 },
        { ...v1Metadata.segments[1], id: 'veladero-03', startKm: 300, endKm: 360, distanceKm: 60 },
      ],
    };
    const legacyRouteSamples = [
      { distanceKm: 0, lon: 0, lat: 0, elevationM: 100, segmentId: 'veladero-01' },
      { distanceKm: 205, lon: 0.015, lat: 0, elevationM: 200, segmentId: 'veladero-02' },
      { distanceKm: 260, lon: 0.02, lat: 0, elevationM: 230, segmentId: 'veladero-02' },
      { distanceKm: 320, lon: 0.027, lat: 0, elevationM: 275, segmentId: 'veladero-02' },
      { distanceKm: 360, lon: 0.03, lat: 0, elevationM: 300, segmentId: 'veladero-03' },
    ];

    const built = buildRoadGeometry(
      fixtureManifest(),
      sourceDocs,
      compatibilityMetadata,
      v1Profile,
      { spacingMeters: 250, legacyRouteSamples },
    );
    const sampleAfterMetadataBoundary = built.routeSamples.samples.find(
      (sample) => sample.distanceKm > 300 && sample.distanceKm < 320,
    );

    expect(sampleAfterMetadataBoundary).toBeDefined();
    expect(sampleAfterMetadataBoundary.segmentId).toBe('veladero-02');
  });

  it('fails closed when a selected source feature id is absent from its frozen snapshot', () => {
    const manifest = fixtureManifest();
    manifest.routeSegments[0].sourceFeatureIds = ['missing-official'];
    expect(() => buildRoadGeometry(manifest, sourceDocs, v1Metadata, v1Profile)).toThrow(/missing-official/i);
  });

  it('fails closed when a derived connector exceeds maxDerivedChordKm', () => {
    const manifest = fixtureManifest();
    manifest.guards.maxDerivedChordKm = 0.1;
    manifest.routeSegments.splice(1, 0, {
      id: 'derived-too-long',
      geometryClass: 'RECONSTRUCTED_ACCESS',
      sourceDatasetId: 'derived',
      sourceFeatureIds: [],
      evidenceRefs: ['build-evidence'],
      derivedGeometry: { type: 'LineString', coordinates: [[0.015, 0], [0.025, 0]] },
      method: 'fixture connector',
      limitations: ['fixture'],
    });
    expect(() => buildRoadGeometry(manifest, sourceDocs, v1Metadata, v1Profile)).toThrow(/derived chord/i);
  });
});
