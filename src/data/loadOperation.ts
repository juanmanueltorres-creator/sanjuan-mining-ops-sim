import type {
  CorridorDefinition,
  EnvironmentSnapshot,
  EvidenceRef,
  GeometrySourceFormat,
  GeometrySourceRecord,
  GeometrySourceRole,
  OperationalRun,
  ProjectDefinition,
  RoadGeometrySegment,
  SanJuanOperationSpec,
} from '../domain/contracts';
import { assertEvidenceRefsExist } from '../domain/evidence';
import {
  parseCorridor,
  parseEnvironmentSnapshot,
  parseOperationSpec,
  parseOperationalRun,
} from '../domain/schemas';
import type { TrafficCalibration } from '../simulation/backgroundTraffic';

export interface StaticOperationData {
  projects: ProjectDefinition[];
  corridors: CorridorDefinition[];
  evidence: EvidenceRef[];
  geometrySources: GeometrySourceRecord[];
}

export interface StaticRunArtifacts {
  run: OperationalRun;
  environment: EnvironmentSnapshot;
  evidence: EvidenceRef[];
}

export interface StaticTrafficCalibration extends TrafficCalibration {
  id: string;
  evidenceRefs: string[];
  limitations: string[];
  evidence: EvidenceRef[];
}

export type JsonFetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const CORRIDOR_IDS = ['hualilan', 'veladero', 'los-azules'] as const;
export type CorridorId = typeof CORRIDOR_IDS[number];
export type CorridorAssetVersion = 'v1' | 'v2';
export type CorridorAssetOverrides = Partial<Record<CorridorId, CorridorAssetVersion>>;

export const DEFAULT_CORRIDOR_ASSET_VERSIONS: Record<CorridorId, CorridorAssetVersion> = {
  hualilan: 'v2',
  veladero: 'v2',
  'los-azules': 'v2',
};

const GEOMETRY_SOURCE_ROLES = new Set<GeometrySourceRole>(['PRIMARY', 'CORROBORATION', 'FALLBACK']);
const GEOMETRY_SOURCE_FORMATS = new Set<GeometrySourceFormat>(['GeoJSON', 'Shapefile', 'WMS', 'OSM']);

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

function asString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new Error(`${label} must be a non-empty string`);
  return input;
}

function asStringArray(input: unknown, label: string): string[] {
  return asArray(input, label).map((value, index) => asString(value, `${label} ${index}`));
}

