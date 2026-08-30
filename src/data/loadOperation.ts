import type {
  CorridorDefinition,
  EnvironmentSnapshot,
  EvidenceRef,
  OperationalRun,
  ProjectDefinition,
  SanJuanOperationSpec,
} from '../domain/contracts';
import { assertEvidenceRefsExist } from '../domain/evidence';
import {
  parseCorridor,
  parseEnvironmentSnapshot,
  parseOperationSpec,
  parseOperationalRun,
} from '../domain/schemas';

export interface StaticOperationData {
  projects: ProjectDefinition[];
  corridors: CorridorDefinition[];
  evidence: EvidenceRef[];
}

export interface StaticRunArtifacts {
  run: OperationalRun;
  environment: EnvironmentSnapshot;
}

export type JsonFetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const CORRIDOR_IDS = ['hualilan', 'veladero', 'los-azules'] as const;

function asRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function asArray(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`);
  return input;
}

async function fetchJson(fetcher: JsonFetcher, url: string): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function parseRegistry(projects: unknown[], evidence: unknown[]): Pick<SanJuanOperationSpec, 'territory' | 'provenance'> {
  const parsed = parseOperationSpec({
    schemaVersion: 'asset-loader/v1',
    scenarioId: 'asset-loader',
    timezone: 'America/Argentina/San_Juan',
    seed: 0,
    territory: { projects },
    corridors: [],
    fleet: [],
    schedule: {
      startMinute: 360,
      endMinute: 1200,
      defaultPlayback: 300,
      playbackOptions: [60, 120, 300, 600],
    },
    calibration: { evidenceRefs: [] },
    provenance: evidence,
  });
  return { territory: parsed.territory, provenance: parsed.provenance };
}

function parseEvidenceList(input: unknown): EvidenceRef[] {
  return parseRegistry([], asArray(input, 'evidence')).provenance;
}

export async function loadStaticRunArtifacts(fetcher: JsonFetcher): Promise<StaticRunArtifacts> {
  const [runRaw, environmentRaw] = await Promise.all([
    fetchJson(fetcher, '/data/runs/sanjuan-v0-run.v1.json'),
    fetchJson(fetcher, '/data/environment/environment-sj-20260830.json'),
  ]);

  const run = parseOperationalRun(runRaw);
  const environment = parseEnvironmentSnapshot(environmentRaw);

  if (environment.id !== run.environmentSnapshotId) {
    throw new Error(`Environment snapshot ${environment.id} does not match run artifact ${run.environmentSnapshotId}`);
  }
  if (environment.targetDate !== run.targetDate) {
    throw new Error(`Environment target date ${environment.targetDate} does not match run ${run.targetDate}`);
  }
  if (environment.timezone !== run.timezone) {
    throw new Error(`Environment timezone ${environment.timezone} does not match run ${run.timezone}`);
  }

  return { run, environment };
}

export async function loadStaticOperationData(fetcher: JsonFetcher): Promise<StaticOperationData> {
  const projectDocument = asRecord(await fetchJson(fetcher, '/data/projects/projects.v1.json'), 'project registry');
  const projectRegistry = parseRegistry(
    asArray(projectDocument.projects, 'projects'),
    asArray(projectDocument.evidence, 'project evidence'),
  );
  const projects = projectRegistry.territory.projects;

  if (projects.length !== 10) throw new Error(`Expected 10 projects, found ${projects.length}`);
  if (projects.filter((project) => project.activeOperationalDestination).length !== 3) {
    throw new Error('Expected exactly 3 active operational destinations');
  }

  for (const project of projects) {
    assertEvidenceRefsExist(project.evidenceRefs, projectRegistry.provenance);
  }

  const corridors: CorridorDefinition[] = [];
  const evidence: EvidenceRef[] = [...projectRegistry.provenance];

  for (const id of CORRIDOR_IDS) {
    const base = `/data/corridors/${id}`;
    const [metadataRaw, geometryRaw, profileRaw, routeSamplesRaw] = await Promise.all([
      fetchJson(fetcher, `${base}/metadata.v1.json`),
      fetchJson(fetcher, `${base}/corridor.v1.geojson`),
      fetchJson(fetcher, `${base}/profile.v1.json`),
      fetchJson(fetcher, `${base}/route-samples.v1.json`),
    ]);

    const metadata = asRecord(metadataRaw, `${id} metadata`);
    const feature = asRecord(geometryRaw, `${id} geometry feature`);
    const profile = asRecord(profileRaw, `${id} profile`);
    const routeDocument = asRecord(routeSamplesRaw, `${id} route samples`);
    const corridorEvidence = parseEvidenceList(metadata.evidence);
    const availableEvidence = [...evidence, ...corridorEvidence];

    const corridor = parseCorridor({
      ...metadata,
      geometry: feature.geometry,
      elevationProfile: profile,
      routeSamples: asArray(routeDocument.samples, `${id} route samples`),
    });

    assertEvidenceRefsExist(corridor.evidenceRefs, availableEvidence);
    for (const node of corridor.nodes) assertEvidenceRefsExist(node.evidenceRefs, availableEvidence);

    const profileEvidenceRefs = Array.isArray(profile.evidenceRefs) ? profile.evidenceRefs as string[] : [];
    if (profileEvidenceRefs.length > 0) assertEvidenceRefsExist(profileEvidenceRefs, availableEvidence);

    const properties = asRecord(feature.properties, `${id} geometry properties`);
    const geometryEvidenceRefs = Array.isArray(properties.evidenceRefs) ? properties.evidenceRefs as string[] : [];
    if (geometryEvidenceRefs.length > 0) assertEvidenceRefsExist(geometryEvidenceRefs, availableEvidence);

    corridors.push(corridor);
    evidence.push(...corridorEvidence);
  }

  return { projects, corridors, evidence };
}
