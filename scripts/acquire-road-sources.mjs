import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CKAN_RESOURCE = 'https://datos.gob.ar/api/3/action/resource_show?id=';
export const CKAN_PACKAGE = 'https://datos.gob.ar/api/3/action/package_show?id=';
export const OFFICIAL_RESOURCES = [
  {
    id: 'dnv-rutas-nacionales-20260830',
    datasetId: 'transporte-rutas-nacionales',
    resourceId: 'd58b91ee-c46a-4260-8d89-69438417d73b',
    provider: 'Dirección Nacional de Vialidad / Datos Argentina',
    name: 'Rutas Nacionales Archivo "Shape" de rutas nacionales. Fuente: Dirección Nacional de Vialidad.',
    format: 'wfs',
    url: 'https://wms.ign.gob.ar/geoserver/transporte/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=transporte:vial_nacional',
    catalogUrl: 'https://datos.transporte.gob.ar/dataset/rutas-nacionales/archivo/d58b91ee-c46a-4260-8d89-69438417d73b',
  },
  {
    id: 'ign-rutas-provinciales-2016-20260830',
    datasetId: 'transporte-rutas-provinciales',
    resourceId: '903edc8b-da5b-4f3e-b555-eef41b89c3f3',
    provider: 'Instituto Geográfico Nacional / Datos Argentina',
    name: 'Rutas Provinciales Archivo "GeoJSON" de rutas Provinciales. Instituto Geográfico Nacional.',
    format: 'wfs',
    url: 'https://wms.ign.gob.ar/geoserver/transporte/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=transporte:vial_provincial',
    catalogUrl: 'https://datos.transporte.gob.ar/dataset/rutas-provinciales/archivo/903edc8b-da5b-4f3e-b555-eef41b89c3f3',
  },
];
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
export const VELADERO_REGIONAL_BBOX = [-69.5, -31.8, -68.3, -29.9];
export const VELADERO_HIGH_MOUNTAIN_BBOX = [-70.1, -30.25, -69.2, -29.25];

