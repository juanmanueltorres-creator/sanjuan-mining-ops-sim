export const CKAN_RESOURCE = 'https://datos.gob.ar/api/3/action/resource_show?id=';
export const OFFICIAL_RESOURCES = [
  {
    id: 'dnv-rutas-nacionales-20260830',
    resourceId: '98a9ee1b-321d-4b68-b00e-bf44ae448e2c',
    provider: 'Dirección Nacional de Vialidad / Datos Argentina',
  },
  {
    id: 'ign-rutas-provinciales-2016-20260830',
    resourceId: '903edc8b-da5b-4f3e-b555-eef41b89c3f3',
    provider: 'Instituto Geográfico Nacional / Datos Argentina',
  },
];

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

export async function resolveCkanResource(resource) {
  return { ...resource };
}

export async function fetchOfficialRoadSource(resource) {
  return { source: resource, featureCollection: { type: 'FeatureCollection', features: [] } };
}

export function buildOverpassQuery() {
  return '';
}

export async function fetchOverpassRoadSource() {
  return { endpoint: null, featureCollection: { type: 'FeatureCollection', features: [] } };
}
