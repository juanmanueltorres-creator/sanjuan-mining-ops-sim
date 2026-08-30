import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CORRIDORS = ['hualilan', 'veladero', 'los-azules'];
const GEOMETRY_CLASSES = new Set(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS', 'APPROXIMATE_APPROACH', 'PROJECT_LOCATION']);
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
  const [metadata, feature, profile, routeDoc] = await Promise.all([
    readJson(`${base}/metadata.v1.json`),
    readJson(`${base}/corridor.v1.geojson`),
    readJson(`${base}/profile.v1.json`),
    readJson(`${base}/route-samples.v1.json`),
  ]);

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
  const allEvidence = new Map([...projectEvidence, ...localEvidence]);
  evidenceCount += localEvidence.size;
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
  for (let i = 0; i < routeSamples.length; i += 1) {
    const sample = routeSamples[i];
    assert(Number.isFinite(sample.lon) && Number.isFinite(sample.lat) && Number.isFinite(sample.elevationM), `${corridorId}: invalid route sample ${i}`);
    assert(segmentIds.has(sample.segmentId), `${corridorId}: unknown segmentId ${sample.segmentId}`);
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

const [environment, run] = await Promise.all([
  readJson('public/data/environment/environment-sj-20260830.json'),
  readJson('public/data/runs/sanjuan-v0-run.v1.json'),
]);

assert(environment.schemaVersion === 'sanjuan.environment/v1', 'environment: unsupported schemaVersion');
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

console.log(`Validated 10 projects, ${CORRIDORS.length} corridors, ${environment.nodes.length} environment nodes, one immutable run, traffic calibration ${traffic.id}, ${evidenceCount} territorial evidence records.`);