function asFiniteNumber(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error(`${label} must be a finite number`);
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

function parseGeometrySourceDocument(input: unknown, corridorId: CorridorId): {
  sources: GeometrySourceRecord[];
  evidence: EvidenceRef[];
} {
  const document = asRecord(input, `${corridorId} geometry source manifest`);
  if (document.schemaVersion !== 'sanjuan.road-geometry-sources/v2') {
    throw new Error(`${corridorId} geometry source manifest: unsupported schemaVersion`);
  }
  if (document.corridorId !== corridorId) {
    throw new Error(`${corridorId} geometry source manifest: corridorId mismatch`);
  }

  const sources = asArray(document.sources, `${corridorId} geometry sources`).map((raw, index): GeometrySourceRecord => {
    const source = asRecord(raw, `${corridorId} geometry source ${index}`);
    const role = asString(source.role, `${corridorId} geometry source ${index} role`) as GeometrySourceRole;
    const format = asString(source.format, `${corridorId} geometry source ${index} format`) as GeometrySourceFormat;
    if (!GEOMETRY_SOURCE_ROLES.has(role)) throw new Error(`${corridorId} geometry source ${index}: invalid role ${role}`);
    if (!GEOMETRY_SOURCE_FORMATS.has(format)) throw new Error(`${corridorId} geometry source ${index}: invalid format ${format}`);

    return {
      id: asString(source.id, `${corridorId} geometry source ${index} id`),
      provider: asString(source.provider, `${corridorId} geometry source ${index} provider`),
      datasetName: asString(source.datasetName, `${corridorId} geometry source ${index} datasetName`),
      sourceUrl: asString(source.sourceUrl, `${corridorId} geometry source ${index} sourceUrl`),
      retrievedAt: asString(source.retrievedAt, `${corridorId} geometry source ${index} retrievedAt`),
      role,
      format,
      ...(typeof source.license === 'string' && source.license.length > 0 ? { license: source.license } : {}),
      ...(typeof source.attribution === 'string' && source.attribution.length > 0 ? { attribution: source.attribution } : {}),
      featureIds: asStringArray(source.featureIds, `${corridorId} geometry source ${index} featureIds`),
      limitations: asStringArray(source.limitations, `${corridorId} geometry source ${index} limitations`),
    };
  });

  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error(`${corridorId} geometry source manifest: duplicate source ids`);

  return {
    sources,
    evidence: parseEvidenceList(document.evidence),
  };
}

function parseGeometrySegments(input: unknown, corridorId: CorridorId): RoadGeometrySegment[] {
  const collection = asRecord(input, `${corridorId} V2 geometry segments`);
  if (collection.type !== 'FeatureCollection') throw new Error(`${corridorId} V2 geometry segments must be a FeatureCollection`);

  return asArray(collection.features, `${corridorId} V2 geometry segment features`).map((raw, index) => {
    const feature = asRecord(raw, `${corridorId} V2 geometry segment ${index}`);
    const properties = asRecord(feature.properties, `${corridorId} V2 geometry segment ${index} properties`);
    const geometry = asRecord(feature.geometry, `${corridorId} V2 geometry segment ${index} geometry`);
    return {
      ...properties,
      geometry,
    } as unknown as RoadGeometrySegment;
  });
}

function validateV2GeometryRelations(
  corridor: CorridorDefinition,
  sources: GeometrySourceRecord[],
  availableEvidence: EvidenceRef[],
): void {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const segments = corridor.geometrySegments ?? [];
  if (segments.length === 0) throw new Error(`${corridor.id}: V2 corridor requires geometrySegments`);

  for (const segment of segments) {
    const source = sourceMap.get(segment.sourceDatasetId);
    if (!source) throw new Error(`${corridor.id}/${segment.id}: unknown geometry source ${segment.sourceDatasetId}`);
    assertEvidenceRefsExist(segment.evidenceRefs, availableEvidence);
    for (const featureId of segment.sourceFeatureIds) {
      if (!source.featureIds.includes(featureId)) {
        throw new Error(`${corridor.id}/${segment.id}: source feature ${featureId} is absent from ${source.id}`);
      }
    }
  }
}

export async function loadStaticRunArtifacts(fetcher: JsonFetcher): Promise<StaticRunArtifacts> {
  const [runRaw, environmentRaw, environmentEvidenceRaw] = await Promise.all([
    fetchJson(fetcher, '/data/runs/sanjuan-v0-run.v1.json'),
    fetchJson(fetcher, '/data/environment/environment-sj-20260830.json'),
    fetchJson(fetcher, '/data/environment/environment-sj-20260830.evidence.v1.json'),
  ]);

  const run = parseOperationalRun(runRaw);
  const environment = parseEnvironmentSnapshot(environmentRaw);
  const evidenceDocument = asRecord(environmentEvidenceRaw, 'environment evidence registry');

  if (evidenceDocument.schemaVersion !== 'sanjuan.environment-evidence/v1') {
    throw new Error('environment evidence registry: unsupported schemaVersion');
  }
  if (evidenceDocument.environmentSnapshotId !== environment.id) {
    throw new Error('environment evidence registry does not match environment snapshot');
  }

  const evidence = parseEvidenceList(evidenceDocument.evidence);
  assertEvidenceRefsExist(environment.evidenceRefs, evidence);

  if (environment.id !== run.environmentSnapshotId) {
    throw new Error(`Environment snapshot ${environment.id} does not match run artifact ${run.environmentSnapshotId}`);
  }
  if (environment.targetDate !== run.targetDate) {
    throw new Error(`Environment target date ${environment.targetDate} does not match run ${run.targetDate}`);
  }
  if (environment.timezone !== run.timezone) {
    throw new Error(`Environment timezone ${environment.timezone} does not match run ${run.timezone}`);
  }

  const missingRunEnvironmentRefs = environment.evidenceRefs.filter((id) => !run.provenance.includes(id));
  if (missingRunEnvironmentRefs.length > 0) {
    throw new Error(`Run provenance missing environment refs: ${missingRunEnvironmentRefs.join(', ')}`);
  }

  return { run, environment, evidence };
}

export async function loadTrafficCalibration(fetcher: JsonFetcher): Promise<StaticTrafficCalibration> {
  const document = asRecord(await fetchJson(fetcher, '/data/calibration/traffic.v1.json'), 'traffic calibration');
  if (document.schemaVersion !== 'sanjuan.traffic-calibration/v1') {
    throw new Error('traffic calibration: unsupported schemaVersion');
  }
  if (typeof document.id !== 'string' || document.id.length === 0) throw new Error('traffic calibration: id required');

  const baseVisibleVehicles = asFiniteNumber(document.baseVisibleVehicles, 'traffic calibration baseVisibleVehicles');
  const maxVisibleVehicles = asFiniteNumber(document.maxVisibleVehicles, 'traffic calibration maxVisibleVehicles');
  if (baseVisibleVehicles < 0 || maxVisibleVehicles < 0) throw new Error('traffic calibration vehicle counts must be non-negative');

  const timeBands = asArray(document.timeBands, 'traffic calibration time bands').map((raw, index) => {
    const band = asRecord(raw, `traffic calibration time band ${index}`);
    const startMinute = asFiniteNumber(band.startMinute, `traffic calibration time band ${index} startMinute`);
    const endMinute = asFiniteNumber(band.endMinute, `traffic calibration time band ${index} endMinute`);
    const relativeIntensity = asFiniteNumber(band.relativeIntensity, `traffic calibration time band ${index} relativeIntensity`);
    if (endMinute <= startMinute || relativeIntensity < 0) throw new Error(`traffic calibration time bands invalid at ${index}`);
    return { startMinute, endMinute, relativeIntensity };
  }).sort((a, b) => a.startMinute - b.startMinute);

  if (timeBands.length === 0 || timeBands[0].startMinute !== 360 || timeBands.at(-1)?.endMinute !== 1201) {
    throw new Error('traffic calibration time bands must cover 06:00–20:00');
  }
  for (let index = 1; index < timeBands.length; index += 1) {
    if (timeBands[index].startMinute !== timeBands[index - 1].endMinute) {
      throw new Error('traffic calibration time bands must be contiguous without gaps or overlaps');
    }
  }

  const corridorWeights = asArray(document.corridorWeights, 'traffic calibration corridor weights').map((raw, index) => {
    const weight = asRecord(raw, `traffic calibration corridor weight ${index}`);
    if (!CORRIDOR_IDS.includes(weight.corridorId as CorridorId)) {
      throw new Error(`traffic calibration corridor weight ${index}: unsupported corridor`);
    }
    const value = asFiniteNumber(weight.weight, `traffic calibration corridor weight ${index} weight`);
    if (value <= 0) throw new Error(`traffic calibration corridor weight ${index}: weight must be positive`);
    return { corridorId: weight.corridorId as CorridorId, weight: value };
  });
  const weightedIds = [...new Set(corridorWeights.map((entry) => entry.corridorId))].sort();
  if (JSON.stringify(weightedIds) !== JSON.stringify([...CORRIDOR_IDS].sort())) {
    throw new Error('traffic calibration corridor weights must cover exactly the three active corridors');
  }

  const evidence = parseEvidenceList(document.evidence);
  const evidenceRefs = asStringArray(document.evidenceRefs, 'traffic calibration evidenceRefs');
  assertEvidenceRefsExist(evidenceRefs, evidence);

  const limitations = asStringArray(document.limitations, 'traffic calibration limitations');
  if (limitations.length === 0) throw new Error('traffic calibration limitations required');

  return {
    id: document.id,
    baseVisibleVehicles,
    maxVisibleVehicles,
    timeBands,
    corridorWeights,
    evidenceRefs,
    limitations,
    evidence,
  };
}

export async function loadStaticOperationData(
  fetcher: JsonFetcher,
  overrides: CorridorAssetOverrides = {},
): Promise<StaticOperationData> {
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

  const versions = { ...DEFAULT_CORRIDOR_ASSET_VERSIONS, ...overrides };

  const corridors: CorridorDefinition[] = [];
  const evidence: EvidenceRef[] = [...projectRegistry.provenance];
  const geometrySources: GeometrySourceRecord[] = [];

  for (const id of CORRIDOR_IDS) {
    const base = `/data/corridors/${id}`;
    const version = versions[id];

    if (version === 'v1') {
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
      continue;
    }

    const [metadataRaw, geometryRaw, profileRaw, routeSamplesRaw, segmentsRaw, sourcesRaw] = await Promise.all([
      fetchJson(fetcher, `${base}/metadata.v2.json`),
      fetchJson(fetcher, `${base}/corridor.v2.geojson`),
      fetchJson(fetcher, `${base}/profile.v1.json`),
      fetchJson(fetcher, `${base}/route-samples.v2.json`),
      fetchJson(fetcher, `${base}/segments.v2.geojson`),
      fetchJson(fetcher, `${base}/sources.v2.json`),
    ]);

    const metadata = asRecord(metadataRaw, `${id} V2 metadata`);
    const feature = asRecord(geometryRaw, `${id} V2 geometry feature`);
    const profile = asRecord(profileRaw, `${id} profile`);
    const routeDocument = asRecord(routeSamplesRaw, `${id} V2 route samples`);
    const sourceManifest = parseGeometrySourceDocument(sourcesRaw, id);
    const corridorEvidence = parseEvidenceList(metadata.evidence);
    const availableEvidence = [...evidence, ...corridorEvidence, ...sourceManifest.evidence];
    const geometrySegments = parseGeometrySegments(segmentsRaw, id);

    const corridor = parseCorridor({
      ...metadata,
      geometry: feature.geometry,
      geometrySegments,
      elevationProfile: profile,
      routeSamples: asArray(routeDocument.samples, `${id} V2 route samples`),
    });

    assertEvidenceRefsExist(corridor.evidenceRefs, availableEvidence);
    for (const node of corridor.nodes) assertEvidenceRefsExist(node.evidenceRefs, availableEvidence);
    const profileEvidenceRefs = Array.isArray(profile.evidenceRefs) ? profile.evidenceRefs as string[] : [];
    if (profileEvidenceRefs.length > 0) assertEvidenceRefsExist(profileEvidenceRefs, availableEvidence);
    const properties = asRecord(feature.properties, `${id} V2 geometry properties`);
    const geometryEvidenceRefs = Array.isArray(properties.evidenceRefs) ? properties.evidenceRefs as string[] : [];
    if (geometryEvidenceRefs.length > 0) assertEvidenceRefsExist(geometryEvidenceRefs, availableEvidence);

    validateV2GeometryRelations(corridor, sourceManifest.sources, availableEvidence);

    corridors.push(corridor);
    evidence.push(...corridorEvidence, ...sourceManifest.evidence);
    geometrySources.push(...sourceManifest.sources);
  }

  return { projects, corridors, evidence, geometrySources };
}
