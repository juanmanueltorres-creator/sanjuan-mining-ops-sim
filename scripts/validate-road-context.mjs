import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SCHEMA_VERSION = 'sanjuan.road-context/v1';
const SUPPORTED_GEOMETRIES = new Set(['LineString', 'MultiLineString']);
const FORBIDDEN_OPERATIONAL_KEYS = new Set([
  'corridorId',
  'distanceKm',
  'segmentId',
  'speedKph',
  'eta',
  'accessAllowed',
  'routeMembership',
]);

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Road-context ${field} must be non-empty`);
  return value.trim();
}

function coordinatePairs(geometry) {
  if (!geometry || typeof geometry !== 'object' || !SUPPORTED_GEOMETRIES.has(geometry.type)) {
    throw new Error(`Road-context geometry must be LineString or MultiLineString`);
  }
  const pairs = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates?.flat();
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('Road-context geometry must contain coordinates');
  return pairs;
}

function validateCoordinatePair(pair) {
  if (!Array.isArray(pair) || pair.length < 2 || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) {
    throw new Error('Road-context coordinate must contain finite lon/lat values');
  }
}

export function validateRoadContextArtifacts(metadata, geojson) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Road-context metadata is required');
  if (metadata.schemaVersion !== REQUIRED_SCHEMA_VERSION) throw new Error(`Invalid road-context schemaVersion: ${metadata.schemaVersion ?? 'missing'}`);

  for (const field of [
    'id',
    'provider',
    'authoringSource',
    'sourceCommit',
    'sourceBlobSha',
    'sourceUrl',
    'licenseUrl',
    'attribution',
    'selectionMethod',
  ]) {
    requireNonEmptyString(metadata[field], field);
  }
  if (!Number.isFinite(metadata.contextPaddingDegrees) || metadata.contextPaddingDegrees < 0) {
    throw new Error('Road-context contextPaddingDegrees must be a non-negative number');
  }
  if (!Number.isInteger(metadata.featureCount) || metadata.featureCount < 0) {
    throw new Error('Road-context featureCount must be a non-negative integer');
  }
  if (!Array.isArray(metadata.limitations) || metadata.limitations.length === 0 || metadata.limitations.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('Road-context limitations must contain non-empty strings');
  }

  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Road-context GeoJSON must be a FeatureCollection');
  }
  if (metadata.featureCount !== geojson.features.length) {
    throw new Error(`Road-context featureCount mismatch: metadata=${metadata.featureCount} geojson=${geojson.features.length}`);
  }

  const ids = new Set();
  for (const feature of geojson.features) {
    if (!feature || feature.type !== 'Feature') throw new Error('Road-context GeoJSON contains a non-Feature entry');
    const properties = feature.properties;
    if (!properties || typeof properties !== 'object') throw new Error('Road-context feature properties are required');

    const id = requireNonEmptyString(properties.id, 'feature id');
    requireNonEmptyString(properties.objectType, 'feature objectType');
    const sourceAgency = requireNonEmptyString(properties.sourceAgency, 'feature sourceAgency');
    if (sourceAgency !== 'IGN') throw new Error(`Road-context sourceAgency must be IGN: ${sourceAgency}`);
    if (properties.roadRef !== null && properties.roadRef !== undefined && typeof properties.roadRef !== 'string') {
      throw new Error('Road-context roadRef must be a string or null');
    }

    if (ids.has(id)) throw new Error(`Duplicate road-context feature id: ${id}`);
    ids.add(id);

    for (const key of Object.keys(properties)) {
      if (FORBIDDEN_OPERATIONAL_KEYS.has(key)) throw new Error(`Forbidden operational road-context property: ${key}`);
    }

    for (const pair of coordinatePairs(feature.geometry)) validateCoordinatePair(pair);
  }

  return { featureCount: geojson.features.length };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function runCli(argv = process.argv.slice(2)) {
  const metadataPath = argv[0] ?? 'public/data/context/roads-context.v1.json';
  const geojsonPath = argv[1] ?? 'public/data/context/roads-context.v1.geojson';
  const [metadata, geojson] = await Promise.all([readJson(metadataPath), readJson(geojsonPath)]);
  const result = validateRoadContextArtifacts(metadata, geojson);
  console.log(`Road context validated: ${result.featureCount} feature(s).`);
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
