import type { JsonFetcher } from './loadOperation';

export type RoadContextCoordinate = [number, number];

export interface RoadContextLineString {
  type: 'LineString';
  coordinates: RoadContextCoordinate[];
}

export interface RoadContextMultiLineString {
  type: 'MultiLineString';
  coordinates: RoadContextCoordinate[][];
}

export type RoadContextGeometry = RoadContextLineString | RoadContextMultiLineString;

export interface RoadContextFeature {
  type: 'Feature';
  properties: {
    id: string;
    objectType: string;
    roadRef: string | null;
    sourceAgency: string;
  };
  geometry: RoadContextGeometry;
}

export interface RoadContextMetadata {
  schemaVersion: 'sanjuan.road-context/v1';
  id: string;
  provider: string;
  authoringSource: string;
  sourceCommit: string;
  sourceBlobSha: string;
  sourceUrl: string;
  licenseUrl: string;
  attribution: string;
  selectionMethod: string;
  contextPaddingDegrees: number;
  featureCount: number;
  limitations: string[];
}

export interface RoadContextData {
  metadata: RoadContextMetadata;
  features: RoadContextFeature[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function asFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function parseCoordinate(value: unknown, label: string): RoadContextCoordinate {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} coordinate must be a lon/lat pair`);
  }
  const lon = asFiniteNumber(value[0], `${label} longitude`);
  const lat = asFiniteNumber(value[1], `${label} latitude`);
  return [lon, lat];
}

function parseGeometry(value: unknown, label: string): RoadContextGeometry {
  const geometry = asRecord(value, `${label} geometry`);

  if (geometry.type === 'LineString') {
    const coordinates = asArray(geometry.coordinates, `${label} LineString coordinates`)
      .map((coordinate, index) => parseCoordinate(coordinate, `${label} coordinate ${index}`));
    if (coordinates.length < 2) throw new Error(`${label} geometry requires at least two coordinates`);
    return { type: 'LineString', coordinates };
  }

  if (geometry.type === 'MultiLineString') {
    const coordinates = asArray(geometry.coordinates, `${label} MultiLineString coordinates`)
      .map((part, partIndex) => {
        const parsed = asArray(part, `${label} part ${partIndex}`)
          .map((coordinate, index) => parseCoordinate(coordinate, `${label} part ${partIndex} coordinate ${index}`));
        if (parsed.length < 2) throw new Error(`${label} geometry part ${partIndex} requires at least two coordinates`);
        return parsed;
      });
    if (coordinates.length === 0) throw new Error(`${label} geometry requires at least one part`);
    return { type: 'MultiLineString', coordinates };
  }

  throw new Error(`${label} geometry type must be LineString or MultiLineString`);
}

function parseFeature(value: unknown, index: number): RoadContextFeature {
  const feature = asRecord(value, `road context feature ${index}`);
  if (feature.type !== 'Feature') throw new Error(`road context feature ${index} must be a Feature`);

  const properties = asRecord(feature.properties, `road context feature ${index} properties`);
  const id = asNonEmptyString(properties.id, `road context feature ${index} id`);
  const objectType = asNonEmptyString(properties.objectType, `road context feature ${index} objectType`);
  const sourceAgency = asNonEmptyString(properties.sourceAgency, `road context feature ${index} sourceAgency`);
  if (sourceAgency !== 'IGN') throw new Error(`road context feature ${index} sourceAgency must be IGN`);

  const roadRef = properties.roadRef == null
    ? null
    : asNonEmptyString(properties.roadRef, `road context feature ${index} roadRef`);

  return {
    type: 'Feature',
    properties: { id, objectType, roadRef, sourceAgency },
    geometry: parseGeometry(feature.geometry, `road context feature ${index}`),
  };
}

function parseMetadata(value: unknown): RoadContextMetadata {
  const metadata = asRecord(value, 'road context metadata');
  if (metadata.schemaVersion !== 'sanjuan.road-context/v1') {
    throw new Error('road context metadata schemaVersion must be sanjuan.road-context/v1');
  }

  const limitations = asArray(metadata.limitations, 'road context metadata limitations')
    .map((entry, index) => asNonEmptyString(entry, `road context metadata limitation ${index}`));
  if (limitations.length === 0) throw new Error('road context metadata limitations must not be empty');

  return {
    schemaVersion: 'sanjuan.road-context/v1',
    id: asNonEmptyString(metadata.id, 'road context metadata id'),
    provider: asNonEmptyString(metadata.provider, 'road context metadata provider'),
    authoringSource: asNonEmptyString(metadata.authoringSource, 'road context metadata authoringSource'),
    sourceCommit: asNonEmptyString(metadata.sourceCommit, 'road context metadata sourceCommit'),
    sourceBlobSha: asNonEmptyString(metadata.sourceBlobSha, 'road context metadata sourceBlobSha'),
    sourceUrl: asNonEmptyString(metadata.sourceUrl, 'road context metadata sourceUrl'),
    licenseUrl: asNonEmptyString(metadata.licenseUrl, 'road context metadata licenseUrl'),
    attribution: asNonEmptyString(metadata.attribution, 'road context metadata attribution'),
    selectionMethod: asNonEmptyString(metadata.selectionMethod, 'road context metadata selectionMethod'),
    contextPaddingDegrees: asFiniteNumber(metadata.contextPaddingDegrees, 'road context metadata contextPaddingDegrees'),
    featureCount: asNonNegativeInteger(metadata.featureCount, 'road context metadata featureCount'),
    limitations,
  };
}

function parseFeatureCollection(value: unknown): RoadContextFeature[] {
  const collection = asRecord(value, 'road context GeoJSON');
  if (collection.type !== 'FeatureCollection') {
    throw new Error('road context GeoJSON must be a FeatureCollection');
  }
  return asArray(collection.features, 'road context GeoJSON features').map(parseFeature);
}

async function fetchJson(fetcher: JsonFetcher, url: string): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

export async function loadRoadContext(fetcher: JsonFetcher): Promise<RoadContextData> {
  const [metadataRaw, geojsonRaw] = await Promise.all([
    fetchJson(fetcher, '/data/context/roads-context.v1.json'),
    fetchJson(fetcher, '/data/context/roads-context.v1.geojson'),
  ]);

  const metadata = parseMetadata(metadataRaw);
  const features = parseFeatureCollection(geojsonRaw);
  if (metadata.featureCount !== features.length) {
    throw new Error(`road context metadata featureCount ${metadata.featureCount} does not match GeoJSON feature count ${features.length}`);
  }

  return { metadata, features };
}
