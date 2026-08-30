import { z } from 'zod';
import type {
  CorridorDefinition,
  EnvironmentSnapshot,
  OperationalRun,
  SanJuanOperationSpec,
  SourceState,
} from './contracts';

const sourceStateSchema = z.enum(['READY', 'STALE', 'PARTIAL', 'UNAVAILABLE']);
const evidenceRoleSchema = z.enum([
  'PRIMARY',
  'DERIVED',
  'CALIBRATION',
  'ANALOGUE',
  'QUALITATIVE',
  'SYNTHETIC_ASSUMPTION',
  'METHOD_REFERENCE',
]);
const geometryEvidenceClassSchema = z.enum([
  'PUBLIC_ROAD',
  'RECONSTRUCTED_ACCESS',
  'APPROXIMATE_APPROACH',
  'PROJECT_LOCATION',
]);
const vehicleTypeSchema = z.enum(['PERSONNEL', 'FIELD', 'LOGISTICS']);
const vehicleDirectionSchema = z.enum(['TO_PROJECT', 'RETURN_TO_BASE']);

const evidenceRefSchema = z.object({
  id: z.string().min(1),
  role: evidenceRoleSchema,
  sourceName: z.string().min(1),
  sourceUrl: z.string().min(1).optional(),
  retrievedAt: z.string().min(1),
  sourceTimestamp: z.string().min(1).optional(),
  method: z.string().min(1).optional(),
  license: z.string().min(1).optional(),
  limitations: z.array(z.string()),
});

const locationRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().finite(),
  lon: z.number().finite(),
});

const projectSchema = locationRefSchema.extend({
  activeOperationalDestination: z.boolean(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
});

const elevationSampleSchema = z.object({
  distanceKm: z.number().nonnegative(),
  elevationM: z.number().finite(),
});

const elevationProfileSchema = z.object({
  source: z.string().min(1),
  resolution: z.string().min(1),
  method: z.string().min(1),
  samples: z.array(elevationSampleSchema).min(2),
  limitations: z.array(z.string()),
});

const routeSampleSchema = z.object({
  distanceKm: z.number().nonnegative(),
  lon: z.number().finite(),
  lat: z.number().finite(),
  elevationM: z.number().finite(),
  segmentId: z.string().min(1),
});

const corridorNodeSchema = locationRefSchema.extend({
  distanceKm: z.number().nonnegative(),
  elevationM: z.number().finite().optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
});

const corridorSegmentSchema = z.object({
  id: z.string().min(1),
  corridorId: z.string().min(1),
  startKm: z.number().nonnegative(),
  endKm: z.number().positive(),
  distanceKm: z.number().positive(),
  elevationMinM: z.number().finite(),
  elevationMaxM: z.number().finite(),
  gradeProxy: z.number().finite().optional(),
  roadClass: z.string().min(1),
  geometryConfidence: geometryEvidenceClassSchema,
  environmentNodeIds: z.array(z.string()),
});

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);
const corridorGeometrySchema = z.union([
  z.object({
    type: z.literal('LineString'),
    coordinates: z.array(coordinateSchema).min(2),
  }),
  z.object({
    type: z.literal('MultiLineString'),
    coordinates: z.array(z.array(coordinateSchema).min(2)).min(1),
  }),
]);

const corridorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  origin: locationRefSchema,
  destination: locationRefSchema,
  geometry: corridorGeometrySchema,
  geometryClass: geometryEvidenceClassSchema,
  segments: z.array(corridorSegmentSchema).min(1),
  nodes: z.array(corridorNodeSchema),
  elevationProfile: elevationProfileSchema,
  routeSamples: z.array(routeSampleSchema).min(2),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  retrievedAt: z.string().min(1),
  limitations: z.array(z.string()),
});

const plannedStopSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['CHECKPOINT', 'REST', 'TRANSFER', 'PROJECT']),
  distanceKm: z.number().nonnegative(),
  dwellMinutes: z.number().nonnegative(),
  synthetic: z.boolean(),
  evidenceRefs: z.array(z.string().min(1)),
});

