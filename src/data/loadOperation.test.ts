import { describe, expect, it } from 'vitest';
import { loadStaticOperationData, loadStaticRunArtifacts } from './loadOperation';

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

function makeFetcher(projectOverride = projects) {
  const bundles = Object.fromEntries(['hualilan', 'veladero', 'los-azules'].map((id) => [id, corridorBundle(id)]));
  return async (url: string) => {
    let body: unknown;
    if (url === '/data/projects/projects.v1.json') {
      body = { schemaVersion: 'sanjuan.projects/v1', projects: projectOverride, evidence: projectEvidence };
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

function makeRunFetcher(environmentOverride = environmentFixture, runOverride = runFixture) {
  return async (url: string) => {
    const body = url === '/data/runs/sanjuan-v0-run.v1.json' ? runOverride
      : url === '/data/environment/environment-sj-20260830.json' ? environmentOverride
        : null;
    return body ? { ok: true, json: async () => body } : { ok: false, json: async () => ({}) };
  };
}

describe('loadStaticOperationData', () => {
  it('loads exactly 10 projects and the three active corridor bundles', async () => {
    const data = await loadStaticOperationData(makeFetcher());
    expect(data.projects).toHaveLength(10);
    expect(data.corridors.map((c) => c.id).sort()).toEqual(['hualilan', 'los-azules', 'veladero']);
    expect(data.projects.filter((p) => p.activeOperationalDestination)).toHaveLength(3);
  });

  it('fails closed when a project references missing evidence', async () => {
    const broken = projects.map((project, i) => i === 0 ? { ...project, evidenceRefs: ['missing'] } : project);
    await expect(loadStaticOperationData(makeFetcher(broken))).rejects.toThrow(/missing evidence refs/i);
  });
});

describe('loadStaticRunArtifacts', () => {
  it('loads the exact versioned run and environment snapshot together', async () => {
    const artifacts = await loadStaticRunArtifacts(makeRunFetcher());
    expect(artifacts.run.seed).toBe('sanjuan-v0-20260830');
    expect(artifacts.environment.id).toBe(artifacts.run.environmentSnapshotId);
    expect(artifacts.environment.sourceState).toBe('READY');
  });

  it('fails closed when the run references a different environment artifact', async () => {
    const brokenEnvironment = { ...environmentFixture, id: 'environment-other' };
    await expect(loadStaticRunArtifacts(makeRunFetcher(brokenEnvironment))).rejects.toThrow(/does not match run artifact/i);
  });
});
