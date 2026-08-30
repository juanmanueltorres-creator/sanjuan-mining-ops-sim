import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CORRIDOR_IDS = ['hualilan', 'veladero', 'los-azules'];
const TIMEZONE = 'America/Argentina/San_Juan';
const HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'snowfall',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
];

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args.set(key.slice(2), argv[i + 1]);
    i += 1;
  }
  const targetDate = args.get('target-date');
  const out = args.get('out');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate ?? '')) throw new Error('Expected --target-date YYYY-MM-DD');
  if (!out) throw new Error('Expected --out path');
  return { targetDate, out };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}

function interpolateSample(samples, distanceKm) {
  if (distanceKm <= samples[0].distanceKm) return { ...samples[0], distanceKm };
  if (distanceKm >= samples.at(-1).distanceKm) return { ...samples.at(-1), distanceKm };
  const upperIndex = samples.findIndex((sample) => sample.distanceKm >= distanceKm);
  const a = samples[upperIndex - 1];
  const b = samples[upperIndex];
  const fraction = (distanceKm - a.distanceKm) / (b.distanceKm - a.distanceKm);
  return {
    distanceKm,
    lon: a.lon + (b.lon - a.lon) * fraction,
    lat: a.lat + (b.lat - a.lat) * fraction,
    elevationM: a.elevationM + (b.elevationM - a.elevationM) * fraction,
    segmentId: b.segmentId,
  };
}

async function buildNodes() {
  const nodes = [];
  for (const corridorId of CORRIDOR_IDS) {
    const route = await readJson(`public/data/corridors/${corridorId}/route-samples.v1.json`);
    const samples = route.samples;
    if (!Array.isArray(samples) || samples.length < 2) throw new Error(`${corridorId}: route samples unavailable`);
    const totalDistanceKm = samples.at(-1).distanceKm;
    for (let index = 0; index < 4; index += 1) {
      const distanceKm = index === 3 ? totalDistanceKm : (totalDistanceKm * index) / 3;
      const sample = interpolateSample(samples, distanceKm);
      nodes.push({
        id: `${corridorId}-env-${index + 1}`,
        name: `${corridorId} environment node ${index + 1}`,
        corridorId,
        distanceKm: Number(distanceKm.toFixed(3)),
        lon: Number(sample.lon.toFixed(6)),
        lat: Number(sample.lat.toFixed(6)),
        elevationM: Math.round(sample.elevationM),
      });
    }
  }
  return nodes;
}

function normalizeTime(localTime) {
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(localTime)) return localTime;
  return `${localTime}:00-03:00`;
}

function normalizeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeHourly(hourly) {
  const times = hourly?.time;
  if (!Array.isArray(times) || times.length === 0) throw new Error('Provider payload missing hourly time');
  return times.map((time, index) => ({
    time: normalizeTime(time),
    temperatureC: normalizeNumber(hourly.temperature_2m?.[index]),
    precipitationMm: normalizeNumber(hourly.precipitation?.[index]),
    snowfallCm: normalizeNumber(hourly.snowfall?.[index]),
    windSpeedKmh: normalizeNumber(hourly.wind_speed_10m?.[index]),
    windGustKmh: normalizeNumber(hourly.wind_gusts_10m?.[index]),
    windDirectionDeg: normalizeNumber(hourly.wind_direction_10m?.[index]),
  }));
}

function sourceStateFor(nodes) {
  const rows = nodes.flatMap((node) => node.hourly);
  const required = rows.flatMap((hour) => [
    hour.temperatureC,
    hour.precipitationMm,
    hour.snowfallCm,
    hour.windSpeedKmh,
    hour.windGustKmh,
    hour.windDirectionDeg,
  ]);
  if (required.length === 0 || required.every((value) => value === null)) return 'UNAVAILABLE';
  return required.some((value) => value === null) ? 'PARTIAL' : 'READY';
}

async function fetchProvider(nodes, targetDate) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', nodes.map((node) => node.lat).join(','));
  url.searchParams.set('longitude', nodes.map((node) => node.lon).join(','));
  url.searchParams.set('elevation', nodes.map((node) => node.elevationM).join(','));
  url.searchParams.set('hourly', HOURLY_FIELDS.join(','));
  url.searchParams.set('timezone', TIMEZONE);
  url.searchParams.set('start_date', targetDate);
  url.searchParams.set('end_date', targetDate);
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status}`);
  const payload = await response.json();
  const locations = Array.isArray(payload) ? payload : [payload];
  if (locations.length !== nodes.length) throw new Error(`Expected ${nodes.length} provider locations, found ${locations.length}`);
  return { url, locations };
}

const { targetDate, out } = parseArgs(process.argv.slice(2));
const nodeDefinitions = await buildNodes();
const { url, locations } = await fetchProvider(nodeDefinitions, targetDate);
const builtAt = new Date().toISOString();
const nodes = nodeDefinitions.map((node, index) => ({ ...node, hourly: normalizeHourly(locations[index].hourly) }));
const compactDate = targetDate.replaceAll('-', '');
const snapshot = {
  schemaVersion: 'sanjuan.environment/v1',
  id: `environment-sj-${compactDate}-v1`,
  issuedAt: builtAt,
  dataAsOf: builtAt,
  targetDate,
  timezone: TIMEZONE,
  provider: 'Open-Meteo Forecast API · Best Match',
  modelKind: 'FORECAST',
  nodes,
  sourceState: sourceStateFor(nodes),
  evidenceRefs: [`open-meteo-forecast-${compactDate}`],
  limitations: [
    'Modelled forecast context, not an in-situ station observation.',
    'The generic forecast response does not expose a single model-run timestamp; dataAsOf records snapshot retrieval time.',
    'Weather values do not imply road condition, transitability, authorization or operational safety.',
    'Environment nodes are route-tied analytical samples interpolated from the versioned corridor geometry/elevation assets.',
    `Build request: ${url.origin}${url.pathname} with ${nodes.length} coordinates and hourly weather variables.`,
  ],
};

if (snapshot.sourceState === 'UNAVAILABLE') throw new Error('Environment build produced no usable weather values');
await mkdir(path.dirname(path.resolve(out)), { recursive: true });
await writeFile(path.resolve(out), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Built ${snapshot.id}: ${nodes.length} nodes, sourceState=${snapshot.sourceState}`);
