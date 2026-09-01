import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BUFFER_DEGREES = 0.25;
const SUPPORTED_GEOMETRY_TYPES = new Set(['LineString', 'MultiLineString']);
const IGN_PROVIDER = 'Instituto Geográfico Nacional de la República Argentina';
const IGN_SOURCE_URL = 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG';
const IGN_LICENSE_URL = 'https://www.ign.gob.ar/descargas/tyc1.html';
const IGN_ATTRIBUTION = 'FUENTE: Instituto Geográfico Nacional de la República Argentina';
const AUTHORING_SOURCE = {
  repository: 'juanmanueltorres-creator/Geo_Platform',
  path: 'web/public/data/san_juan_rutas.geojson',
  commit: 'a4812d053f4f381b9d3e1d5ff30abb9fed7d6772',
  blobSha: '1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70',
};
const ROUTE_SAMPLE_PATHS = [
  'public/data/corridors/hualilan/route-samples.v1.json',
  'public/data/corridors/veladero/route-samples.v2.json',
  'public/data/corridors/los-azules/route-samples.v1.json',
];
const OUTPUT_GEOJSON_PATH = 'public/data/context/roads-context.v1.geojson';
const OUTPUT_METADATA_PATH = 'public/data/context/roads-context.v1.json';

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
    geometry: feature.geometry,
  };
}

export function validateIgnSource(source) {
  if (!source || source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('IGN road-context source must be a GeoJSON FeatureCollection');
  }
  if (source.features.length === 0) throw new Error('IGN road-context source must contain features');

  for (const feature of source.features) normalizeRoadFeature(feature);
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

export function resolveRoadContextCli(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== '--input') {
    const unknown = Array.isArray(argv) && argv.length > 0 && argv[0] !== '--input' ? ` Unknown argument: ${argv[0]}.` : '';
    throw new Error(`Road-context builder requires exactly: --input <san_juan_rutas.geojson>.${unknown}`);
  }
  const sourcePath = argv[1];
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('--input requires a path');

  return {
    sourcePath: sourcePath.trim(),
    routeSamplePaths: [...ROUTE_SAMPLE_PATHS],
    outputGeojsonPath: OUTPUT_GEOJSON_PATH,
    outputMetadataPath: OUTPUT_METADATA_PATH,
    sourceIdentity: { ...AUTHORING_SOURCE },
    provenance: {
      sourceUrl: IGN_SOURCE_URL,
      licenseUrl: IGN_LICENSE_URL,
      attribution: IGN_ATTRIBUTION,
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

export async function runCli(argv = process.argv.slice(2)) {
  const config = resolveRoadContextCli(argv);
  const source = await readJson(config.sourcePath);
  const routeDocuments = await Promise.all(config.routeSamplePaths.map(readJson));
  const result = buildRoadContext({
    source,
    routeDocuments,
    sourceIdentity: config.sourceIdentity,
  });

  await writeJson(config.outputGeojsonPath, result.geojson);
  await writeJson(config.outputMetadataPath, result.metadata);
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
