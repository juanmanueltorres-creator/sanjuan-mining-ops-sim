import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChainage,
  calibrateOperationalKm,
  haversineMeters,
  interpolateElevation,
  locateAnchor,
  resamplePolyline,
  validateAnchorOrder,
  validateSegmentContinuity,
} from './lib/road-geometry.mjs';

const EPS = 1e-8;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function round(value, digits = 9) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function featureId(feature) {
  return feature?.properties?.sourceFeatureId ?? feature?.id;
}

function indexFeatureCollection(doc, sourceId) {
  assert(doc?.type === 'FeatureCollection' && Array.isArray(doc.features), `${sourceId}: source snapshot must be a FeatureCollection`);
  const index = new Map();
  for (const feature of doc.features) {
    const id = featureId(feature);
    assert(typeof id === 'string' && id.length > 0, `${sourceId}: source feature id required`);
    assert(!index.has(id), `${sourceId}: duplicate source feature id ${id}`);
    assert(feature.geometry?.type === 'LineString' && feature.geometry.coordinates.length >= 2, `${sourceId}/${id}: LineString geometry required`);
    index.set(id, feature);
  }
  return index;
}

function orientCoordinates(coordinates, previousEnd) {
  const forward = coordinates.map((coordinate) => [...coordinate]);
  if (!previousEnd) return forward;
  const firstGap = haversineMeters(previousEnd, forward[0]);
  const lastGap = haversineMeters(previousEnd, forward.at(-1));
  return lastGap < firstGap ? forward.reverse() : forward;
}

function appendCoordinates(target, coordinates, toleranceMeters) {
  if (target.length === 0) {
    target.push(...coordinates.map((coordinate) => [...coordinate]));
    return 0;
  }
  validateSegmentContinuity([target.at(-2) ?? target.at(-1), target.at(-1)], coordinates, toleranceMeters);
  const gapMeters = haversineMeters(target.at(-1), coordinates[0]);
  const startIndex = gapMeters <= 0.05 ? 1 : 0;
  target.push(...coordinates.slice(startIndex).map((coordinate) => [...coordinate]));
  return gapMeters;
}

function maxChordKm(coordinates) {
  let maxKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    maxKm = Math.max(maxKm, haversineMeters(coordinates[index - 1], coordinates[index]) / 1000);
  }
  return maxKm;
}

function chainageForOperationalKm(operationalKm, anchors) {
  assert(Number.isFinite(operationalKm), 'Operational distance must be finite');
  assert(Array.isArray(anchors) && anchors.length >= 2, 'Calibration anchors are required');
  if (operationalKm <= anchors[0].operationalKm) return anchors[0].geometryChainageKm;
  if (operationalKm >= anchors.at(-1).operationalKm) return anchors.at(-1).geometryChainageKm;
  let high = 1;
  while (anchors[high].operationalKm < operationalKm) high += 1;
  const a = anchors[high - 1];
  const b = anchors[high];
  const t = (operationalKm - a.operationalKm) / (b.operationalKm - a.operationalKm);
  return a.geometryChainageKm + (b.geometryChainageKm - a.geometryChainageKm) * t;
}

function snapOperationalKm(value, boundaries) {
  for (const boundary of boundaries) {
    if (Math.abs(value - boundary) <= 1e-7) return boundary;
  }
  return value;
}

function legacyRouteSampleSegmentAt(segments, operationalKm) {
  assert(Array.isArray(segments) && segments.length > 0, 'Operational segments are required');
  const sorted = [...segments].sort((a, b) => a.startKm - b.startKm);
  if (operationalKm <= sorted[0].startKm + EPS) return sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    if (operationalKm <= sorted[index].startKm + EPS) return sorted[index];
  }
  return sorted.at(-1);
}

function geometrySegmentAt(segments, chainageKm) {
  if (chainageKm <= segments[0].startChainageKm + EPS) return segments[0];
  if (chainageKm >= segments.at(-1).endChainageKm - EPS) return segments.at(-1);
  return segments.find((segment, index) => {
    const isLast = index === segments.length - 1;
    return chainageKm >= segment.startChainageKm - EPS
      && (isLast ? chainageKm <= segment.endChainageKm + EPS : chainageKm < segment.endChainageKm - EPS);
  }) ?? segments.at(-1);
}

function buildSourceIndices(manifest, sourceDocs) {
  const indices = new Map();
  for (const source of manifest.sources ?? []) {
    if (!sourceDocs[source.id]) continue;
    indices.set(source.id, indexFeatureCollection(sourceDocs[source.id], source.id));
  }
  return indices;
}

function sourceRecord(manifest, sourceDatasetId) {
  return (manifest.sources ?? []).find((source) => source.id === sourceDatasetId);
}