function asRecord(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label}: expected object`);
  return input;
}

function assertCoordinate(coordinate, label) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error(`${label}: coordinate must contain lon/lat`);
  const [lon, lat] = coordinate;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`${label}: invalid coordinate`);
  }
}

function validateLineCoordinates(coordinates, label) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error(`${label}: geometry requires at least two coordinates`);
  coordinates.forEach((coordinate, index) => assertCoordinate(coordinate, `${label} coordinate ${index}`));
}

function normalizeGeometry(geometry, label) {
  const record = asRecord(geometry, `${label} geometry`);
  if (record.type === 'LineString') {
    validateLineCoordinates(record.coordinates, label);
    return { type: 'LineString', coordinates: record.coordinates.map(([lon, lat]) => [lon, lat]) };
  }
  if (record.type === 'MultiLineString') {
    if (!Array.isArray(record.coordinates) || record.coordinates.length === 0) throw new Error(`${label}: MultiLineString requires lines`);
    const coordinates = record.coordinates.map((line, index) => {
      validateLineCoordinates(line, `${label} line ${index}`);
      return line.map(([lon, lat]) => [lon, lat]);
    });
    return { type: 'MultiLineString', coordinates };
  }
  throw new Error(`${label}: unsupported geometry type ${String(record.type)}`);
}

function sourceFeatureId(feature, index) {
  const properties = feature.properties && typeof feature.properties === 'object' && !Array.isArray(feature.properties)
    ? feature.properties
    : {};
  const value = feature.id ?? properties.sourceFeatureId ?? properties.id ?? properties.gid ?? properties.fid ?? properties.objectid ?? properties.OBJECTID;
  if (value === undefined || value === null || String(value).length === 0) {
    throw new Error(`WFS feature ${index}: stable source feature id required`);
  }
  return String(value);
}

function geometryCoordinates(geometry) {
  return geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat();
}

function assertBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    throw new Error('Acquisition bbox must be [minLon,minLat,maxLon,maxLat]');
  }
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (minLon >= maxLon || minLat >= maxLat || minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
    throw new Error('Acquisition bbox is invalid');
  }
}

function intersectsBbox(geometry, bbox) {
  const coordinates = geometryCoordinates(geometry);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const [clipMinLon, clipMinLat, clipMaxLon, clipMaxLat] = bbox;
  return maxLon >= clipMinLon && minLon <= clipMaxLon && maxLat >= clipMinLat && minLat <= clipMaxLat;
}

async function readJsonResponse(response, label) {
  if (!response?.ok) throw new Error(`${label}: request failed${response?.status ? ` (${response.status})` : ''}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function writeJson(targetPath, value) {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function inventoryOfficialSource(result, generatedAt) {
  const featureIds = result.featureCollection.features.map((feature) => String(feature.id));
  return {
    id: result.source.id,
    provider: result.source.provider,
    resourceId: result.source.resourceId,
    resourceName: result.source.name,
    sourceUrl: result.source.url,
    requestUrl: result.requestUrl,
    format: result.source.format,
    retrievedAt: generatedAt,
    featureCount: featureIds.length,
    featureIds,
  };
}

export function normalizeWfsFeatureCollection(input) {
  const document = asRecord(input, 'WFS response');
  if (document.type !== 'FeatureCollection' || !Array.isArray(document.features)) {
    throw new Error('WFS response must be a GeoJSON FeatureCollection');
  }

  return {
    type: 'FeatureCollection',
    features: document.features.map((rawFeature, index) => {
      const feature = asRecord(rawFeature, `WFS feature ${index}`);
      if (feature.type !== 'Feature') throw new Error(`WFS feature ${index}: expected GeoJSON Feature`);
      const id = sourceFeatureId(feature, index);
      const properties = feature.properties && typeof feature.properties === 'object' && !Array.isArray(feature.properties)
        ? { ...feature.properties }
        : {};
      return {
        type: 'Feature',
        id,
        properties: { ...properties, sourceFeatureId: id },
        geometry: normalizeGeometry(feature.geometry, `WFS feature ${id}`),
      };
    }),
  };
}

export function normalizeOverpassWays(input) {
  const document = asRecord(input, 'Overpass response');
  if (!Array.isArray(document.elements)) throw new Error('Overpass response elements must be an array');

  const features = [];
  for (const elementRaw of document.elements) {
    const element = asRecord(elementRaw, 'Overpass element');
    if (element.type !== 'way') continue;
    if (!Number.isInteger(element.id) && typeof element.id !== 'string') throw new Error('Overpass way id required');
    if (!Array.isArray(element.geometry) || element.geometry.length < 2) {
      throw new Error(`Overpass way ${element.id}: geometry requires at least two coordinates`);
    }
    const coordinates = element.geometry.map((pointRaw, index) => {
      const point = asRecord(pointRaw, `Overpass way ${element.id} point ${index}`);
      const coordinate = [point.lon, point.lat];
      assertCoordinate(coordinate, `Overpass way ${element.id} point ${index}`);
      return coordinate;
    });
    const tags = element.tags && typeof element.tags === 'object' && !Array.isArray(element.tags) ? element.tags : {};
    features.push({
      type: 'Feature',
      id: `osm-way-${element.id}`,
      properties: { ...tags, osmWayId: element.id, sourceFeatureId: `osm-way-${element.id}` },
      geometry: { type: 'LineString', coordinates },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function clipFeatureCollectionToBbox(input, bbox) {
  assertBbox(bbox);
  const normalized = normalizeWfsFeatureCollection(input);
  return {
    type: 'FeatureCollection',
    features: normalized.features.filter((feature) => intersectsBbox(feature.geometry, bbox)),
  };
}

export function normalizeWfsUrl(url, bbox) {
  assertBbox(bbox);
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower === 'outputformat' || lower === 'maxfeatures' || lower === 'bbox') parsed.searchParams.delete(key);
  }
  parsed.searchParams.set('outputFormat', 'application/json');
  parsed.searchParams.set('maxFeatures', '10000');
  parsed.searchParams.set('bbox', `${bbox.join(',')},EPSG:4326`);
  return parsed.toString();
}

function resolvedResource(descriptor, result, label) {
  const record = asRecord(result, label);
  if (typeof record.url !== 'string' || record.url.length === 0) throw new Error(`${label}: source URL required`);
  return {
    ...descriptor,
    resourceId: typeof record.id === 'string' && record.id.length > 0 ? record.id : descriptor.resourceId,
    name: typeof record.name === 'string' ? record.name : descriptor.id,
    format: typeof record.format === 'string' ? record.format : '',
    url: record.url,
    lastModified: typeof record.last_modified === 'string' ? record.last_modified : undefined,
  };
}

function selectDatasetGeoJsonResource(resources, descriptor) {
  if (!Array.isArray(resources)) throw new Error(`CKAN dataset ${descriptor.datasetId}: resources array required`);
  const records = resources.filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  const preferred = records.find((candidate) => candidate.id === descriptor.resourceId && typeof candidate.url === 'string');
  if (preferred) return preferred;
  const geojson = records.find((candidate) => {
    const format = typeof candidate.format === 'string' ? candidate.format.toLowerCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';
    return typeof candidate.url === 'string' && candidate.url.length > 0 && (format.includes('geojson') || name.includes('geojson'));
  });
  if (!geojson) throw new Error(`CKAN dataset ${descriptor.datasetId}: GeoJSON resource required`);
  return geojson;
}

export async function resolveCkanResource(resource, fetcher = fetch) {
  const descriptor = asRecord(resource, 'Official resource descriptor');
  const hasDirectUrl = typeof descriptor.url === 'string' && descriptor.url.length > 0;
  if (hasDirectUrl) {
    if (typeof descriptor.format !== 'string' || descriptor.format.length === 0) {
      throw new Error('Direct official resource format required');
    }
    return {
      ...descriptor,
      name: typeof descriptor.name === 'string' && descriptor.name.length > 0 ? descriptor.name : descriptor.id,
    };
  }

  const hasResourceId = typeof descriptor.resourceId === 'string' && descriptor.resourceId.length > 0;
  const hasDatasetId = typeof descriptor.datasetId === 'string' && descriptor.datasetId.length > 0;
  if (!hasResourceId && !hasDatasetId) throw new Error('Official resource id or dataset id required');

  if (hasResourceId) {
    const response = await fetcher(`${CKAN_RESOURCE}${descriptor.resourceId}`);
    if (response?.ok) {
      const raw = await readJsonResponse(response, `CKAN resource ${descriptor.resourceId}`);
      const document = asRecord(raw, `CKAN resource ${descriptor.resourceId}`);
      if (document.success !== true) throw new Error(`CKAN resource ${descriptor.resourceId}: API reported failure`);
      return resolvedResource(descriptor, document.result, `CKAN resource ${descriptor.resourceId}`);
    }
    if (!hasDatasetId) {
      throw new Error(`CKAN resource ${descriptor.resourceId}: request failed${response?.status ? ` (${response.status})` : ''}`);
    }
  }

  const raw = await readJsonResponse(
    await fetcher(`${CKAN_PACKAGE}${descriptor.datasetId}`),
    `CKAN dataset ${descriptor.datasetId}`,
  );
  const document = asRecord(raw, `CKAN dataset ${descriptor.datasetId}`);
  if (document.success !== true) throw new Error(`CKAN dataset ${descriptor.datasetId}: API reported failure`);
  const result = asRecord(document.result, `CKAN dataset ${descriptor.datasetId} result`);
  const selected = selectDatasetGeoJsonResource(result.resources, descriptor);
  return resolvedResource(descriptor, selected, `CKAN dataset ${descriptor.datasetId} GeoJSON resource`);
}

export async function fetchOfficialRoadSource(resource, bbox, fetcher = fetch) {
  assertBbox(bbox);
  const source = await resolveCkanResource(resource, fetcher);
  const format = source.format.toLowerCase();
  const isWfs = format.includes('wfs') || /(?:\?|&)service=wfs(?:&|$)/i.test(source.url) || /\/wfs(?:\?|$)/i.test(source.url);
  const isGeoJson = format.includes('geojson') || /\.geojson(?:\?|$)/i.test(source.url);
  if (!isWfs && !isGeoJson) {
    throw new Error(`Official resource ${source.id}: expected WFS or GeoJSON source, found format ${source.format || 'unknown'}`);
  }
  const requestUrl = isWfs ? normalizeWfsUrl(source.url, bbox) : source.url;
  const raw = await readJsonResponse(await fetcher(requestUrl), `Official road source ${source.id}`);
  const normalized = normalizeWfsFeatureCollection(raw);
  const featureCollection = clipFeatureCollectionToBbox(normalized, bbox);
  if (featureCollection.features.length === 0) throw new Error(`Official road source ${source.id}: no features intersect acquisition bbox`);
  return { source, requestUrl, featureCollection };
}

export function buildOverpassQuery(bbox) {
  assertBbox(bbox);
  const [west, south, east, north] = bbox;
  return `[out:json][timeout:120];\nway["highway"](${south},${west},${north},${east});\nout tags geom;`;
}

export async function fetchOverpassRoadSource(bbox, fetcher = fetch, endpoints = OVERPASS_ENDPOINTS) {
  assertBbox(bbox);
  if (!Array.isArray(endpoints) || endpoints.length === 0) throw new Error('At least one Overpass endpoint is required');
  const query = buildOverpassQuery(bbox);
  const body = new URLSearchParams({ data: query }).toString();
  const failures = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
      if (!response?.ok) {
        failures.push(`${endpoint}: HTTP ${response?.status ?? 'error'}`);
        continue;
      }
      const raw = await response.json();
      const normalized = normalizeOverpassWays(raw);
      const featureCollection = clipFeatureCollectionToBbox(normalized, bbox);
      if (featureCollection.features.length === 0) {
        failures.push(`${endpoint}: no highway ways in acquisition bbox`);
        continue;
      }
      return { endpoint, query, featureCollection };
    } catch (error) {
      failures.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Overpass acquisition failed: ${failures.join('; ')}`);
}

export async function acquireVeladeroSources({
  fetcher = fetch,
  outputDir = path.join('artifacts', 'road-geometry-acquisition'),
  overpassEndpoints = OVERPASS_ENDPOINTS,
  now = () => new Date().toISOString(),
} = {}) {
  const generatedAt = now();
  if (typeof generatedAt !== 'string' || generatedAt.length === 0) throw new Error('Acquisition timestamp required');

  const officialResults = [];
  for (const resource of OFFICIAL_RESOURCES) {
    officialResults.push(await fetchOfficialRoadSource(resource, VELADERO_REGIONAL_BBOX, fetcher));
  }
  const osmResult = await fetchOverpassRoadSource(VELADERO_HIGH_MOUNTAIN_BBOX, fetcher, overpassEndpoints);

  await mkdir(outputDir, { recursive: true });
  const snapshots = {
    'dnv-national-roads.v1.geojson': officialResults[0].featureCollection,
    'ign-provincial-roads.v1.geojson': officialResults[1].featureCollection,
    'osm-high-mountain-access.v1.geojson': osmResult.featureCollection,
  };
  for (const [fileName, document] of Object.entries(snapshots)) {
    await writeJson(path.join(outputDir, fileName), document);
  }

  const osmFeatureIds = osmResult.featureCollection.features.map((feature) => String(feature.id));
  const inventory = {
    schemaVersion: 'sanjuan.road-source-inventory/v1',
    corridorId: 'veladero',
    generatedAt,
    acquisitionBboxes: {
      regional: [...VELADERO_REGIONAL_BBOX],
      highMountain: [...VELADERO_HIGH_MOUNTAIN_BBOX],
    },
    sources: [
      ...officialResults.map((result) => inventoryOfficialSource(result, generatedAt)),
      {
        id: 'osm-high-mountain-access-20260830',
        provider: 'OpenStreetMap via Overpass API',
        sourceUrl: osmResult.endpoint,
        format: 'OSM',
        role: 'FALLBACK',
        license: 'ODbL 1.0',
        attribution: '© OpenStreetMap contributors',
        retrievedAt: generatedAt,
        query: osmResult.query,
        featureCount: osmFeatureIds.length,
        featureIds: osmFeatureIds,
      },
    ],
  };
  await writeJson(path.join(outputDir, 'source-inventory.json'), inventory);

  return { inventory, outputDir, snapshots };
}

export async function runRoadSourceAcquisitionCli(
  args = process.argv.slice(2),
  {
    acquire = acquireVeladeroSources,
    outputDir = path.join('artifacts', 'road-geometry-acquisition'),
  } = {},
) {
  const [corridorId] = args;
  if (corridorId !== 'veladero') {
    throw new Error('Road source acquisition currently supports only Veladero.');
  }
  return acquire({ outputDir });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runRoadSourceAcquisitionCli()
    .then(({ inventory, outputDir }) => {
      console.log(`Veladero road source acquisition written to ${outputDir}`);
      for (const source of inventory.sources) {
        console.log(`${source.id}: ${source.featureCount} features`);
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
