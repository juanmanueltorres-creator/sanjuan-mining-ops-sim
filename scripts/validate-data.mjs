import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CORRIDORS = ['hualilan', 'veladero', 'los-azules'];
const CORRIDOR_ASSET_VERSIONS = {
  hualilan: 'v1',
  veladero: 'v2',
  'los-azules': 'v1',
};
const GEOMETRY_CLASSES = new Set(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS', 'APPROXIMATE_APPROACH', 'PROJECT_LOCATION']);
const ROAD_GEOMETRY_CLASSES = new Set(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS', 'APPROXIMATE_APPROACH']);
const GEOMETRY_SOURCE_ROLES = new Set(['PRIMARY', 'CORROBORATION', 'FALLBACK']);
const GEOMETRY_SOURCE_FORMATS = new Set(['GeoJSON', 'Shapefile', 'WMS', 'OSM']);
const SOURCE_STATES = new Set(['READY', 'STALE', 'PARTIAL', 'UNAVAILABLE']);
const MODEL_KINDS = new Set(['FORECAST', 'HISTORICAL_REFERENCE']);
const TRAFFIC_EVIDENCE_ROLES = new Set(['CALIBRATION', 'ANALOGUE', 'SYNTHETIC_ASSUMPTION']);
const TIMEZONE = 'America/Argentina/San_Juan';
const EPS = 1e-6;

async function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${relativePath}: invalid or unreadable JSON (${error.message})`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRefs(ids, evidenceMap, label) {
  assert(Array.isArray(ids) && ids.length > 0, `${label}: evidenceRefs must be non-empty`);
  const missing = ids.filter((id) => !evidenceMap.has(id));
  assert(missing.length === 0, `${label}: missing evidence refs ${missing.join(', ')}`);
}

const projectDoc = await readJson('public/data/projects/projects.v1.json');
assert(Array.isArray(projectDoc.projects), 'projects: projects must be an array');
assert(projectDoc.projects.length === 10, `projects: expected 10, found ${projectDoc.projects.length}`);
const activeIds = projectDoc.projects.filter((project) => project.activeOperationalDestination).map((project) => project.id).sort();
assert(JSON.stringify(activeIds) === JSON.stringify(['hualilan', 'los-azules', 'veladero']), `projects: active destinations are ${activeIds.join(', ')}`);

const projectEvidence = new Map((projectDoc.evidence ?? []).map((ref) => [ref.id, ref]));
for (const project of projectDoc.projects) {
  assert(Number.isFinite(project.lat) && Number.isFinite(project.lon), `project ${project.id}: invalid coordinate`);
  assertRefs(project.evidenceRefs, projectEvidence, `project ${project.id}`);
}

let evidenceCount = projectEvidence.size;
const corridorTotals = new Map();

for (const corridorId of CORRIDORS) {
  const base = `public/data/corridors/${corridorId}`;
  const version = CORRIDOR_ASSET_VERSIONS[corridorId];
  assert(version === 'v1' || (corridorId === 'veladero' && version === 'v2'), `${corridorId}: unsupported asset version ${version}`);

  const [metadata, feature, profile, routeDoc] = await Promise.all([
    readJson(`${base}/metadata.${version}.json`),
    readJson(`${base}/corridor.${version}.geojson`),
    readJson(`${base}/profile.v1.json`),
    readJson(`${base}/route-samples.${version}.json`),
  ]);

  let geometrySegments = null;
  let geometrySources = null;
  let sourceEvidence = new Map();

  if (version === 'v2') {
    [geometrySegments, geometrySources] = await Promise.all([
      readJson(`${base}/segments.v2.geojson`),
      readJson(`${base}/sources.v2.json`),
    ]);
    assert(geometrySegments.type === 'FeatureCollection' && Array.isArray(geometrySegments.features), `${corridorId}: V2 segments must be a FeatureCollection`);
    assert(geometrySources.schemaVersion === 'sanjuan.road-geometry-sources/v2', `${corridorId}: unsupported geometry source schemaVersion`);
    assert(geometrySources.corridorId === corridorId, `${corridorId}: geometry source corridor mismatch`);
    assert(Array.isArray(geometrySources.sources) && geometrySources.sources.length > 0, `${corridorId}: V2 geometry sources required`);
    assert(Array.isArray(geometrySources.evidence) && geometrySources.evidence.length > 0, `${corridorId}: V2 geometry evidence required`);
    sourceEvidence = new Map(geometrySources.evidence.map((ref) => [ref.id, ref]));
  }

  assert(metadata.id === corridorId, `${corridorId}: metadata id mismatch`);
  assert(GEOMETRY_CLASSES.has(metadata.geometryClass), `${corridorId}: invalid corridor geometry class`);
  assert(feature.type === 'Feature', `${corridorId}: geometry must be a GeoJSON Feature`);
  assert(feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString', `${corridorId}: unsupported geometry type`);
  assert(GEOMETRY_CLASSES.has(feature.properties?.geometryClass), `${corridorId}: invalid GeoJSON geometry class`);

  const coordinateCount = feature.geometry.type === 'LineString'
    ? feature.geometry.coordinates.length
    : feature.geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
  assert(coordinateCount >= 2, `${corridorId}: geometry requires at least two coordinates`);

  const localEvidence = new Map((metadata.evidence ?? []).map((ref) => [ref.id, ref]));
  const allEvidence = new Map([...projectEvidence, ...localEvidence, ...sourceEvidence]);
  evidenceCount += localEvidence.size + sourceEvidence.size;
  assertRefs(metadata.evidenceRefs, allEvidence, `${corridorId} metadata`);
  assertRefs(feature.properties?.evidenceRefs, allEvidence, `${corridorId} geometry`);
  assertRefs(profile.evidenceRefs, allEvidence, `${corridorId} profile`);
  for (const node of metadata.nodes ?? []) assertRefs(node.evidenceRefs, allEvidence, `${corridorId} node ${node.id}`);

  assert(Array.isArray(metadata.segments) && metadata.segments.length > 0, `${corridorId}: segments required`);
  const segments = [...metadata.segments].sort((a, b) => a.startKm - b.startKm);
  assert(Math.abs(segments[0].startKm) <= EPS, `${corridorId}: first segment must start at 0`);
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    assert(GEOMETRY_CLASSES.has(segment.geometryConfidence), `${corridorId}/${segment.id}: invalid geometryConfidence`);
    assert(segment.endKm > segment.startKm, `${corridorId}/${segment.id}: invalid distance range`);
    assert(Math.abs((segment.endKm - segment.startKm) - segment.distanceKm) <= EPS, `${corridorId}/${segment.id}: distanceKm mismatch`);
    if (i > 0) {
      assert(Math.abs(segment.startKm - segments[i - 1].endKm) <= EPS, `${corridorId}: segment gap/overlap between ${segments[i - 1].id} and ${segment.id}`);
    }
  }
  assert(Math.abs(segments.at(-1).endKm - metadata.totalDistanceKm) <= EPS, `${corridorId}: segments do not end at totalDistanceKm`);
  corridorTotals.set(corridorId, metadata.totalDistanceKm);

  assert(Array.isArray(profile.samples) && profile.samples.length >= 2, `${corridorId}: elevation profile requires >=2 samples`);
  assert(Math.abs(profile.samples[0].distanceKm) <= EPS, `${corridorId}: elevation profile must start at 0`);
  assert(Math.abs(profile.samples.at(-1).distanceKm - metadata.totalDistanceKm) <= EPS, `${corridorId}: elevation profile must end at totalDistanceKm`);

  const routeSamples = routeDoc.samples;
  assert(Array.isArray(routeSamples) && routeSamples.length >= 2, `${corridorId}: route samples require >=2 entries`);
  assert(Math.abs(routeSamples[0].distanceKm) <= EPS, `${corridorId}: route samples must start at 0`);
  const segmentIds = new Set(segments.map((segment) => segment.id));

  let geometrySegmentIds = null;
  if (version === 'v2') {
    const sourceMap = new Map();
    for (const source of geometrySources.sources) {
      assert(typeof source.id === 'string' && source.id.length > 0, `${corridorId}: geometry source id required`);
      assert(!sourceMap.has(source.id), `${corridorId}: duplicate geometry source ${source.id}`);
      assert(typeof source.provider === 'string' && source.provider.length > 0, `${corridorId}/${source.id}: provider required`);
      assert(typeof source.datasetName === 'string' && source.datasetName.length > 0, `${corridorId}/${source.id}: datasetName required`);
      assert(typeof source.sourceUrl === 'string' && source.sourceUrl.length > 0, `${corridorId}/${source.id}: sourceUrl required`);
      assert(typeof source.retrievedAt === 'string' && source.retrievedAt.length > 0, `${corridorId}/${source.id}: retrievedAt required`);
      assert(GEOMETRY_SOURCE_ROLES.has(source.role), `${corridorId}/${source.id}: invalid geometry source role`);
      assert(GEOMETRY_SOURCE_FORMATS.has(source.format), `${corridorId}/${source.id}: invalid geometry source format`);
      assert(Array.isArray(source.featureIds), `${corridorId}/${source.id}: featureIds must be an array`);
      assert(Array.isArray(source.limitations), `${corridorId}/${source.id}: limitations must be an array`);
      sourceMap.set(source.id, source);
    }

    geometrySegmentIds = new Set();
    for (const rawFeature of geometrySegments.features) {
      const props = rawFeature?.properties;
      assert(rawFeature?.type === 'Feature', `${corridorId}: geometry segment must be a Feature`);
      assert(rawFeature?.geometry?.type === 'LineString' && rawFeature.geometry.coordinates.length >= 2, `${corridorId}: geometry segment must be a LineString`);
      assert(typeof props?.id === 'string' && props.id.length > 0, `${corridorId}: geometry segment id required`);
      assert(!geometrySegmentIds.has(props.id), `${corridorId}: duplicate geometry segment ${props.id}`);
      assert(props.corridorId === corridorId, `${corridorId}/${props.id}: corridorId mismatch`);
      assert(ROAD_GEOMETRY_CLASSES.has(props.geometryClass), `${corridorId}/${props.id}: invalid geometryClass`);
      assert(Array.isArray(props.sourceFeatureIds), `${corridorId}/${props.id}: sourceFeatureIds must be an array`);
      assertRefs(props.evidenceRefs, allEvidence, `${corridorId}/${props.id}`);
      const source = sourceMap.get(props.sourceDatasetId);
      assert(source, `${corridorId}/${props.id}: unknown source dataset ${props.sourceDatasetId}`);
      if (props.geometryClass === 'PUBLIC_ROAD') {
        assert(props.sourceFeatureIds.length > 0, `${corridorId}/${props.id}: PUBLIC_ROAD requires sourceFeatureIds`);
      }
      for (const featureId of props.sourceFeatureIds) {
        assert(source.featureIds.includes(featureId), `${corridorId}/${props.id}: source feature ${featureId} absent from ${source.id}`);
      }
      geometrySegmentIds.add(props.id);
    }
    assert(geometrySegmentIds.size > 0, `${corridorId}: V2 geometry segments required`);
  }

  for (let i = 0; i < routeSamples.length; i += 1) {
    const sample = routeSamples[i];
    assert(Number.isFinite(sample.lon) && Number.isFinite(sample.lat) && Number.isFinite(sample.elevationM), `${corridorId}: invalid route sample ${i}`);
    assert(segmentIds.has(sample.segmentId), `${corridorId}: unknown segmentId ${sample.segmentId}`);
    if (version === 'v2') {
      assert(Number.isFinite(sample.geometryChainageKm), `${corridorId}: V2 sample ${i} missing geometryChainageKm`);
      assert(typeof sample.geometrySegmentId === 'string' && geometrySegmentIds.has(sample.geometrySegmentId), `${corridorId}: V2 sample ${i} unknown geometrySegmentId`);
      assert(ROAD_GEOMETRY_CLASSES.has(sample.geometryClass), `${corridorId}: V2 sample ${i} invalid geometryClass`);
      if (i > 0) assert(sample.geometryChainageKm > routeSamples[i - 1].geometryChainageKm, `${corridorId}: V2 geometry chainage must increase`);
    }
    if (i > 0) assert(sample.distanceKm > routeSamples[i - 1].distanceKm, `${corridorId}: route sample distances must increase`);
  }
  assert(Math.abs(routeSamples.at(-1).distanceKm - metadata.totalDistanceKm) <= EPS, `${corridorId}: final route sample must equal totalDistanceKm`);
}

const traffic = await readJson('public/data/calibration/traffic.v1.json');
assert(traffic.schemaVersion === 'sanjuan.traffic-calibration/v1', 'traffic: unsupported schemaVersion');
assert(typeof traffic.id === 'string' && traffic.id.length > 0, 'traffic: id required');
assert(Number.isFinite(traffic.baseVisibleVehicles) && traffic.baseVisibleVehicles >= 0, 'traffic: baseVisibleVehicles must be non-negative');
assert(Number.isInteger(traffic.maxVisibleVehicles) && traffic.maxVisibleVehicles >= 0, 'traffic: maxVisibleVehicles must be a non-negative integer');
assert(traffic.maxVisibleVehicles <= 24, 'traffic: background pool must remain capped at 24 visible vehicles');

assert(Array.isArray(traffic.timeBands) && traffic.timeBands.length > 0, 'traffic: timeBands required');
const trafficBands = [...traffic.timeBands].sort((a, b) => a.startMinute - b.startMinute);
assert(trafficBands[0].startMinute === 360, 'traffic: first time band must start at 06:00');
assert(trafficBands.at(-1).endMinute === 1201, 'traffic: final time band must cover 20:00');
for (let i = 0; i < trafficBands.length; i += 1) {
  const band = trafficBands[i];
  assert(Number.isFinite(band.startMinute) && Number.isFinite(band.endMinute) && band.endMinute > band.startMinute, `traffic: invalid time band ${i}`);
  assert(Number.isFinite(band.relativeIntensity) && band.relativeIntensity >= 0, `traffic: invalid relativeIntensity in band ${i}`);
  if (i > 0) assert(band.startMinute === trafficBands[i - 1].endMinute, `traffic: time-band gap/overlap before ${band.startMinute}`);
}

assert(Array.isArray(traffic.corridorWeights) && traffic.corridorWeights.length === CORRIDORS.length, `traffic: expected ${CORRIDORS.length} corridor weights`);
const trafficCorridorIds = traffic.corridorWeights.map((entry) => entry.corridorId).sort();
assert(JSON.stringify(trafficCorridorIds) === JSON.stringify([...CORRIDORS].sort()), `traffic: corridor weights must cover ${CORRIDORS.join(', ')}`);
assert(new Set(trafficCorridorIds).size === trafficCorridorIds.length, 'traffic: duplicate corridor weights');
for (const entry of traffic.corridorWeights) {
  assert(Number.isFinite(entry.weight) && entry.weight > 0, `traffic/${entry.corridorId}: weight must be positive`);
}

assert(Array.isArray(traffic.evidence) && traffic.evidence.length > 0, 'traffic: evidence required');
const trafficEvidence = new Map(traffic.evidence.map((ref) => [ref.id, ref]));
assertRefs(traffic.evidenceRefs, trafficEvidence, 'traffic');
for (const requiredRole of TRAFFIC_EVIDENCE_ROLES) {
  assert(traffic.evidence.some((ref) => ref.role === requiredRole), `traffic: missing ${requiredRole} evidence`);
}
assert(Array.isArray(traffic.limitations) && traffic.limitations.length > 0, 'traffic: limitations required');
assert(traffic.limitations.some((item) => /not live san juan traffic/i.test(item)), 'traffic: limitations must explicitly state that traffic is not live San Juan traffic');

const [environment, environmentEvidenceDoc, run] = await Promise.all([
  readJson('public/data/environment/environment-sj-20260830.json'),
  readJson('public/data/environment/environment-sj-20260830.evidence.v1.json'),
  readJson('public/data/runs/sanjuan-v0-run.v1.json'),
]);

assert(environment.schemaVersion === 'sanjuan.environment/v1', 'environment: unsupported schemaVersion');
assert(environmentEvidenceDoc.schemaVersion === 'sanjuan.environment-evidence/v1', 'environment evidence: unsupported schemaVersion');
assert(environmentEvidenceDoc.environmentSnapshotId === environment.id, 'environment evidence: snapshot id mismatch');
assert(Array.isArray(environmentEvidenceDoc.evidence) && environmentEvidenceDoc.evidence.length > 0, 'environment evidence: records required');
const environmentEvidence = new Map(environmentEvidenceDoc.evidence.map((ref) => [ref.id, ref]));
assertRefs(environment.evidenceRefs, environmentEvidence, 'environment');
for (const ref of environmentEvidenceDoc.evidence) {
  assert(typeof ref.sourceName === 'string' && ref.sourceName.length > 0, `environment evidence ${ref.id}: sourceName required`);
  assert(typeof ref.retrievedAt === 'string' && ref.retrievedAt.length > 0, `environment evidence ${ref.id}: retrievedAt required`);
  assert(Array.isArray(ref.limitations), `environment evidence ${ref.id}: limitations required`);
}

assert(environment.id === run.environmentSnapshotId, `runtime: environment ${environment.id} does not match run ${run.environmentSnapshotId}`);
assert(environment.targetDate === run.targetDate, 'runtime: targetDate mismatch');
assert(environment.timezone === TIMEZONE && run.timezone === TIMEZONE, 'runtime: timezone mismatch');
assert(run.mode === 'SIMULATED', `run: unsupported mode ${run.mode}`);
assert(typeof run.seed === 'string' || typeof run.seed === 'number', 'run: deterministic seed required');
assert(String(run.seed).length > 0, 'run: deterministic seed cannot be empty');
assert(SOURCE_STATES.has(environment.sourceState), `environment: invalid sourceState ${environment.sourceState}`);
assert(environment.sourceState !== 'UNAVAILABLE', 'environment: checked-in V0 snapshot cannot be UNAVAILABLE');
assert(MODEL_KINDS.has(environment.modelKind), `environment: invalid modelKind ${environment.modelKind}`);
assert(typeof environment.provider === 'string' && environment.provider.length > 0, 'environment: provider required');
assert(Array.isArray(environment.evidenceRefs) && environment.evidenceRefs.length > 0, 'environment: evidenceRefs required');
assert(Array.isArray(run.provenance) && run.provenance.length > 0, 'run: provenance required');
for (const evidenceRef of environment.evidenceRefs) {
  assert(run.provenance.includes(evidenceRef), `run: missing environment provenance ${evidenceRef}`);
}

assert(Array.isArray(environment.nodes), 'environment: nodes must be an array');
assert(environment.nodes.length === CORRIDORS.length * 4, `environment: expected ${CORRIDORS.length * 4} route-tied nodes, found ${environment.nodes.length}`);

for (const corridorId of CORRIDORS) {
  const nodes = environment.nodes
    .filter((node) => node.corridorId === corridorId)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const totalDistanceKm = corridorTotals.get(corridorId);
  assert(nodes.length === 4, `environment/${corridorId}: expected 4 nodes, found ${nodes.length}`);
  assert(Math.abs(nodes[0].distanceKm) <= EPS, `environment/${corridorId}: first node must be at 0 km`);
  assert(Math.abs(nodes.at(-1).distanceKm - totalDistanceKm) <= 0.01, `environment/${corridorId}: last node must reach corridor end`);

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    assert(Number.isFinite(node.lat) && Number.isFinite(node.lon) && Number.isFinite(node.elevationM), `environment/${node.id}: invalid location/elevation`);
    assert(node.distanceKm >= -EPS && node.distanceKm <= totalDistanceKm + EPS, `environment/${node.id}: distance outside corridor`);
    if (i > 0) assert(node.distanceKm > nodes[i - 1].distanceKm, `environment/${corridorId}: node distances must increase`);
    assert(Array.isArray(node.hourly) && node.hourly.length >= 24, `environment/${node.id}: hourly series incomplete`);
    for (const hour of node.hourly) {
      assert(typeof hour.time === 'string' && hour.time.startsWith(environment.targetDate), `environment/${node.id}: hourly timestamp outside target date`);
      for (const field of ['temperatureC', 'precipitationMm', 'snowfallCm', 'windSpeedKmh', 'windGustKmh', 'windDirectionDeg']) {
        assert(hour[field] === null || Number.isFinite(hour[field]), `environment/${node.id}: invalid ${field}`);
      }
    }
  }
}

console.log(`Validated 10 projects, ${CORRIDORS.length} corridors, ${environment.nodes.length} environment nodes, ${environmentEvidence.size} environment evidence record(s), one immutable run, traffic calibration ${traffic.id}, ${evidenceCount} territorial evidence records.`);
console.log(`Corridor assets: hualilan=${CORRIDOR_ASSET_VERSIONS.hualilan}, veladero=${CORRIDOR_ASSET_VERSIONS.veladero}, los-azules=${CORRIDOR_ASSET_VERSIONS['los-azules']}.`);
