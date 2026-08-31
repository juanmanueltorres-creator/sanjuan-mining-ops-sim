import { describe, expect, it } from 'vitest';
import { loadStaticOperationData, loadStaticRunArtifacts, loadTrafficCalibration } from './loadOperation';

const evidence = (id: string) => ({
  id,
  role: 'PRIMARY',
  sourceName: `source-${id}`,
  retrievedAt: '2026-08-30',
  limitations: [],
});

const projectEvidence = Array.from({ length: 10 }, (_, i) => evidence(`project-${i + 1}`));
const projects = Array.from({ length: 10 }, (_, i) => ({
  id: `project-${i + 1}`,
  name: i === 0 ? 'Hualilán' : i === 1 ? 'Veladero' : i === 2 ? 'Los Azules' : `Project ${i + 1}`,
  lat: -31 + i * 0.01,
  lon: -69 - i * 0.01,
  activeOperationalDestination: i < 3,
  evidenceRefs: [`project-${i + 1}`],
}));

function corridorBundle(id: string) {
  const evidenceId = `${id}-source`;
  return {
    metadata: {
      schemaVersion: 'sanjuan.corridor-metadata/v1',
      id,
      name: id,
      origin: { id: 'san-juan', name: 'San Juan', lat: -31.53, lon: -68.53 },
      destination: { id, name: id, lat: -30.5, lon: -69.5 },
      geometryClass: 'RECONSTRUCTED_ACCESS',
      totalDistanceKm: 10,
      segments: [{
        id: `${id}-01`, corridorId: id, startKm: 0, endKm: 10, distanceKm: 10,
        elevationMinM: 600, elevationMaxM: 1000, roadClass: 'mountainRoad',
        geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [],
      }],
      nodes: [],
      evidenceRefs: [evidenceId],
      retrievedAt: '2026-08-30',
      limitations: [],
      evidence: [evidence(evidenceId)],
    },
    geometry: {
      type: 'Feature',
      properties: { id, geometryClass: 'RECONSTRUCTED_ACCESS', evidenceRefs: [evidenceId] },
      geometry: { type: 'LineString', coordinates: [[-68.53, -31.53], [-69.5, -30.5]] },
    },
    profile: {
      source: 'fixture', resolution: 'fixture', method: 'fixture',
      samples: [{ distanceKm: 0, elevationM: 600 }, { distanceKm: 10, elevationM: 1000 }],
      limitations: [],
    },
    routeSamples: {
      samples: [
        { distanceKm: 0, lon: -68.53, lat: -31.53, elevationM: 600, segmentId: `${id}-01` },
        { distanceKm: 10, lon: -69.5, lat: -30.5, elevationM: 1000, segmentId: `${id}-01` },
      ],
    },
  };
}

function veladeroV2Bundle() {
  const base = corridorBundle('veladero');
  const routeEvidence = {
    id: 'veladero-route-geometry-build-v2',
    role: 'DERIVED',
    sourceName: 'Veladero V2 route assembly',
    retrievedAt: '2026-08-30',
    limitations: ['Synthetic fixture only.'],
  };
  const sourceId = 'veladero-derived-geometry-v2';
  const geometrySegmentId = 'veladero-derived-fixture-v2';
  return {
    metadata: {
      ...base.metadata,
      schemaVersion: 'sanjuan.corridor-metadata/v2',
      geometryVersion: 'v2',
      evidenceRefs: [...base.metadata.evidenceRefs, routeEvidence.id],
    },
    geometry: {
      ...base.geometry,
      properties: {
        ...base.geometry.properties,
        evidenceRefs: [...base.geometry.properties.evidenceRefs, routeEvidence.id],
      },
    },
    profile: base.profile,
    routeSamples: {
      schemaVersion: 'sanjuan.route-samples/v2',
      corridorId: 'veladero',
      samples: base.routeSamples.samples.map((sample, index) => ({
        ...sample,
        geometryChainageKm: index * 10,
        geometrySegmentId,
        geometryClass: 'RECONSTRUCTED_ACCESS',
      })),
    },
    segments: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: geometrySegmentId,
        properties: {
          id: geometrySegmentId,
          corridorId: 'veladero',
          geometryClass: 'RECONSTRUCTED_ACCESS',
          sourceFeatureIds: [],
          evidenceRefs: [routeEvidence.id],
          sourceDatasetId: sourceId,
          sourceRetrievedAt: '2026-08-30',
          limitations: ['Explicit derived fixture geometry.'],
        },
        geometry: base.geometry.geometry,
      }],
    },
    sources: {
      schemaVersion: 'sanjuan.road-geometry-sources/v2',
      corridorId: 'veladero',
      sources: [{
        id: sourceId,
        provider: 'San Juan Mining Ops Sim',
        datasetName: 'Explicit derived corridor connectors',
        sourceUrl: '/data/corridors/veladero/sources.v2.json',
        retrievedAt: '2026-08-30',
        role: 'FALLBACK',
        format: 'GeoJSON',
        featureIds: [],
        limitations: ['Fixture source only.'],
      }],
      evidence: [routeEvidence],
    },
  };
}