function assembleSegments(manifest, sourceDocs) {
  assert(Array.isArray(manifest.routeSegments) && manifest.routeSegments.length > 0, 'routeSegments are required');
  const toleranceMeters = manifest.guards?.sourceConnectionToleranceM ?? 250;
  const maxDerivedChordKm = manifest.guards?.maxDerivedChordKm ?? 5;
  const indices = buildSourceIndices(manifest, sourceDocs);
  const assembled = [];
  const corridorCoordinates = [];
  let cumulativeKm = 0;
  let maxSourceGapMeters = 0;
  let maxDerivedChordSeenKm = 0;

  for (const descriptor of manifest.routeSegments) {
    assert(typeof descriptor.id === 'string' && descriptor.id.length > 0, 'route segment id required');
    assert(['PUBLIC_ROAD', 'RECONSTRUCTED_ACCESS', 'APPROXIMATE_APPROACH'].includes(descriptor.geometryClass), `${descriptor.id}: invalid geometryClass`);
    const segmentCoordinates = [];
    const previousEnd = corridorCoordinates.at(-1);

    if (descriptor.derivedGeometry) {
      assert(descriptor.derivedGeometry.type === 'LineString' && descriptor.derivedGeometry.coordinates.length >= 2, `${descriptor.id}: derived LineString required`);
      const oriented = orientCoordinates(descriptor.derivedGeometry.coordinates, previousEnd);
      const derivedMax = maxChordKm(oriented);
      maxDerivedChordSeenKm = Math.max(maxDerivedChordSeenKm, derivedMax);
      if (derivedMax > maxDerivedChordKm + EPS) {
        throw new Error(`${descriptor.id}: derived chord ${derivedMax.toFixed(3)} km exceeds maxDerivedChordKm ${maxDerivedChordKm}`);
      }
      appendCoordinates(segmentCoordinates, oriented, toleranceMeters);
    } else {
      assert(Array.isArray(descriptor.sourceFeatureIds) && descriptor.sourceFeatureIds.length > 0, `${descriptor.id}: source feature ids required when derivedGeometry is absent`);
      const sourceIndex = indices.get(descriptor.sourceDatasetId);
      assert(sourceIndex, `${descriptor.id}: source snapshot ${descriptor.sourceDatasetId} is unavailable`);
      for (const id of descriptor.sourceFeatureIds) {
        const feature = sourceIndex.get(id);
        assert(feature, `${descriptor.id}: selected source feature ${id} is absent from ${descriptor.sourceDatasetId}`);
        const referenceEnd = segmentCoordinates.at(-1) ?? previousEnd;
        const oriented = orientCoordinates(feature.geometry.coordinates, referenceEnd);
        if (segmentCoordinates.length > 0) {
          const gap = appendCoordinates(segmentCoordinates, oriented, toleranceMeters);
          maxSourceGapMeters = Math.max(maxSourceGapMeters, gap);
        } else {
          segmentCoordinates.push(...oriented.map((coordinate) => [...coordinate]));
        }
      }
    }

    assert(segmentCoordinates.length >= 2, `${descriptor.id}: assembled geometry requires at least two coordinates`);
    const source = sourceRecord(manifest, descriptor.sourceDatasetId);
    if (!descriptor.derivedGeometry) assert(source, `${descriptor.id}: source record ${descriptor.sourceDatasetId} is missing`);
    if (descriptor.geometryClass === 'PUBLIC_ROAD') {
      assert(descriptor.sourceFeatureIds?.length > 0, `${descriptor.id}: PUBLIC_ROAD requires source feature ids`);
    }

    if (corridorCoordinates.length > 0) {
      const gap = appendCoordinates(corridorCoordinates, segmentCoordinates, toleranceMeters);
      maxSourceGapMeters = Math.max(maxSourceGapMeters, gap);
    } else {
      corridorCoordinates.push(...segmentCoordinates.map((coordinate) => [...coordinate]));
    }

    const segmentLengthKm = buildChainage(segmentCoordinates).at(-1).chainageKm;
    const startChainageKm = cumulativeKm;
    const endChainageKm = cumulativeKm + segmentLengthKm;
    cumulativeKm = endChainageKm;

    assembled.push({
      id: descriptor.id,
      corridorId: manifest.corridorId,
      geometryClass: descriptor.geometryClass,
      geometry: { type: 'LineString', coordinates: segmentCoordinates },
      sourceFeatureIds: [...(descriptor.sourceFeatureIds ?? [])],
      evidenceRefs: [...(descriptor.evidenceRefs ?? [])],
      sourceDatasetId: descriptor.sourceDatasetId,
      sourceRetrievedAt: source?.retrievedAt ?? manifest.generatedAt ?? 'unknown',
      ...(source?.license ? { sourceLicense: source.license } : {}),
      limitations: [...(descriptor.limitations ?? []), ...(source?.limitations ?? [])],
      startChainageKm,
      endChainageKm,
    });
  }

  return { assembled, corridorCoordinates, maxSourceGapMeters, maxDerivedChordSeenKm };
}

