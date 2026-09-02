import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters } from './lib/road-geometry.mjs';

const JUNCTION_TOLERANCE_M = 0.5;
const HUALILAN_ORIGIN = [-68.5364, -31.5375];
const HUALILAN_DESTINATION = [-68.95, -30.73333];

export const HUALILAN_SOURCE_SELECTION = {
  dnv: [
    { id: 'vial_nacional.2175', expectedRoute: 'A014', entry: [-68.55289386, -31.5383514], exit: [-68.5174353, -31.51626151] },
    { id: 'vial_nacional.2570', expectedRoute: '40', entry: [-68.5174353, -31.51626151], exit: [-68.51746356, -31.51616267] },
    { id: 'vial_nacional.2565', expectedRoute: '40', entry: [-68.51746356, -31.51616267], exit: [-68.5179294, -31.5146699] },
    { id: 'vial_nacional.1192', expectedRoute: '40', entry: [-68.5179294, -31.5146699], exit: [-68.51796578, -31.51445853] },
    { id: 'vial_nacional.2201', expectedRoute: '40', entry: [-68.51796578, -31.51445853], exit: [-68.51929325, -31.46124165] },
    { id: 'vial_nacional.1174', expectedRoute: '40', entry: [-68.51929325, -31.46124165], exit: [-68.518468, -31.4488493] },
    { id: 'vial_nacional.1175', expectedRoute: '40', entry: [-68.518468, -31.4488493], exit: [-68.519234, -31.4466004] },
    { id: 'vial_nacional.1172', expectedRoute: '40', entry: [-68.519234, -31.4466004], exit: [-68.6383556, -31.0989982] },
    { id: 'vial_nacional.280', expectedRoute: '149', entry: [-68.8027955, -30.9856283], exit: [-68.8035691, -30.9842587] },
    { id: 'vial_nacional.1870', expectedRoute: '149', entry: [-68.8035691, -30.9842587], exit: [-68.9608727, -30.7305878] },
  ],
  ign: [
    { id: 'vial_provincial.10291', expectedRoute: '436', entry: [-68.6383556, -31.0989982], exit: [-68.6391483, -31.0977201] },
    { id: 'vial_provincial.10290', expectedRoute: '436', entry: [-68.6391483, -31.0977201], exit: [-68.8027446, -30.9874966] },
    { id: 'vial_provincial.10289', expectedRoute: '436', entry: [-68.8027446, -30.9874966], exit: [-68.8027955, -30.9856283] },
  ],
  osm: [
    { id: 'osm-way-408648158', entry: [-68.9608727, -30.7305878], exit: [-68.9563672, -30.7351108] },
    { id: 'osm-way-644573146', entry: [-68.9563672, -30.7351108], exit: [-68.9519658, -30.7310231] },
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function featureCoordinates(feature) {
  const geometry = feature?.geometry;
  assert(geometry, `feature ${feature?.id ?? '(missing)'}: geometry required`);
  if (geometry.type === 'LineString') return geometry.coordinates.map((coordinate) => coordinate.slice(0, 2));
  if (geometry.type === 'MultiLineString' && geometry.coordinates.length === 1) {
    return geometry.coordinates[0].map((coordinate) => coordinate.slice(0, 2));
  }
  throw new Error(`feature ${feature?.id ?? '(missing)'}: one LineString path required`);
}

function coordinateIndex(coordinates, target, label) {
  let best = null;
  for (let index = 0; index < coordinates.length; index += 1) {
    const distanceM = haversineMeters(coordinates[index], target);
    if (!best || distanceM < best.distanceM) best = { index, distanceM };
  }
  if (!best || best.distanceM > JUNCTION_TOLERANCE_M) {
    throw new Error(`${label}: source junction is absent (nearest ${best ? best.distanceM.toFixed(3) : 'n/a'} m)`);
  }
  return best.index;
}

function lineLengthKm(coordinates) {
  let meters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    meters += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return Math.round((meters / 1000) * 1e6) / 1e6;
}

export function clipSourceFeature(rawFeature, selection, corridorId) {
  assert(rawFeature?.type === 'Feature', `${selection.id}: source Feature required`);
  const rawId = String(rawFeature.id ?? rawFeature.properties?.sourceFeatureId ?? '');
  assert(rawId === selection.id, `${selection.id}: source feature id mismatch`);

  if (selection.expectedRoute != null) {
    const actual = rawFeature.properties?.designacion_de_red_vial;
    if (String(actual ?? '').trim() !== String(selection.expectedRoute).trim()) {
      throw new Error(`${selection.id}: route designation mismatch; expected ${selection.expectedRoute}, found ${String(actual)}`);
    }
  }

  const coordinates = featureCoordinates(rawFeature);
  const entryIndex = coordinateIndex(coordinates, selection.entry, `${selection.id} entry junction`);
  const exitIndex = coordinateIndex(coordinates, selection.exit, `${selection.id} exit junction`);
  assert(entryIndex !== exitIndex, `${selection.id}: source junctions must define a non-zero path`);

  const low = Math.min(entryIndex, exitIndex);
  const high = Math.max(entryIndex, exitIndex);
  const clipped = coordinates.slice(low, high + 1);
  if (entryIndex > exitIndex) clipped.reverse();

  assert(haversineMeters(clipped[0], selection.entry) <= JUNCTION_TOLERANCE_M, `${selection.id}: entry junction orientation failed`);
  assert(haversineMeters(clipped.at(-1), selection.exit) <= JUNCTION_TOLERANCE_M, `${selection.id}: exit junction orientation failed`);

  return {
    type: 'Feature',
    id: selection.id,
    properties: {
      ...(rawFeature.properties ?? {}),
      sourceFeatureId: selection.id,
      selectedForCorridor: corridorId,
      selectionMethod: 'reviewed source-junction clip between pinned coordinates',
      selectionLengthKm: lineLengthKm(clipped),
      sourceGeometryClipped: true,
    },
    geometry: { type: 'LineString', coordinates: clipped },
  };
}

function featureIndex(collection, label) {
  assert(collection?.type === 'FeatureCollection' && Array.isArray(collection.features), `${label}: FeatureCollection required`);
  return new Map(collection.features.map((feature) => [String(feature.id ?? feature.properties?.sourceFeatureId ?? ''), feature]));
}

function selectGroup(collection, descriptors, label) {
  const index = featureIndex(collection, label);
  return descriptors.map((descriptor) => {
    const feature = index.get(descriptor.id);
    assert(feature, `${label}: reviewed source feature ${descriptor.id} is absent`);
    return clipSourceFeature(feature, descriptor, 'hualilan');
  });
}

export function selectHualilanSources({ dnv, ign, osm }) {
  return {
    dnv: selectGroup(dnv, HUALILAN_SOURCE_SELECTION.dnv, 'Hualilan DNV source'),
    ign: selectGroup(ign, HUALILAN_SOURCE_SELECTION.ign, 'Hualilan IGN source'),
    osm: selectGroup(osm, HUALILAN_SOURCE_SELECTION.osm, 'Hualilan OSM source'),
  };
}

function sourceById(inventory, id) {
  const source = inventory?.sources?.find((candidate) => candidate.id === id);
  assert(source, `Hualilan inventory source ${id} is required`);
  return source;
}

function sourceRecord(source, { id = source.id, snapshotPath, featureIds, role, format }) {
  return {
    id,
    provider: source.provider,
    datasetName: source.resourceName ?? source.id,
    sourceUrl: source.sourceUrl,
    ...(source.catalogUrl ? { catalogUrl: source.catalogUrl } : {}),
    ...(source.resourceId ? { catalogResourceId: source.resourceId } : {}),
    ...(source.requestUrl ? { requestUrl: source.requestUrl } : {}),
    snapshotPath,
    retrievedAt: source.retrievedAt,
    role,
    format,
    ...(source.license ? { license: source.license } : {}),
    ...(source.attribution ? { attribution: source.attribution } : {}),
    featureIds,
    limitations: format === 'OSM'
      ? [
          'Publicly mapped Hualilan access geometry only; not operator-supplied navigation or authorization evidence.',
          'OSM tags and geometry do not establish current road condition, closure, safety or transitability.',
        ]
      : [
          'Frozen corridor-only source extract; not a live road-status or navigation feed.',
          'Published reference geometry may be stale relative to current road works.',
        ],
  };
}

function ids(features) {
  return features.map((feature) => String(feature.id));
}

function routeIds(features, route) {
  return features
    .filter((feature) => String(feature.properties?.designacion_de_red_vial ?? '') === route)
    .map((feature) => String(feature.id));
}

function endpoints(features) {
  assert(Array.isArray(features) && features.length > 0, 'Selected feature group must not be empty');
  return {
    start: features[0].geometry.coordinates[0],
    end: features.at(-1).geometry.coordinates.at(-1),
  };
}

function assertGroupContinuity(groups) {
  const ordered = groups.flat();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].geometry.coordinates.at(-1);
    const current = ordered[index].geometry.coordinates[0];
    const gapM = haversineMeters(previous, current);
    assert(gapM <= JUNCTION_TOLERANCE_M, `Hualilan reviewed source chain gap ${gapM.toFixed(3)} m before ${ordered[index].id}`);
  }
}

