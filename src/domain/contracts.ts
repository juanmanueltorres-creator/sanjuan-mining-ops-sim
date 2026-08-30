export type SourceState = 'READY' | 'STALE' | 'PARTIAL' | 'UNAVAILABLE';
export type EvidenceRole =
  | 'PRIMARY'
  | 'DERIVED'
  | 'CALIBRATION'
  | 'ANALOGUE'
  | 'QUALITATIVE'
  | 'SYNTHETIC_ASSUMPTION'
  | 'METHOD_REFERENCE';
export type GeometryEvidenceClass =
  | 'PUBLIC_ROAD'
  | 'RECONSTRUCTED_ACCESS'
  | 'APPROXIMATE_APPROACH'
  | 'PROJECT_LOCATION';
export type GeometrySourceRole = 'PRIMARY' | 'CORROBORATION' | 'FALLBACK';
export type GeometrySourceFormat = 'GeoJSON' | 'Shapefile' | 'WMS' | 'OSM';
export type VehicleType = 'PERSONNEL' | 'FIELD' | 'LOGISTICS';
export type VehicleState = 'AT_BASE' | 'EN_ROUTE' | 'AT_STOP' | 'AT_PROJECT' | 'RETURNING' | 'DONE';
export type VehicleDirection = 'TO_PROJECT' | 'RETURN_TO_BASE';
export type ContextSeverity = 'INFO' | 'ATTENTION';
export type EnvironmentModelKind = 'FORECAST' | 'HISTORICAL_REFERENCE';
export type ContextSignalType =
  | 'HIGH_ELEVATION'
  | 'STRONG_GUST'
  | 'FREEZING_TEMPERATURE'
  | 'PRECIPITATION_SIGNAL'
  | 'LONG_TRAVEL_WINDOW'
  | 'HIGH_BACKGROUND_TRAFFIC';
export type OperationalEventType =
  | 'DEPART_BASE'
  | 'ENTER_CORRIDOR'
  | 'PASS_NODE'
  | 'ARRIVE_PROJECT'
  | 'DEPART_PROJECT'
  | 'ENTER_RETURN'
  | 'ARRIVE_BASE';

export interface EvidenceRef {
  id: string;
  role: EvidenceRole;
  sourceName: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceTimestamp?: string;
  method?: string;
  license?: string;
  limitations: string[];
}

export interface GeometrySourceRecord {
  id: string;
  provider: string;
  datasetName: string;
  sourceUrl: string;
  retrievedAt: string;
  role: GeometrySourceRole;
  format: GeometrySourceFormat;
  license?: string;
  attribution?: string;
  featureIds: string[];
  limitations: string[];
}

export interface LocationRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ProjectDefinition extends LocationRef {
  activeOperationalDestination: boolean;
  evidenceRefs: string[];
}

export interface RoadGeometrySegment {
  id: string;
  corridorId: string;
  geometryClass: Exclude<GeometryEvidenceClass, 'PROJECT_LOCATION'>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  sourceFeatureIds: string[];
  evidenceRefs: string[];
  sourceDatasetId: string;
  sourceRetrievedAt: string;
  sourceLicense?: string;
  limitations: string[];
}

export interface RouteSample {
  distanceKm: number;
  lon: number;
  lat: number;
  elevationM: number;
  segmentId: string;
  geometryChainageKm?: number;
  geometrySegmentId?: string;
  geometryClass?: Exclude<GeometryEvidenceClass, 'PROJECT_LOCATION'>;
}

export interface ElevationSample {
  distanceKm: number;
  elevationM: number;
}

export interface ElevationProfile {
  source: string;
  resolution: string;
  method: string;
  samples: ElevationSample[];
  limitations: string[];
}

export interface CorridorNode extends LocationRef {
  distanceKm: number;
  elevationM?: number;
  evidenceRefs: string[];
}

export interface CorridorSegment {
  id: string;
  corridorId: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  elevationMinM: number;
  elevationMaxM: number;
  gradeProxy?: number;
  roadClass: string;
  geometryConfidence: GeometryEvidenceClass;
  environmentNodeIds: string[];
}

export type CorridorGeometry =
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'MultiLineString'; coordinates: [number, number][][] };