function makeFetcher(projectOverride = projects, requestedUrls: string[] = []) {
  const bundles = Object.fromEntries(['hualilan', 'veladero', 'los-azules'].map((id) => [id, corridorBundle(id)]));
  const veladeroV2 = veladeroV2Bundle();
  return async (url: string) => {
    requestedUrls.push(url);
    let body: unknown;
    if (url === '/data/projects/projects.v1.json') {
      body = { schemaVersion: 'sanjuan.projects/v1', projects: projectOverride, evidence: projectEvidence };
    } else {
      const v2Match = url.match(/\/data\/corridors\/veladero\/(metadata\.v2\.json|corridor\.v2\.geojson|profile\.v1\.json|route-samples\.v2\.json|segments\.v2\.geojson|sources\.v2\.json)$/);
      if (v2Match) {
        const file = v2Match[1];
        body = file === 'metadata.v2.json' ? veladeroV2.metadata
          : file === 'corridor.v2.geojson' ? veladeroV2.geometry
            : file === 'profile.v1.json' ? veladeroV2.profile
              : file === 'route-samples.v2.json' ? veladeroV2.routeSamples
                : file === 'segments.v2.geojson' ? veladeroV2.segments
                  : veladeroV2.sources;
      } else {
        const match = url.match(/\/data\/corridors\/([^/]+)\/(metadata\.v1\.json|corridor\.v1\.geojson|profile\.v1\.json|route-samples\.v1\.json)$/);
        if (!match) return { ok: false, json: async () => ({}) };
        const [, id, file] = match;
        const bundle = bundles[id];
        body = file === 'metadata.v1.json' ? bundle.metadata
          : file === 'corridor.v1.geojson' ? bundle.geometry
            : file === 'profile.v1.json' ? bundle.profile
              : bundle.routeSamples;
      }
    }
    return { ok: true, json: async () => body };
  };
}

const runFixture = {
  id: 'sanjuan-v0-run-20260830-v1',
  targetDate: '2026-08-30',
  issuedAt: '2026-08-30T08:28:42.682Z',
  dataAsOf: '2026-08-30T08:28:42.682Z',
  timezone: 'America/Argentina/San_Juan',
  mode: 'SIMULATED',
  modelVersion: 'movement-v0.1',
  scenarioVersion: 'sanjuan-operation-v0.1',
  seed: 'sanjuan-v0-20260830',
  environmentSnapshotId: 'environment-sj-20260830-v1',
  provenance: ['open-meteo-forecast-20260830'],
};

