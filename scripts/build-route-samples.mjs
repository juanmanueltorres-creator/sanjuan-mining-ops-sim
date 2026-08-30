import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const corridorId = process.argv[2];
if (!corridorId) {
  throw new Error('usage: node scripts/build-route-samples.mjs <corridor-id>');
}

const root = process.cwd();
const base = path.join(root, 'public', 'data', 'corridors', corridorId);
const readJson = async (name) => JSON.parse(await readFile(path.join(base, name), 'utf8'));

const [feature, profile, metadata] = await Promise.all([
  readJson('corridor.v1.geojson'),
  readJson('profile.v1.json'),
  readJson('metadata.v1.json'),
]);

if (feature?.geometry?.type !== 'LineString') {
  throw new Error(`${corridorId}: route sample builder currently requires LineString geometry`);
}

const coordinates = feature.geometry.coordinates;
const elevations = profile.samples;
if (!Array.isArray(coordinates) || coordinates.length !== elevations.length) {
  throw new Error(`${corridorId}: geometry coordinate count must match elevation anchor count`);
}

const segments = [...metadata.segments].sort((a, b) => a.startKm - b.startKm);
const totalDistanceKm = metadata.totalDistanceKm;

function segmentAt(distanceKm) {
  const segment = segments.find((candidate, index) => (
    distanceKm >= candidate.startKm
    && (distanceKm < candidate.endKm || (index === segments.length - 1 && distanceKm <= candidate.endKm))
  ));
  if (!segment) throw new Error(`${corridorId}: no segment covers ${distanceKm} km`);
  return segment;
}

const samples = elevations.map((sample, index) => {
  const coordinate = coordinates[index];
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    throw new Error(`${corridorId}: invalid coordinate at index ${index}`);
  }
  return {
    distanceKm: sample.distanceKm,
    lon: coordinate[0],
    lat: coordinate[1],
    elevationM: sample.elevationM,
    segmentId: segmentAt(sample.distanceKm).id,
  };
});

if (samples[0]?.distanceKm !== 0) throw new Error(`${corridorId}: route must start at 0 km`);
for (let i = 1; i < samples.length; i += 1) {
  if (samples[i].distanceKm <= samples[i - 1].distanceKm) {
    throw new Error(`${corridorId}: route distances must increase`);
  }
}
if (Math.abs(samples.at(-1).distanceKm - totalDistanceKm) > 1e-6) {
  throw new Error(`${corridorId}: final route sample must equal total distance`);
}

const output = {
  schemaVersion: 'sanjuan.route-samples/v1',
  corridorId,
  samples,
};

await writeFile(path.join(base, 'route-samples.v1.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Built ${corridorId}: ${samples.length} route samples / ${totalDistanceKm} km`);