export interface CorridorDefinition {
  id: string;
  name: string;
  origin: LocationRef;
  destination: LocationRef;
  geometry: CorridorGeometry;
  geometryClass: GeometryEvidenceClass;
  geometrySegments?: RoadGeometrySegment[];
  segments: CorridorSegment[];
  nodes: CorridorNode[];
  elevationProfile: ElevationProfile;
  routeSamples: RouteSample[];
  evidenceRefs: string[];
  retrievedAt: string;
  limitations: string[];
}

export interface PlannedStop {
  id: string;
  type: 'CHECKPOINT' | 'REST' | 'TRANSFER' | 'PROJECT';
  distanceKm: number;
  dwellMinutes: number;
  synthetic: boolean;
  evidenceRefs: string[];
}

export interface VehicleDefinition {
  id: string;
  type: VehicleType;
  corridorId: string;
  direction: VehicleDirection;
  departureTime: string;
  speedProfileId: string;
  plannedStops: PlannedStop[];
  synthetic: true;
  evidenceRefs: string[];
}

export interface EnvironmentHour {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  visibilityM?: number | null;
  cloudCoverPct?: number | null;
}

export interface EnvironmentNode extends LocationRef {
  corridorId: string;
  distanceKm: number;
  elevationM: number;
  hourly: EnvironmentHour[];
}

export interface EnvironmentSnapshot {
  schemaVersion: string;
  id: string;
  issuedAt: string;
  dataAsOf: string;
  targetDate: string;
  timezone: 'America/Argentina/San_Juan';
  provider: string;
  modelKind: EnvironmentModelKind;
  nodes: EnvironmentNode[];
  sourceState: SourceState;
  evidenceRefs: string[];
  limitations: string[];
}

export interface EnvironmentContext {
  sourceState: SourceState;
  temperatureC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  evidenceRefs: string[];
}

export interface OperationalRun {
  id: string;
  targetDate: string;
  issuedAt: string;
  dataAsOf: string;
  timezone: 'America/Argentina/San_Juan';
  mode: 'SIMULATED';
  modelVersion: string;
  scenarioVersion: string;
  seed: string | number;
  environmentSnapshotId: string;
  provenance: string[];
}

export interface VehicleSnapshot {
  id: string;
  type: VehicleType;
  corridorId: string;
  state: VehicleState;
  direction: VehicleDirection;
  position: { lon: number; lat: number };
  distanceKm: number;
  elevationM: number;
  segmentId: string;
  etaMinute: number | null;
  environmentContext?: EnvironmentContext;
}

export interface OperationalEvent {
  t: number;
  vehicleId: string;
  corridorId: string;
  event: OperationalEventType;
  locationId?: string;
  distanceKm?: number;
  elevationM?: number;
}

export interface ContextEvent {
  id: string;
  vehicleId: string;
  corridorId: string;
  segmentId: string;
  time: string;
  type: ContextSignalType;
  value?: number;
  unit?: string;
  ruleId: string;
  severity: ContextSeverity;
  evidenceRefs: string[];
}

export interface CorridorState {
  corridorId: string;
  activeVehicles: number;
  outbound: number;
  returning: number;
}

export interface OperationalMetrics {
  activeVehicles: number;
  atProject: number;
  returning: number;
  done: number;
}

export interface OperationalSnapshot {
  simTime: number;
  vehicles: VehicleSnapshot[];
  corridorStates: CorridorState[];
  operationalEvents: OperationalEvent[];
  contextEvents: ContextEvent[];
  metrics: OperationalMetrics;
}

export interface ScheduleDefinition {
  startMinute: 360;
  endMinute: 1200;
  defaultPlayback: 300;
  playbackOptions: [60, 120, 300, 600];
}

export interface CalibrationDefinition {
  evidenceRefs: string[];
}

export interface TerritoryDefinition {
  projects: ProjectDefinition[];
}

export interface SanJuanOperationSpec {
  schemaVersion: string;
  scenarioId: string;
  timezone: 'America/Argentina/San_Juan';
  seed: string | number;
  territory: TerritoryDefinition;
  corridors: CorridorDefinition[];
  fleet: VehicleDefinition[];
  schedule: ScheduleDefinition;
  calibration: CalibrationDefinition;
  provenance: EvidenceRef[];
}
