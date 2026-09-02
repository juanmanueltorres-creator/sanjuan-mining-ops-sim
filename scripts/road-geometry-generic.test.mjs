import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGeometry } from './build-road-geometry.mjs';
import { validateRoadGeometry } from './validate-road-geometry.mjs';

const v1Metadata = {
  schemaVersion: 'sanjuan.corridor-metadata/v1',
  id: 'hualilan',
  name: 'San Juan → Hualilán',
  totalDistanceKm: 120,
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [
    {
      id: 'hualilan-01',
      corridorId: 'hualilan',
      startKm: 0,
      endKm: 120,
      distanceKm: 120,
      elevationMinM: 650,
      elevationMaxM: 1700,
      roadClass: 'mixed',
      geometryConfidence: 'RECONSTRUCTED_ACCESS',
      environmentNodeIds: [],
    },
  ],
  nodes: [],
  evidenceRefs: ['route-build'],
  evidence: [
    {
      id: 'route-build',
      role: 'DERIVED',
      sourceName: 'fixture',
      retrievedAt: '2026-09-01',
      limitations: ['fixture'],
    },
  ],
  retrievedAt: '2026-09-01',
  limitations: ['fixture'],
};

const manifest = {
  schemaVersion: 'sanjuan.road-geometry-sources/v2',
  corridorId: 'hualilan',
  generatedAt: '2026-09-01T00:00:00Z',
  guards: {
    sourceConnectionToleranceM: 250,
    maxUndocumentedGapKm: 2,
    // Synthetic fixture only: its two coarse chords are ~51 km and ~47 km.
    maxDerivedChordKm: 60,
    chainageMinKm: 0,
    chainageMaxKm: 200,
  },
  anchors: [
    { id: 'san-juan', lon: -68.5364, lat: -31.5375, operationalKm: 0, maxDistanceToRouteKm: 2 },
    { id: 'hualilan', lon: -68.95, lat: -30.73333, operationalKm: 120, maxDistanceToRouteKm: 2 },
  ],
  sources: [
    {
      id: 'fixture-derived',
      provider: 'fixture',
      datasetName: 'fixture',
      sourceUrl: 'fixture',
      retrievedAt: '2026-09-01',
      role: 'FALLBACK',
      format: 'GeoJSON',
      featureIds: [],
      limitations: ['fixture'],
    },
  ],
  evidence: [],
  routeSegments: [
    {
      id: 'hualilan-derived',
      corridorId: 'hualilan',
      geometryClass: 'RECONSTRUCTED_ACCESS',
      sourceDatasetId: 'fixture-derived',
      sourceFeatureIds: [],
      evidenceRefs: ['route-build'],
      derivedGeometry: {
        type: 'LineString',
        coordinates: [
          [-68.5364, -31.5375],
          [-68.7, -31.1],
          [-68.95, -30.73333],
        ],
      },
      limitations: ['fixture'],
    },
  ],
};

const profile = {
  samples: [
    { distanceKm: 0, elevationM: 650 },
    { distanceKm: 120, elevationM: 1700 },
  ],
};

test('V2 road geometry pipeline accepts a non-Veladero corridor with preserved operational endpoints', () => {
  const built = buildRoadGeometry(manifest, {}, v1Metadata, profile);

  assert.equal(built.routeSamples.samples[0].distanceKm, 0);
  assert.equal(built.routeSamples.samples.at(-1).distanceKm, 120);
  assert.ok(built.routeSamples.samples.some((sample) => sample.distanceKm === 120));

  assert.doesNotThrow(() => validateRoadGeometry({
    manifest,
    sourceDocs: {},
    v1Metadata,
    metadata: built.metadata,
    corridor: built.corridor,
    segments: built.segments,
    routeSamples: built.routeSamples,
  }));
});