export function buildHualilanAuthoringBundle({
  selected,
  inventory,
  acquisition = {},
  origin = HUALILAN_ORIGIN,
  destination = HUALILAN_DESTINATION,
}) {
  assert(inventory?.corridorId === 'hualilan', 'Hualilan source inventory required');
  assert(selected?.dnv?.length > 0 && selected?.ign?.length > 0 && selected?.osm?.length > 0, 'Hualilan reviewed DNV, IGN and OSM selections are required');

  const dnvFirst = selected.dnv.filter((feature) => !['149'].includes(String(feature.properties?.designacion_de_red_vial ?? '')));
  const dnvLast = selected.dnv.filter((feature) => String(feature.properties?.designacion_de_red_vial ?? '') === '149');
  assert(dnvFirst.length > 0 && dnvLast.length > 0, 'Hualilan DNV selection must include regional and RN149 legs');
  assertGroupContinuity([dnvFirst, selected.ign, dnvLast, selected.osm]);

  const dnvInventory = sourceById(inventory, 'dnv-rutas-nacionales-20260830');
  const ignInventory = sourceById(inventory, 'ign-rutas-provinciales-2016-20260830');
  const osmInventory = sourceById(inventory, 'osm-road-access-hualilan-v2');
  const generatedAt = inventory.generatedAt;

  const dnvSourceId = dnvInventory.id;
  const ignSourceId = ignInventory.id;
  const osmSourceId = 'osm-hualilan-access-v2';
  const derivedSourceId = 'hualilan-derived-geometry-v2';
  const firstSource = endpoints(dnvFirst).start;
  const lastMappedAccess = endpoints(selected.osm).end;
  const rn40End = endpoints(dnvFirst).end;
  const rp436End = endpoints(selected.ign).end;
  const rn149End = endpoints(dnvLast).end;

  const manifest = {
    schemaVersion: 'sanjuan.road-geometry-sources/v2',
    corridorId: 'hualilan',
    generatedAt,
    acquisition: {
      ...(Number.isFinite(acquisition.workflowRunId) ? { workflowRunId: acquisition.workflowRunId } : {}),
      ...(Number.isFinite(acquisition.artifactId) ? { artifactId: acquisition.artifactId } : {}),
      ...(acquisition.artifactName ? { artifactName: acquisition.artifactName } : {}),
      ...(acquisition.artifactDigest ? { artifactDigest: acquisition.artifactDigest } : {}),
      ...(acquisition.headSha ? { headSha: acquisition.headSha } : {}),
    },
    guards: {
      anchorDefaultMaxDistanceKm: 2,
      sourceConnectionToleranceM: 250,
      maxUndocumentedGapKm: 2,
      maxDerivedChordKm: 2,
      chainageMinKm: 115,
      chainageMaxKm: 135,
    },
    anchors: [
      { id: 'san-juan', lat: origin[1], lon: origin[0], operationalKm: 0, maxDistanceToRouteKm: 2 },
      { id: 'rn40-rp436-junction', lat: rn40End[1], lon: rn40End[0], maxDistanceToRouteKm: 0.25, evidenceRefs: ['hualilan-dnv-road-geometry-v2', 'hualilan-ign-road-geometry-v2'] },
      { id: 'rp436-rn149-junction', lat: rp436End[1], lon: rp436End[0], maxDistanceToRouteKm: 0.25, evidenceRefs: ['hualilan-ign-road-geometry-v2', 'hualilan-dnv-road-geometry-v2'] },
      { id: 'rn149-osm-access-junction', lat: rn149End[1], lon: rn149End[0], maxDistanceToRouteKm: 0.25, evidenceRefs: ['hualilan-dnv-road-geometry-v2', 'hualilan-osm-access-geometry-v2'] },
      { id: 'hualilan', lat: destination[1], lon: destination[0], operationalKm: 120, maxDistanceToRouteKm: 2 },
    ],
    sources: [
      sourceRecord(dnvInventory, { snapshotPath: 'source-snapshots/dnv-national-roads.v1.geojson', featureIds: ids(selected.dnv), role: 'PRIMARY', format: 'GeoJSON' }),
      sourceRecord(ignInventory, { snapshotPath: 'source-snapshots/ign-provincial-roads.v1.geojson', featureIds: ids(selected.ign), role: 'PRIMARY', format: 'GeoJSON' }),
      sourceRecord(osmInventory, { id: osmSourceId, snapshotPath: 'source-snapshots/osm-access.v1.geojson', featureIds: ids(selected.osm), role: 'FALLBACK', format: 'OSM' }),
      {
        id: derivedSourceId,
        provider: 'San Juan Mining Ops Sim',
        datasetName: 'Explicit Hualilan corridor connectors',
        sourceUrl: 'public/data/corridors/hualilan/sources.v2.json',
        retrievedAt: generatedAt,
        role: 'FALLBACK',
        format: 'GeoJSON',
        featureIds: ['hualilan-origin-connector-v2', 'hualilan-project-approach-v2'],
        limitations: [
          'These geometries are explicit derived connectors, not source road features.',
          'They only connect the scenario origin and project-location anchor to the reviewed source-backed path.',
        ],
      },
    ],
    evidence: [
      {
        id: 'hualilan-dnv-road-geometry-v2', role: 'PRIMARY', sourceName: 'DNV / Datos Argentina national-road geometry snapshot',
        sourceUrl: dnvInventory.catalogUrl ?? dnvInventory.sourceUrl, retrievedAt: generatedAt,
        method: 'Exact reviewed DNV feature ids clipped between pinned source junctions for A014, RN40 and RN149.',
        ...(dnvInventory.license ? { license: dnvInventory.license } : {}),
        limitations: ['Reference geometry only; not a live road-status, navigation, closure or authorization source.'],
      },
      {
        id: 'hualilan-ign-road-geometry-v2', role: 'PRIMARY', sourceName: 'IGN / Datos Argentina provincial-road geometry snapshot',
        sourceUrl: ignInventory.catalogUrl ?? ignInventory.sourceUrl, retrievedAt: generatedAt,
        method: 'Exact reviewed IGN feature ids clipped between pinned source junctions for RP436.',
        ...(ignInventory.license ? { license: ignInventory.license } : {}),
        limitations: ['Published reference geometry; not a live road-status, navigation, closure or authorization source.'],
      },
      {
        id: 'hualilan-osm-access-geometry-v2', role: 'PRIMARY', sourceName: 'OpenStreetMap Hualilan access geometry snapshot',
        sourceUrl: 'https://www.openstreetmap.org/copyright', retrievedAt: generatedAt,
        method: 'Reviewed OSM ways 408648158 and 644573146 retain the publicly mapped access from RN149 toward Hualilan.',
        license: 'ODbL 1.0',
        limitations: ['Publicly mapped access geometry is not operator navigation, access authorization, road condition or a safety assertion.'],
      },
      {
        id: 'hualilan-route-geometry-build-v2', role: 'DERIVED', sourceName: 'San Juan Mining Ops Sim — Hualilan V0.2A route assembly',
        retrievedAt: generatedAt,
        method: 'Deterministic reviewed source-feature sequence with explicit origin and final project-anchor connectors; no runtime automatic routing.',
        limitations: ['Derived connectors are not source road geometry.', 'The complete corridor remains conservative RECONSTRUCTED_ACCESS at corridor level.'],
      },
    ],
    routeSegments: [
      {
        id: 'hualilan-origin-connector-v2', geometryClass: 'RECONSTRUCTED_ACCESS', sourceDatasetId: derivedSourceId, sourceFeatureIds: [],
        evidenceRefs: ['hualilan-route-geometry-build-v2'],
        derivedGeometry: { type: 'LineString', coordinates: [origin, firstSource] },
        method: 'Straight derived connector from the San Juan scenario origin to the reviewed A014 source path.',
        limitations: ['Explicit derived connector; not asserted as public-road source geometry.'],
      },
      { id: 'hualilan-a014-public-v2', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: dnvSourceId, sourceFeatureIds: routeIds(dnvFirst, 'A014'), evidenceRefs: ['hualilan-dnv-road-geometry-v2'], label: 'A014' },
      { id: 'hualilan-rn40-public-v2', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: dnvSourceId, sourceFeatureIds: routeIds(dnvFirst, '40'), evidenceRefs: ['hualilan-dnv-road-geometry-v2'], label: 'RN 40' },
      { id: 'hualilan-rp436-public-v2', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: ignSourceId, sourceFeatureIds: ids(selected.ign), evidenceRefs: ['hualilan-ign-road-geometry-v2'], label: 'RP 436' },
      { id: 'hualilan-rn149-public-v2', geometryClass: 'PUBLIC_ROAD', sourceDatasetId: dnvSourceId, sourceFeatureIds: ids(dnvLast), evidenceRefs: ['hualilan-dnv-road-geometry-v2'], label: 'RN 149' },
      {
        id: 'hualilan-osm-access-v2', geometryClass: 'RECONSTRUCTED_ACCESS', sourceDatasetId: osmSourceId, sourceFeatureIds: ids(selected.osm),
        evidenceRefs: ['hualilan-osm-access-geometry-v2'], label: 'Publicly mapped Hualilan access',
        limitations: ['OSM-mapped access only; not operator navigation, access authorization or a current road-status feed.'],
      },
      {
        id: 'hualilan-project-approach-v2', geometryClass: 'APPROXIMATE_APPROACH', sourceDatasetId: derivedSourceId, sourceFeatureIds: [],
        evidenceRefs: ['hualilan-route-geometry-build-v2'],
        derivedGeometry: { type: 'LineString', coordinates: [lastMappedAccess, destination] },
        method: 'Straight connector from the end of the reviewed OSM access to the published project-location anchor.',
        limitations: ['Approximate final approach to the project-location anchor; not operator navigation or access authorization.'],
      },
    ],
  };

  return {
    manifest,
    snapshots: {
      dnv: { type: 'FeatureCollection', features: selected.dnv },
      ign: { type: 'FeatureCollection', features: selected.ign },
      osm: { type: 'FeatureCollection', features: selected.osm },
    },
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function authorHualilanV2({ acquisitionDir, outputDir, acquisition = {} }) {
  const [dnv, ign, osm, inventory] = await Promise.all([
    readJson(path.join(acquisitionDir, 'dnv-national-roads.v1.geojson')),
    readJson(path.join(acquisitionDir, 'ign-provincial-roads.v1.geojson')),
    readJson(path.join(acquisitionDir, 'osm-access.v1.geojson')),
    readJson(path.join(acquisitionDir, 'source-inventory.json')),
  ]);
  const selected = selectHualilanSources({ dnv, ign, osm });
  const bundle = buildHualilanAuthoringBundle({ selected, inventory, acquisition });

  await Promise.all([
    writeJson(path.join(outputDir, 'source-snapshots', 'dnv-national-roads.v1.geojson'), bundle.snapshots.dnv),
    writeJson(path.join(outputDir, 'source-snapshots', 'ign-provincial-roads.v1.geojson'), bundle.snapshots.ign),
    writeJson(path.join(outputDir, 'source-snapshots', 'osm-access.v1.geojson'), bundle.snapshots.osm),
    writeJson(path.join(outputDir, 'sources.v2.json'), bundle.manifest),
  ]);
  return bundle;
}

function cliArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const acquisitionDir = cliArg(args, '--acquisition-dir');
  const outputDir = cliArg(args, '--output-dir') ?? path.join('public', 'data', 'corridors', 'hualilan');
  assert(acquisitionDir, '--acquisition-dir is required');
  const workflowRunIdRaw = cliArg(args, '--workflow-run-id');
  const artifactIdRaw = cliArg(args, '--artifact-id');
  authorHualilanV2({
    acquisitionDir,
    outputDir,
    acquisition: {
      ...(workflowRunIdRaw ? { workflowRunId: Number(workflowRunIdRaw) } : {}),
      ...(artifactIdRaw ? { artifactId: Number(artifactIdRaw) } : {}),
      ...(cliArg(args, '--artifact-name') ? { artifactName: cliArg(args, '--artifact-name') } : {}),
      ...(cliArg(args, '--artifact-digest') ? { artifactDigest: cliArg(args, '--artifact-digest') } : {}),
      ...(cliArg(args, '--head-sha') ? { headSha: cliArg(args, '--head-sha') } : {}),
    },
  }).then((bundle) => {
    console.log(`Hualilan authoring bundle written with ${bundle.snapshots.dnv.features.length} DNV, ${bundle.snapshots.ign.features.length} IGN and ${bundle.snapshots.osm.features.length} OSM features.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
