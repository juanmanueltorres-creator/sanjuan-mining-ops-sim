import { describe, expect, it } from 'vitest';
import { loadStaticOperationData } from './loadOperation';

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
