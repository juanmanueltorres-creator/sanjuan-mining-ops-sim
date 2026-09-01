import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BUFFER_DEGREES = 0.25;
const SUPPORTED_GEOMETRY_TYPES = new Set(['LineString', 'MultiLineString']);
const IGN_PROVIDER = 'Instituto Geográfico Nacional de la República Argentina';
const IGN_SOURCE_URL = 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG';
const IGN_LICENSE_URL = 'https://www.ign.gob.ar/descargas/tyc1.html';
const IGN_ATTRIBUTION = 'FUENTE: Instituto Geográfico Nacional de la República Argentina';

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function collectGeometryCoordinates(geometry) {
  if (!geometry || typeof geometry !== 'object') throw new Error('Feature geometry is required');
  if (!SUPPORTED_GEOMETRY_TYPES.has(geometry.type)) {
    throw new Error(`Unsupported road-context geometry type: ${geometry.type ?? 'missing'}`);
  }

  if (geometry.type === 'LineString') return geometry.coordinates;
  return geometry.coordinates.flat();
}

function geometryBounds(geometry) {
  const coordinates = collectGeometryCoordinates(geometry);
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error('Road-context geometry has no coordinates');

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error('Road-context coordinate must contain lon/lat');
    const lon = requireFiniteNumber(coordinate[0], 'Road-context longitude');
    const lat = requireFiniteNumber(coordinate[1], 'Road-context latitude');
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }

  return { west, south, east, north };
}

function parseRouteSamples(document) {
  if (!document || typeof document !== 'object') throw new Error('Route-sample document is required');
  if (!Array.isArray(document.samples) || document.samples.length === 0) {
    throw new Error(`Route-sample document ${document.corridorId ?? 'unknown'} has no samples`);
  }
  return document.samples;
}

export function deriveExpandedOperationalBounds(routeDocuments, bufferDegrees = DEFAULT_BUFFER_DEGREES) {
  if (!Array.isArray(routeDocuments) || routeDocuments.length === 0) {
    throw new Error('At least one route-sample document is required');
  }
  requireFiniteNumber(bufferDegrees, 'Road-context bbox buffer');
  if (bufferDegrees < 0) throw new Error('Road-context bbox buffer must be non-negative');

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const document of routeDocuments) {
    for (const sample of parseRouteSamples(document)) {
      const lon = requireFiniteNumber(sample.lon, `${document.corridorId ?? 'route'} sample longitude`);
      const lat = requireFiniteNumber(sample.lat, `${document.corridorId ?? 'route'} sample latitude`);
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    }
  }

  return {
    west: west - bufferDegrees,
    south: south - bufferDegrees,
    east: east + bufferDegrees,
    north: north + bufferDegrees,
    bufferDegrees,
  };
}

export function featureIntersectsBounds(feature, bounds) {
  if (!feature || feature.type !== 'Feature') throw new Error('Road-context source entry must be a GeoJSON Feature');
  const featureBounds = geometryBounds(feature.geometry);
  return !(
    featureBounds.east < bounds.west
    || featureBounds.west > bounds.east
    || featureBounds.north < bounds.south
    || featureBounds.south > bounds.north
  );
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function hasIgnSignature(properties = {}) {
  return [properties.sag, properties.fdc, properties.fuente, properties.source]
    .some((value) => typeof value === 'string' && /(^|\b)IGN(\b|$)/i.test(value));
}

function normalizeSourceId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error('IGN road-context feature requires a stable gid');
}

export function normalizeRoadFeature(feature) {
  if (!feature || feature.type !== 'Feature') throw new Error('Road-context source entry must be a GeoJSON Feature');
  const properties = feature.properties ?? {};
  if (!hasIgnSignature(properties)) throw new Error('Road-context source feature lacks an IGN provenance signature');
  collectGeometryCoordinates(feature.geometry);

  const objectType = firstNonEmptyString(properties.objeto);
  if (!objectType) throw new Error('IGN road-context feature requires objeto');

  return {
    type: 'Feature',
    properties: {
      id: `ign:${normalizeSourceId(properties.gid)}`,
      objectType,
      roadRef: firstNonEmptyString(properties.rtn),
      sourceAgency: 'IGN',
    },
    // Preserve source coordinates exactly. V0.1.1 performs feature-level
    // selection only: no clipping, simplification, snapping or mutation.
    geometry: feature.geometry,
  };
}

