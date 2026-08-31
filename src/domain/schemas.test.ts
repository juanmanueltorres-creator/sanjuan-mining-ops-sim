import { describe, expect, it } from 'vitest';
import { parseCorridor, parseOperationalRun, parseSourceState } from './schemas';

const validRun = {
  id: 'run-1',
  targetDate: '2026-08-30',
  issuedAt: '2026-08-30T06:00:00-03:00',
  dataAsOf: '2026-08-30T05:30:00-03:00',
  timezone: 'America/Argentina/San_Juan',
  mode: 'SIMULATED',
  modelVersion: 'v0',
  scenarioVersion: 'v0',
  seed: 'fixture-seed',
  environmentSnapshotId: 'env-1',
  provenance: ['e-run'],
};

const validCorridor = {
  id: 'hualilan',
  name: 'San Juan → Hualilán',
  origin: { id: 'san-juan', name: 'San Juan', lat: -31.5375, lon: -68.5364 },
  destination: { id: 'hualilan', name: 'Hualilán', lat: -30.73485, lon: -68.95394 },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-68.5364, -31.5375],
      [-68.95394, -30.73485],
    ],
  },
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [
    {
      id: 'hualilan-01',
      corridorId: 'hualilan',
      startKm: 0,
      endKm: 10,
      distanceKm: 10,
      elevationMinM: 600,
      elevationMaxM: 1600,
      roadClass: 'pavedLowland',
      geometryConfidence: 'RECONSTRUCTED_ACCESS',
      environmentNodeIds: [],
    },
  ],
  nodes: [],
  elevationProfile: {
    source: 'test',
    resolution: 'test',
    method: 'test',
    samples: [
      { distanceKm: 0, elevationM: 600 },
      { distanceKm: 10, elevationM: 1600 },
    ],
    limitations: [],
  },
  routeSamples: [
    { distanceKm: 0, lon: -68.5364, lat: -31.5375, elevationM: 600, segmentId: 'hualilan-01' },
    { distanceKm: 10, lon: -68.95394, lat: -30.73485, elevationM: 1600, segmentId: 'hualilan-01' },
  ],
  evidenceRefs: ['e-corridor'],
  retrievedAt: '2026-08-30T00:00:00Z',
  limitations: ['Reconstructed from public road references.'],
};

describe('domain schemas', () => {
  it('rejects an observed mode in the V0 operational run', () => {
    expect(() => parseOperationalRun({ ...validRun, mode: 'OBSERVED' })).toThrow();
  });

  it('requires an explicit deterministic seed in every operational run', () => {
    expect(() => parseOperationalRun({ ...validRun, seed: undefined })).toThrow();
    expect((parseOperationalRun(validRun) as unknown as { seed: string }).seed).toBe('fixture-seed');
  });

  it('accepts every approved source state', () => {
    for (const state of ['READY', 'STALE', 'PARTIAL', 'UNAVAILABLE'] as const) {
      expect(parseSourceState(state)).toBe(state);
    }
  });

  it('rejects a corridor without evidence references', () => {
    expect(() => parseCorridor({ ...validCorridor, evidenceRefs: [] })).toThrow();
  });

  it('preserves the geometry evidence class', () => {
    expect(parseCorridor(validCorridor).geometryClass).toBe('RECONSTRUCTED_ACCESS');
  });

  it('preserves segment-level road geometry provenance and route-sample audit metadata', () => {
    const parsed = parseCorridor({
      ...validCorridor,
      geometrySegments: [{
        id: 'hualilan-public-01',
        corridorId: 'hualilan',
        geometryClass: 'PUBLIC_ROAD',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-68.5364, -31.5375],
            [-68.70, -31.10],
          ],
        },
        sourceFeatureIds: ['dnv:fixture:1'],
        evidenceRefs: ['dnv-routes'],
        sourceDatasetId: 'dnv-rutas-nacionales-20260830',
        sourceRetrievedAt: '2026-08-30',
        sourceLicense: 'Otra (Abierta)',
        limitations: ['Reference geometry; not a live road-status source.'],
      }],
      routeSamples: [
        {
          ...validCorridor.routeSamples[0],
          geometryChainageKm: 0,
          geometrySegmentId: 'hualilan-public-01',
          geometryClass: 'PUBLIC_ROAD',
        },
        {
          ...validCorridor.routeSamples[1],
          geometryChainageKm: 9.8,
          geometrySegmentId: 'hualilan-public-01',
          geometryClass: 'PUBLIC_ROAD',
        },
      ],
    });

    expect(parsed.geometrySegments?.[0]).toMatchObject({
      id: 'hualilan-public-01',
      geometryClass: 'PUBLIC_ROAD',
      sourceDatasetId: 'dnv-rutas-nacionales-20260830',
    });
    expect(parsed.routeSamples[1]).toMatchObject({
      geometryChainageKm: 9.8,
      geometrySegmentId: 'hualilan-public-01',
      geometryClass: 'PUBLIC_ROAD',
    });
  });

  it('allows derived road geometry without fake upstream feature ids while public roads remain source-backed', () => {
    const derivedSegment = {
      id: 'hualilan-derived-01',
      corridorId: 'hualilan',
      geometryClass: 'RECONSTRUCTED_ACCESS',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-68.5364, -31.5375],
          [-68.55, -31.53],
        ],
      },
      sourceFeatureIds: [],
      evidenceRefs: ['derived-route'],
      sourceDatasetId: 'derived-route-build-v1',
      sourceRetrievedAt: '2026-08-30',
      limitations: ['Explicit derived connector; not source road geometry.'],
    };

    const parsed = parseCorridor({
      ...validCorridor,
      geometrySegments: [derivedSegment],
    });
    expect(parsed.geometrySegments?.[0].sourceFeatureIds).toEqual([]);

    expect(() => parseCorridor({
      ...validCorridor,
      geometrySegments: [{
        ...derivedSegment,
        id: 'hualilan-public-without-source',
        geometryClass: 'PUBLIC_ROAD',
      }],
    })).toThrow();
  });

  it('keeps V1 corridors valid when geometrySegments are absent', () => {
    expect(parseCorridor(validCorridor)).not.toHaveProperty('geometrySegments');
  });
});