const environmentFixture = {
  schemaVersion: 'sanjuan.environment/v1',
  id: 'environment-sj-20260830-v1',
  issuedAt: '2026-08-30T08:28:42.682Z',
  dataAsOf: '2026-08-30T08:28:42.682Z',
  targetDate: '2026-08-30',
  timezone: 'America/Argentina/San_Juan',
  provider: 'Open-Meteo Forecast API · Best Match',
  modelKind: 'FORECAST',
  sourceState: 'READY',
  evidenceRefs: ['open-meteo-forecast-20260830'],
  limitations: ['Modelled weather only.'],
  nodes: [{
    id: 'hualilan-env-1', name: 'node', corridorId: 'hualilan', distanceKm: 0,
    lat: -31.5375, lon: -68.5364, elevationM: 650,
    hourly: [{
      time: '2026-08-30T06:00:00-03:00', temperatureC: 11.1, precipitationMm: 0,
      snowfallCm: 0, windSpeedKmh: 1.9, windGustKmh: 9.7, windDirectionDeg: 253,
    }],
  }],
};

const environmentEvidenceFixture = {
  schemaVersion: 'sanjuan.environment-evidence/v1',
  environmentSnapshotId: 'environment-sj-20260830-v1',
  evidence: [evidence('open-meteo-forecast-20260830')],
};

function makeRunFetcher(
  environmentOverride = environmentFixture,
  runOverride = runFixture,
  evidenceOverride = environmentEvidenceFixture,
) {
  return async (url: string) => {
    const body = url === '/data/runs/sanjuan-v0-run.v1.json' ? runOverride
      : url === '/data/environment/environment-sj-20260830.json' ? environmentOverride
        : url === '/data/environment/environment-sj-20260830.evidence.v1.json' ? evidenceOverride
          : null;
    return body ? { ok: true, json: async () => body } : { ok: false, json: async () => ({}) };
  };
}

const trafficEvidence = [
  { id: 'dnv', role: 'CALIBRATION', sourceName: 'DNV', retrievedAt: '2026-08-30', limitations: [] },
  { id: 'pncv', role: 'ANALOGUE', sourceName: 'PNCV', retrievedAt: '2026-08-30', limitations: [] },
  { id: 'shape', role: 'SYNTHETIC_ASSUMPTION', sourceName: 'Scenario', retrievedAt: '2026-08-30', limitations: [] },
];

const trafficFixture = {
  schemaVersion: 'sanjuan.traffic-calibration/v1',
  id: 'traffic-calibration-v1',
  baseVisibleVehicles: 20,
  maxVisibleVehicles: 24,
  timeBands: [
    { startMinute: 360, endMinute: 540, relativeIntensity: 0.65 },
    { startMinute: 540, endMinute: 720, relativeIntensity: 1 },
    { startMinute: 720, endMinute: 960, relativeIntensity: 0.8 },
    { startMinute: 960, endMinute: 1201, relativeIntensity: 0.55 },
  ],
  corridorWeights: [
    { corridorId: 'hualilan', weight: 0.34 },
    { corridorId: 'veladero', weight: 0.33 },
    { corridorId: 'los-azules', weight: 0.33 },
  ],
  evidenceRefs: ['dnv', 'pncv', 'shape'],
  limitations: ['Not live traffic.'],
  evidence: trafficEvidence,
};

function makeTrafficFetcher(override = trafficFixture) {
  return async (url: string) => url === '/data/calibration/traffic.v1.json'
    ? { ok: true, json: async () => override }
    : { ok: false, json: async () => ({}) };
}