export function validateIgnSource(source) {
  if (!source || source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('IGN road-context source must be a GeoJSON FeatureCollection');
  }
  if (source.features.length === 0) throw new Error('IGN road-context source must contain features');

  for (const feature of source.features) {
    normalizeRoadFeature(feature);
  }

  return source;
}

function normalizeSourceIdentity(sourceIdentity) {
  const required = ['repository', 'path', 'commit', 'blobSha'];
  const normalized = {};
  for (const key of required) {
    const value = sourceIdentity?.[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Road-context source identity requires ${key}`);
    normalized[key] = value.trim();
  }
  return normalized;
}

export function buildRoadContext({ source, routeDocuments, sourceIdentity }) {
  validateIgnSource(source);
  const sourceRef = normalizeSourceIdentity(sourceIdentity);
  const bounds = deriveExpandedOperationalBounds(routeDocuments);

  const selected = source.features
    .filter((feature) => featureIntersectsBounds(feature, bounds))
    .map(normalizeRoadFeature)
    .sort((left, right) => left.properties.id.localeCompare(right.properties.id));

  const geojson = {
    type: 'FeatureCollection',
    features: selected,
  };

  const metadata = {
    schemaVersion: 'sanjuan.road-context/v1',
    id: 'san-juan-ign-road-context-v1',
    provider: IGN_PROVIDER,
    authoringSource: `Geo_Platform/${sourceRef.path}`,
    sourceCommit: sourceRef.commit,
    sourceBlobSha: sourceRef.blobSha,
    sourceUrl: IGN_SOURCE_URL,
    licenseUrl: IGN_LICENSE_URL,
    attribution: IGN_ATTRIBUTION,
    selectionMethod: 'feature-bbox intersection around active-corridor route-sample bbox + 0.25 degrees',
    contextPaddingDegrees: DEFAULT_BUFFER_DEGREES,
    featureCount: selected.length,
    limitations: [
      'Cartographic reference only; not an operational route, access authorization, road-status or navigation dataset.',
      'The exact historical IGN download endpoint used when the GeoPlatform authoring file was added was not recorded; provider identity is retained in the source attributes and official IGN reuse terms are cited separately.',
    ],
  };

  return { geojson, metadata };
}

function parseArgs(argv) {
  const parsed = { routeSamplePaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--route-samples') {
      if (!value) throw new Error('--route-samples requires a path');
      parsed.routeSamplePaths.push(value);
      index += 1;
      continue;
    }
    const keyByArg = {
      '--source': 'sourcePath',
      '--output-geojson': 'outputGeojsonPath',
      '--output-metadata': 'outputMetadataPath',
      '--source-repository': 'sourceRepository',
      '--source-path': 'sourceRepoPath',
      '--source-commit': 'sourceCommit',
      '--source-blob-sha': 'sourceBlobSha',
    };
    const key = keyByArg[arg];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    if (!value) throw new Error(`${arg} requires a value`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const required = [
    'sourcePath',
    'outputGeojsonPath',
    'outputMetadataPath',
    'sourceRepository',
    'sourceRepoPath',
    'sourceCommit',
    'sourceBlobSha',
  ];
  for (const key of required) {
    if (!args[key]) throw new Error(`Missing required road-context argument: ${key}`);
  }
  if (args.routeSamplePaths.length === 0) throw new Error('At least one --route-samples path is required');

  const source = await readJson(args.sourcePath);
  const routeDocuments = await Promise.all(args.routeSamplePaths.map(readJson));
  const result = buildRoadContext({
    source,
    routeDocuments,
    sourceIdentity: {
      repository: args.sourceRepository,
      path: args.sourceRepoPath,
      commit: args.sourceCommit,
      blobSha: args.sourceBlobSha,
    },
  });

  await writeJson(args.outputGeojsonPath, result.geojson);
  await writeJson(args.outputMetadataPath, result.metadata);
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
