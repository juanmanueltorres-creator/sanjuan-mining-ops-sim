import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BUFFER_DEGREES = 0.25;
const SUPPORTED_GEOMETRY_TYPES = new Set(['LineString', 'MultiLineString']);

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

export function normalizeRoadProperties(properties = {}) {
  const sourceClass = firstNonEmptyString(properties.objeto, properties.tipo, properties.clase) ?? 'Road context';
  const sourceLabel = firstNonEmptyString(
    properties.nomencla,
    properties.nomenclatura,
    properties.nombre,
    properties.name,
    properties.ruta,
  );

  return {
    sourceClass,
    sourceLabel,
  };
}

function hasIgnSignature(properties = {}) {
  return [properties.sag, properties.fdc, properties.fuente, properties.source]
    .some((value) => typeof value === 'string' && /(^|\b)IGN(\b|$)/i.test(value));
}

export function validateIgnSource(source) {
  if (!source || source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('IGN road-context source must be a GeoJSON FeatureCollection');
  }
  if (source.features.length === 0) throw new Error('IGN road-context source must contain features');
  if (!source.features.some((feature) => hasIgnSignature(feature?.properties))) {
    throw new Error('Road-context source does not contain an IGN provenance signature');
  }

  for (const feature of source.features) {
    if (!feature || feature.type !== 'Feature') throw new Error('IGN road-context source contains a non-Feature entry');
    collectGeometryCoordinates(feature.geometry);
  }

  return source;
}

function stableFeatureKey(feature) {
  const properties = normalizeRoadProperties(feature.properties);
  return [
    properties.sourceLabel ?? '',
    properties.sourceClass,
    JSON.stringify(feature.geometry.coordinates),
  ].join('\u0000');
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
    .sort((left, right) => stableFeatureKey(left).localeCompare(stableFeatureKey(right)))
    .map((feature, index) => ({
      type: 'Feature',
      id: `ign-road-context-${String(index + 1).padStart(4, '0')}`,
      properties: normalizeRoadProperties(feature.properties),
      // Preserve source coordinates exactly. Context selection is feature-level;
      // V0.1.1 does not clip, simplify, snap or otherwise mutate geometry.
      geometry: feature.geometry,
    }));

  const geojson = {
    type: 'FeatureCollection',
    features: selected,
  };

  const metadata = {
    schemaVersion: 'sanjuan.road-context/v1',
    purpose: 'CARTOGRAPHIC_REFERENCE',
    source: sourceRef,
    operationalBounds: bounds,
    transformation: {
      selectionMethod: 'feature-bbox-intersects-expanded-operational-bbox',
      bufferDegrees: DEFAULT_BUFFER_DEGREES,
      geometryMutation: 'none',
      propertyNormalization: ['sourceClass', 'sourceLabel'],
    },
    featureCount: selected.length,
    limitations: [
      'Cartographic reference only; this layer is not used for routing, snapping, ETA, dispatch or vehicle motion.',
      'Published geometry does not establish current road condition, closure, transitability, access authorization or safety.',
      'The historical Geo_Platform authoring snapshot does not record its exact original IGN acquisition endpoint.',
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