describe('loadStaticOperationData', () => {
  it('loads exactly 10 projects and the three active corridor bundles', async () => {
    const data = await loadStaticOperationData(makeFetcher());
    expect(data.projects).toHaveLength(10);
    expect(data.corridors.map((c) => c.id).sort()).toEqual(['hualilan', 'los-azules', 'veladero']);
    expect(data.projects.filter((p) => p.activeOperationalDestination)).toHaveLength(3);
  });

  it('loads Veladero V2 by default while keeping Hualilan and Los Azules on V1', async () => {
    const requestedUrls: string[] = [];
    const data = await loadStaticOperationData(makeFetcher(projects, requestedUrls));

    expect(requestedUrls).toContain('/data/corridors/veladero/metadata.v2.json');
    expect(requestedUrls).toContain('/data/corridors/veladero/segments.v2.geojson');
    expect(requestedUrls).toContain('/data/corridors/veladero/sources.v2.json');
    expect(requestedUrls).toContain('/data/corridors/hualilan/metadata.v1.json');
    expect(requestedUrls).toContain('/data/corridors/los-azules/metadata.v1.json');
    expect(data.corridors.find((corridor) => corridor.id === 'veladero')?.geometrySegments).toHaveLength(1);
    expect(data.geometrySources.map((source) => source.id)).toEqual(['veladero-derived-geometry-v2']);
  });

  it('can explicitly load legacy Veladero V1 for regression comparison', async () => {
    const requestedUrls: string[] = [];
    const loadWithOverrides = loadStaticOperationData as unknown as (
      fetcher: ReturnType<typeof makeFetcher>,
      overrides: { veladero: 'v1' },
    ) => ReturnType<typeof loadStaticOperationData>;
    const data = await loadWithOverrides(makeFetcher(projects, requestedUrls), { veladero: 'v1' });

    expect(requestedUrls).toContain('/data/corridors/veladero/metadata.v1.json');
    expect(requestedUrls).not.toContain('/data/corridors/veladero/metadata.v2.json');
    expect(data.corridors.find((corridor) => corridor.id === 'veladero')?.geometrySegments).toBeUndefined();
  });

  it('fails closed when a project references missing evidence', async () => {
    const broken = projects.map((project, i) => i === 0 ? { ...project, evidenceRefs: ['missing'] } : project);
    await expect(loadStaticOperationData(makeFetcher(broken))).rejects.toThrow(/missing evidence refs/i);
  });
});

describe('loadStaticRunArtifacts', () => {
  it('loads the exact versioned run, environment snapshot, and environment evidence together', async () => {
    const artifacts = await loadStaticRunArtifacts(makeRunFetcher());
    expect(artifacts.run.seed).toBe('sanjuan-v0-20260830');
    expect(artifacts.environment.id).toBe(artifacts.run.environmentSnapshotId);
    expect(artifacts.environment.sourceState).toBe('READY');
    expect(artifacts.evidence.map((item) => item.id)).toEqual(['open-meteo-forecast-20260830']);
  });

  it('fails closed when the run references a different environment artifact', async () => {
    const brokenEnvironment = { ...environmentFixture, id: 'environment-other' };
    const matchingBrokenEvidence = { ...environmentEvidenceFixture, environmentSnapshotId: 'environment-other' };
    await expect(loadStaticRunArtifacts(makeRunFetcher(brokenEnvironment, runFixture, matchingBrokenEvidence)))
      .rejects.toThrow(/does not match run artifact/i);
  });
});

describe('loadTrafficCalibration', () => {
  it('loads the versioned synthetic background traffic calibration with evidence', async () => {
    const calibration = await loadTrafficCalibration(makeTrafficFetcher());
    expect(calibration.id).toBe('traffic-calibration-v1');
    expect(calibration.baseVisibleVehicles).toBe(20);
    expect(calibration.evidence).toHaveLength(3);
  });

  it('fails closed when traffic time bands contain a gap', async () => {
    const broken = {
      ...trafficFixture,
      timeBands: trafficFixture.timeBands.map((band, index) => index === 1 ? { ...band, startMinute: 550 } : band),
    };
    await expect(loadTrafficCalibration(makeTrafficFetcher(broken))).rejects.toThrow(/time bands/i);
  });

  it('fails closed when traffic calibration references missing evidence', async () => {
    const broken = { ...trafficFixture, evidenceRefs: [...trafficFixture.evidenceRefs, 'missing'] };
    await expect(loadTrafficCalibration(makeTrafficFetcher(broken))).rejects.toThrow(/missing evidence refs/i);
  });
});