export function buildRoadGeometry(manifest, sourceDocs, v1Metadata, v1Profile, options = {}) {
  assert(manifest?.corridorId === 'veladero', `Unsupported corridor ${manifest?.corridorId ?? '(missing)'}`);
  assert(v1Metadata?.id === manifest.corridorId, 'V1 metadata corridor id mismatch');
  assert(Array.isArray(v1Metadata.segments) && v1Metadata.segments.length > 0, 'V1 operational segments required');
  assert(Array.isArray(v1Metadata.nodes), 'V1 nodes required');
  assert(Array.isArray(v1Profile?.samples) && v1Profile.samples.length >= 2, 'V1 elevation profile required');

  const { assembled, corridorCoordinates, maxSourceGapMeters, maxDerivedChordSeenKm } = assembleSegments(manifest, sourceDocs);
  const chainage = buildChainage(corridorCoordinates);
  const measuredChainageKm = chainage.at(-1).chainageKm;
  const minKm = manifest.guards?.chainageMinKm ?? 324;
  const maxKm = manifest.guards?.chainageMaxKm ?? 396;
  assert(measuredChainageKm >= minKm && measuredChainageKm <= maxKm, `Measured chainage ${measuredChainageKm.toFixed(3)} km outside ${minKm}-${maxKm} km guard`);

  const locatedAnchors = validateAnchorOrder((manifest.anchors ?? []).map((anchor) => locateAnchor(chainage, anchor)));
  const calibrationAnchors = locatedAnchors
    .filter((anchor) => Number.isFinite(anchor.operationalKm))
    .map((anchor) => ({
      id: anchor.id,
      geometryChainageKm: anchor.geometryChainageKm,
      operationalKm: anchor.operationalKm,
      evidenceRefs: [...(anchor.evidenceRefs ?? [])],
    }));
  assert(calibrationAnchors.length >= 3, 'Operational calibration requires San Juan, Tudcum and Veladero anchors');
  assert(Math.abs(calibrationAnchors[0].operationalKm) <= EPS, 'Operational calibration must start at 0 km');
  assert(Math.abs(calibrationAnchors.at(-1).operationalKm - v1Metadata.totalDistanceKm) <= EPS, 'Operational calibration must end at V1 totalDistanceKm');

  const operationalBoundaries = unique(v1Metadata.segments.flatMap((segment) => [segment.startKm, segment.endKm])).sort((a, b) => a - b);
  const requiredChainages = unique([
    ...assembled.flatMap((segment) => [segment.startChainageKm, segment.endChainageKm]),
    ...calibrationAnchors.map((anchor) => anchor.geometryChainageKm),
    ...operationalBoundaries.map((operationalKm) => chainageForOperationalKm(operationalKm, calibrationAnchors)),
  ]).sort((a, b) => a - b);

  const sampled = resamplePolyline(corridorCoordinates, options.spacingMeters ?? 250, requiredChainages);
  const routeSamples = sampled.map((sample) => {
    const rawOperationalKm = calibrateOperationalKm(sample.chainageKm, calibrationAnchors);
    const operationalKm = snapOperationalKm(rawOperationalKm, operationalBoundaries);
    const operationalSegment = legacyRouteSampleSegmentAt(v1Metadata.segments, operationalKm);
    const geometrySegment = geometrySegmentAt(assembled, sample.chainageKm);
    return {
      distanceKm: round(operationalKm, 9),
      lon: round(sample.lon, 9),
      lat: round(sample.lat, 9),
      elevationM: round(interpolateElevation(v1Profile.samples, operationalKm), 6),
      segmentId: operationalSegment.id,
      geometryChainageKm: round(sample.chainageKm, 9),
      geometrySegmentId: geometrySegment.id,
      geometryClass: geometrySegment.geometryClass,
    };
  });

  routeSamples[0].distanceKm = 0;
  routeSamples[0].segmentId = [...v1Metadata.segments].sort((a, b) => a.startKm - b.startKm)[0].id;
  routeSamples.at(-1).distanceKm = v1Metadata.totalDistanceKm;
  assert(routeSamples.some((sample) => Math.abs(sample.distanceKm - 205) <= EPS), 'Generated samples must include exact operational km 205');

  const segmentFeatures = assembled.map((segment) => ({
    type: 'Feature',
    id: segment.id,
    properties: {
      id: segment.id,
      corridorId: segment.corridorId,
      geometryClass: segment.geometryClass,
      sourceFeatureIds: segment.sourceFeatureIds,
      evidenceRefs: segment.evidenceRefs,
      sourceDatasetId: segment.sourceDatasetId,
      sourceRetrievedAt: segment.sourceRetrievedAt,
      ...(segment.sourceLicense ? { sourceLicense: segment.sourceLicense } : {}),
      limitations: segment.limitations,
      geometryChainageStartKm: round(segment.startChainageKm, 6),
      geometryChainageEndKm: round(segment.endChainageKm, 6),
    },
    geometry: segment.geometry,
  }));

  const usedEvidenceRefs = unique([
    ...(v1Metadata.evidenceRefs ?? []),
    ...assembled.flatMap((segment) => segment.evidenceRefs),
  ]);

  const metadata = {
    ...v1Metadata,
    schemaVersion: 'sanjuan.corridor-metadata/v2',
    geometryClass: 'RECONSTRUCTED_ACCESS',
    geometryVersion: 'v2',
    geometryMeasuredChainageKm: round(measuredChainageKm, 6),
    geometrySourceIds: unique(assembled.map((segment) => segment.sourceDatasetId)),
    evidenceRefs: usedEvidenceRefs,
    retrievedAt: manifest.generatedAt ?? v1Metadata.retrievedAt,
    limitations: unique([
      ...(v1Metadata.limitations ?? []),
      'V2 geometry combines frozen official-road snapshots, publicly mapped access geometry and explicit derived connectors; it is not current operator navigation.',
    ]),
  };

  const corridor = {
    type: 'Feature',
    id: manifest.corridorId,
    properties: {
      id: manifest.corridorId,
      name: v1Metadata.name,
      geometryClass: 'RECONSTRUCTED_ACCESS',
      evidenceRefs: usedEvidenceRefs,
      geometryMeasuredChainageKm: round(measuredChainageKm, 6),
    },
    geometry: { type: 'LineString', coordinates: corridorCoordinates },
  };

  const segments = {
    type: 'FeatureCollection',
    features: segmentFeatures,
  };

  const routeSamplesDoc = {
    schemaVersion: 'sanjuan.route-samples/v2',
    corridorId: manifest.corridorId,
    samples: routeSamples,
  };

  return {
    metadata,
    corridor,
    segments,
    routeSamples: routeSamplesDoc,
    validation: {
      measuredChainageKm: round(measuredChainageKm, 6),
      routeSampleCount: routeSamples.length,
      geometryVertexCount: corridorCoordinates.length,
      locatedAnchors: locatedAnchors.map((anchor) => ({
        id: anchor.id,
        geometryChainageKm: round(anchor.geometryChainageKm, 6),
        distanceToRouteKm: round(anchor.distanceToRouteKm, 6),
        ...(Number.isFinite(anchor.operationalKm) ? { operationalKm: anchor.operationalKm } : {}),
      })),
      calibrationAnchors,
      maxSourceGapMeters: round(maxSourceGapMeters, 3),
      maxDerivedChordKm: round(maxDerivedChordSeenKm, 6),
      geometryClassCounts: assembled.reduce((counts, segment) => ({
        ...counts,
        [segment.geometryClass]: (counts[segment.geometryClass] ?? 0) + 1,
      }), {}),
    },
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function buildFromDisk(corridorId) {
  if (corridorId !== 'veladero') throw new Error(`Unsupported corridor ${corridorId}`);
  const corridorDir = path.join(process.cwd(), 'public', 'data', 'corridors', corridorId);
  const [manifest, v1Metadata, v1Profile] = await Promise.all([
    readJson(path.join(corridorDir, 'sources.v2.json')),
    readJson(path.join(corridorDir, 'metadata.v1.json')),
    readJson(path.join(corridorDir, 'profile.v1.json')),
  ]);
  const sourceDocs = {};
  for (const source of manifest.sources ?? []) {
    if (!source.snapshotPath) continue;
    sourceDocs[source.id] = await readJson(path.join(corridorDir, source.snapshotPath));
  }
  return { corridorDir, built: buildRoadGeometry(manifest, sourceDocs, v1Metadata, v1Profile) };
}

async function writeBuild(corridorId) {
  const { corridorDir, built } = await buildFromDisk(corridorId);
  await mkdir(corridorDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(corridorDir, 'metadata.v2.json'), `${JSON.stringify(built.metadata, null, 2)}\n`),
    writeFile(path.join(corridorDir, 'corridor.v2.geojson'), `${JSON.stringify(built.corridor, null, 2)}\n`),
    writeFile(path.join(corridorDir, 'segments.v2.geojson'), `${JSON.stringify(built.segments, null, 2)}\n`),
    writeFile(path.join(corridorDir, 'route-samples.v2.json'), `${JSON.stringify(built.routeSamples, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(built.validation, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  const corridorId = process.argv[2] ?? 'veladero';
  await writeBuild(corridorId);
}
