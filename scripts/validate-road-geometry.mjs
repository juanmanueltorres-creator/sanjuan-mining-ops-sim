import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChainage,
  haversineMeters,
  locateAnchor,
  validateAnchorOrder,
} from './lib/road-geometry.mjs';

const EPS = 1e-7;
const VALID_CLASSES = new Set(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS', 'APPROXIMATE_APPROACH']);
const ACTIVE_CORRIDORS = new Set(['hualilan', 'veladero', 'los-azules']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function featureId(feature) {
  return feature?.properties?.sourceFeatureId ?? feature?.id;
}

function buildSourceIndex(sourceDocs) {
  const result = new Map();
  for (const [sourceId, doc] of Object.entries(sourceDocs ?? {})) {
    assert(doc?.type === 'FeatureCollection' && Array.isArray(doc.features), `${sourceId}: frozen source must be a FeatureCollection`);
    const features = new Map();
    for (const feature of doc.features) {
      const id = featureId(feature);
      assert(typeof id === 'string' && id.length > 0, `${sourceId}: source feature id required`);
      assert(!features.has(id), `${sourceId}: duplicate frozen feature ${id}`);
      features.set(id, feature);
    }
    result.set(sourceId, features);
  }
  return result;
}

function maxChordKm(coordinates) {
  let maxKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    maxKm = Math.max(maxKm, haversineMeters(coordinates[index - 1], coordinates[index]) / 1000);
  }
  return maxKm;
}

function evidenceIndex(manifest, v1Metadata) {
  return new Map([
    ...(v1Metadata.evidence ?? []).map((record) => [record.id, record]),
    ...(manifest.evidence ?? []).map((record) => [record.id, record]),
  ]);
}

function assertEvidenceRefs(refs, known, label) {
  assert(Array.isArray(refs) && refs.length > 0, `${label}: evidenceRefs must be non-empty`);
  for (const ref of refs) assert(known.has(ref), `${label}: unresolved evidence ref ${ref}`);
}

function nearestSampleToAnchor(samples, anchor) {
  let best = null;
  for (const sample of samples) {
    const distanceM = haversineMeters([anchor.lon, anchor.lat], [sample.lon, sample.lat]);
    if (!best || distanceM < best.distanceM) best = { sample, distanceM };
  }
  return best;
}

export function validateRoadGeometry(bundle) {
  const { manifest, sourceDocs, v1Metadata, metadata, corridor, segments, routeSamples } = bundle;
  assert(typeof manifest?.corridorId === 'string' && manifest.corridorId.length > 0, 'manifest corridorId required');
  assert(ACTIVE_CORRIDORS.has(manifest.corridorId), `Unsupported corridor ${manifest.corridorId}`);
  assert(v1Metadata?.id === manifest.corridorId, 'V1 metadata id mismatch');
  assert(metadata?.id === manifest.corridorId, 'V2 metadata id mismatch');
  assert(metadata.schemaVersion === 'sanjuan.corridor-metadata/v2', 'V2 metadata schemaVersion mismatch');
  assert(deepEqual(metadata.segments, v1Metadata.segments), 'V2 operational segments differ from V1 operational segments');
  assert(deepEqual(metadata.nodes, v1Metadata.nodes), 'V2 runtime nodes differ from V1 runtime nodes');
  assert(metadata.totalDistanceKm === v1Metadata.totalDistanceKm, 'V2 totalDistanceKm differs from V1');

  assert(corridor?.type === 'Feature' && corridor.geometry?.type === 'LineString', 'V2 corridor must be a LineString Feature');
  assert(corridor.properties?.geometryClass === 'RECONSTRUCTED_ACCESS', 'V2 combined corridor must remain RECONSTRUCTED_ACCESS');
  assert(segments?.type === 'FeatureCollection' && Array.isArray(segments.features) && segments.features.length > 0, 'V2 geometry segments required');
  assert(routeSamples?.schemaVersion === 'sanjuan.route-samples/v2', 'V2 route-sample schemaVersion mismatch');
  assert(routeSamples.corridorId === manifest.corridorId, 'V2 route-sample corridor id mismatch');
  assert(Array.isArray(routeSamples.samples) && routeSamples.samples.length >= 2, 'V2 route samples require >=2 entries');

  const sources = new Map((manifest.sources ?? []).map((source) => [source.id, source]));
  const frozen = buildSourceIndex(sourceDocs);
  const evidence = evidenceIndex(manifest, v1Metadata);
  assertEvidenceRefs(metadata.evidenceRefs, evidence, 'V2 metadata');
  assertEvidenceRefs(corridor.properties?.evidenceRefs, evidence, 'V2 corridor');

  const segmentIds = new Set();
  let maxExplicitGapMeters = 0;
  let maxDerivedChordSeenKm = 0;
  const toleranceMeters = manifest.guards?.sourceConnectionToleranceM ?? 250;
  const maxDerivedChordKm = manifest.guards?.maxDerivedChordKm ?? 5;

  for (let index = 0; index < segments.features.length; index += 1) {
    const feature = segments.features[index];
    const properties = feature.properties ?? {};
    assert(feature.geometry?.type === 'LineString' && feature.geometry.coordinates.length >= 2, `segment ${feature.id ?? index}: LineString required`);
    assert(typeof properties.id === 'string' && properties.id.length > 0, `segment ${index}: id required`);
    assert(!segmentIds.has(properties.id), `duplicate V2 geometry segment ${properties.id}`);
    segmentIds.add(properties.id);
    assert(VALID_CLASSES.has(properties.geometryClass), `${properties.id}: invalid geometryClass ${properties.geometryClass}`);
    const source = sources.get(properties.sourceDatasetId);
    assert(source, `${properties.id}: unresolved source dataset ${properties.sourceDatasetId}`);
    assertEvidenceRefs(properties.evidenceRefs, evidence, properties.id);

    const sourceFeatureIds = properties.sourceFeatureIds ?? [];
    if (properties.geometryClass === 'PUBLIC_ROAD') {
      assert(sourceFeatureIds.length > 0, `${properties.id}: PUBLIC_ROAD requires source feature ids`);
    }
    if (sourceFeatureIds.length > 0) {
      const sourceFeatures = frozen.get(properties.sourceDatasetId);
      assert(sourceFeatures, `${properties.id}: frozen snapshot missing for ${properties.sourceDatasetId}`);
      for (const id of sourceFeatureIds) {
        assert(sourceFeatures.has(id), `${properties.id}: selected source feature ${id} is absent from frozen snapshot`);
      }
    } else {
      const chordKm = maxChordKm(feature.geometry.coordinates);
      maxDerivedChordSeenKm = Math.max(maxDerivedChordSeenKm, chordKm);
      assert(chordKm <= maxDerivedChordKm + EPS, `${properties.id}: derived chord ${chordKm.toFixed(3)} km exceeds ${maxDerivedChordKm} km`);
    }

    if (index > 0) {
      const previous = segments.features[index - 1];
      const gapMeters = haversineMeters(previous.geometry.coordinates.at(-1), feature.geometry.coordinates[0]);
      maxExplicitGapMeters = Math.max(maxExplicitGapMeters, gapMeters);
      assert(gapMeters <= toleranceMeters + 0.01, `geometry segment gap ${gapMeters.toFixed(1)} m exceeds ${toleranceMeters} m before ${properties.id}`);
      const undocumentedLimitM = (manifest.guards?.maxUndocumentedGapKm ?? 2) * 1000;
      assert(gapMeters <= undocumentedLimitM + 0.01, `undocumented geometry gap ${gapMeters.toFixed(1)} m exceeds ${undocumentedLimitM} m`);
    }
  }

  const chainage = buildChainage(corridor.geometry.coordinates);
  const measuredChainageKm = chainage.at(-1).chainageKm;
  const minChainageKm = manifest.guards?.chainageMinKm ?? 324;
  const maxChainageKm = manifest.guards?.chainageMaxKm ?? 396;
  assert(measuredChainageKm >= minChainageKm && measuredChainageKm <= maxChainageKm, `measured chainage ${measuredChainageKm.toFixed(3)} km outside ${minChainageKm}-${maxChainageKm} km`);

  const locatedAnchors = validateAnchorOrder((manifest.anchors ?? []).map((anchor) => locateAnchor(chainage, anchor)));
  const expectedAnchorOrder = (manifest.anchors ?? []).map((anchor) => anchor.id);
  assert(deepEqual(locatedAnchors.map((anchor) => anchor.id), expectedAnchorOrder), `anchor order must be ${expectedAnchorOrder.join(' → ')}`);

  const samples = routeSamples.samples;
  assert(Math.abs(samples[0].distanceKm) <= EPS, 'V2 operational samples must start at 0 km');
  assert(
    Math.abs(samples.at(-1).distanceKm - v1Metadata.totalDistanceKm) <= EPS,
    `V2 operational samples must end at ${v1Metadata.totalDistanceKm} km`,
  );
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    assert(Number.isFinite(sample.distanceKm) && Number.isFinite(sample.geometryChainageKm), `route sample ${index}: finite distances required`);
    assert(segmentIds.has(sample.geometrySegmentId), `route sample ${index}: unknown geometrySegmentId ${sample.geometrySegmentId}`);
    const physicalSegment = segments.features.find((feature) => feature.properties.id === sample.geometrySegmentId);
    assert(sample.geometryClass === physicalSegment.properties.geometryClass, `route sample ${index}: geometryClass does not match ${sample.geometrySegmentId}`);
    assert(v1Metadata.segments.some((segment) => segment.id === sample.segmentId), `route sample ${index}: unknown operational segmentId ${sample.segmentId}`);
    if (index > 0) {
      assert(sample.distanceKm > samples[index - 1].distanceKm, `route sample ${index}: operational distance must increase strictly`);
      assert(sample.geometryChainageKm > samples[index - 1].geometryChainageKm, `route sample ${index}: geometry chainage must increase strictly`);
    }
  }

  const operationalAnchors = {};
  for (const anchor of manifest.anchors ?? []) {
    if (!Number.isFinite(anchor.operationalKm)) continue;
    const nearest = nearestSampleToAnchor(samples, anchor);
    assert(nearest, `Unable to locate route sample for ${anchor.id}`);
    assert(
      Math.abs(nearest.sample.distanceKm - anchor.operationalKm) <= EPS,
      `${anchor.id} sample must equal operational km ${anchor.operationalKm}`,
    );
    operationalAnchors[anchor.id] = {
      operationalKm: nearest.sample.distanceKm,
      geometryChainageKm: nearest.sample.geometryChainageKm,
    };
  }

  if (Number.isFinite(manifest.selectionMetrics?.expectedMeasuredChainageKm)) {
    const deltaKm = Math.abs(measuredChainageKm - manifest.selectionMetrics.expectedMeasuredChainageKm);
    assert(deltaKm <= 0.02, `measured chainage differs from frozen-manifest expectation by ${deltaKm.toFixed(3)} km`);
  }

  const tudcum = operationalAnchors.tudcum;
  return {
    measuredChainageKm: Math.round(measuredChainageKm * 1e6) / 1e6,
    geometryVertexCount: corridor.geometry.coordinates.length,
    routeSampleCount: samples.length,
    geometrySegmentCount: segments.features.length,
    operationalStartKm: samples[0].distanceKm,
    operationalEndKm: samples.at(-1).distanceKm,
    operationalAnchors,
    ...(tudcum ? {
      tudcumOperationalKm: tudcum.operationalKm,
      tudcumGeometryChainageKm: tudcum.geometryChainageKm,
    } : {}),
    anchorDistancesKm: Object.fromEntries(locatedAnchors.map((anchor) => [anchor.id, Math.round(anchor.distanceToRouteKm * 1e6) / 1e6])),
    maxExplicitGapMeters: Math.round(maxExplicitGapMeters * 1000) / 1000,
    maxDerivedChordKm: Math.round(maxDerivedChordSeenKm * 1e6) / 1e6,
    geometryClassCounts: segments.features.reduce((counts, feature) => ({
      ...counts,
      [feature.properties.geometryClass]: (counts[feature.properties.geometryClass] ?? 0) + 1,
    }), {}),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function validateFromDisk(corridorId) {
  if (!ACTIVE_CORRIDORS.has(corridorId)) throw new Error(`Unsupported corridor ${corridorId}`);
  const base = path.join(process.cwd(), 'public', 'data', 'corridors', corridorId);
  const [manifest, v1Metadata, metadata, corridor, segments, routeSamples] = await Promise.all([
    readJson(path.join(base, 'sources.v2.json')),
    readJson(path.join(base, 'metadata.v1.json')),
    readJson(path.join(base, 'metadata.v2.json')),
    readJson(path.join(base, 'corridor.v2.geojson')),
    readJson(path.join(base, 'segments.v2.geojson')),
    readJson(path.join(base, 'route-samples.v2.json')),
  ]);
  const sourceDocs = {};
  for (const source of manifest.sources ?? []) {
    if (!source.snapshotPath) continue;
    sourceDocs[source.id] = await readJson(path.join(base, source.snapshotPath));
  }
  return validateRoadGeometry({ manifest, sourceDocs, v1Metadata, metadata, corridor, segments, routeSamples });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  const corridorId = process.argv[2] ?? 'veladero';
  const report = await validateFromDisk(corridorId);
  console.log(JSON.stringify(report, null, 2));
}