const vehicleSchema = z.object({
  id: z.string().min(1),
  type: vehicleTypeSchema,
  corridorId: z.string().min(1),
  direction: vehicleDirectionSchema,
  departureTime: z.string().min(1),
  speedProfileId: z.string().min(1),
  plannedStops: z.array(plannedStopSchema),
  synthetic: z.literal(true),
  evidenceRefs: z.array(z.string().min(1)).min(1),
});

const environmentHourSchema = z.object({
  time: z.string().min(1),
  temperatureC: z.number().finite().nullable(),
  precipitationMm: z.number().nonnegative().nullable(),
  snowfallCm: z.number().nonnegative().nullable(),
  windSpeedKmh: z.number().nonnegative().nullable(),
  windGustKmh: z.number().nonnegative().nullable(),
  windDirectionDeg: z.number().min(0).max(360).nullable(),
  visibilityM: z.number().nonnegative().nullable().optional(),
  cloudCoverPct: z.number().min(0).max(100).nullable().optional(),
});

const environmentNodeSchema = locationRefSchema.extend({
  corridorId: z.string().min(1),
  distanceKm: z.number().nonnegative(),
  elevationM: z.number().finite(),
  hourly: z.array(environmentHourSchema).min(1),
});

const environmentSnapshotSchema = z.object({
  schemaVersion: z.string().min(1),
  id: z.string().min(1),
  issuedAt: z.string().min(1),
  dataAsOf: z.string().min(1),
  targetDate: z.string().min(1),
  timezone: z.literal('America/Argentina/San_Juan'),
  provider: z.string().min(1),
  modelKind: z.enum(['FORECAST', 'HISTORICAL_REFERENCE']),
  nodes: z.array(environmentNodeSchema),
  sourceState: sourceStateSchema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string()),
});

const operationalRunSchema = z.object({
  id: z.string().min(1),
  targetDate: z.string().min(1),
  issuedAt: z.string().min(1),
  dataAsOf: z.string().min(1),
  timezone: z.literal('America/Argentina/San_Juan'),
  mode: z.literal('SIMULATED'),
  modelVersion: z.string().min(1),
  scenarioVersion: z.string().min(1),
  environmentSnapshotId: z.string().min(1),
  provenance: z.array(z.string().min(1)),
});

const scheduleSchema = z.object({
  startMinute: z.literal(360),
  endMinute: z.literal(1200),
  defaultPlayback: z.literal(300),
  playbackOptions: z.tuple([z.literal(60), z.literal(120), z.literal(300), z.literal(600)]),
});

const operationSpecSchema = z.object({
  schemaVersion: z.string().min(1),
  scenarioId: z.string().min(1),
  timezone: z.literal('America/Argentina/San_Juan'),
  seed: z.union([z.string(), z.number()]),
  territory: z.object({ projects: z.array(projectSchema) }),
  corridors: z.array(corridorSchema),
  fleet: z.array(vehicleSchema),
  schedule: scheduleSchema,
  calibration: z.object({ evidenceRefs: z.array(z.string().min(1)) }),
  provenance: z.array(evidenceRefSchema),
});

export function parseSourceState(input: unknown): SourceState {
  return sourceStateSchema.parse(input);
}

export function parseOperationalRun(input: unknown): OperationalRun {
  return operationalRunSchema.parse(input) as OperationalRun;
}

export function parseCorridor(input: unknown): CorridorDefinition {
  return corridorSchema.parse(input) as CorridorDefinition;
}

export function parseEnvironmentSnapshot(input: unknown): EnvironmentSnapshot {
  return environmentSnapshotSchema.parse(input) as EnvironmentSnapshot;
}

export function parseOperationSpec(input: unknown): SanJuanOperationSpec {
  return operationSpecSchema.parse(input) as SanJuanOperationSpec;
}
