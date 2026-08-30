import type {
  CorridorDefinition,
  GeometryEvidenceClass,
  RouteSample,
} from '../domain/contracts';

export type RenderableGeometryClass = Exclude<GeometryEvidenceClass, 'PROJECT_LOCATION'>;
export type RouteGeometryPattern = 'solid' | 'dash' | 'dot';

export interface RouteGeometryVisualStyle {
  pattern: RouteGeometryPattern;
  width: number;
  alpha: number;
  dashLength?: number;
  dashPattern?: number;
}

export interface CorridorRenderPoint {
  lon: number;
  lat: number;
  elevationM: number;
}

export interface CorridorRenderLine {
  id: string;
  geometryClass: RenderableGeometryClass;
  points: CorridorRenderPoint[];
}

const VISUAL_STYLES: Record<RenderableGeometryClass, RouteGeometryVisualStyle> = {
  PUBLIC_ROAD: {
    pattern: 'solid',
    width: 3.5,
    alpha: 0.92,
  },
  RECONSTRUCTED_ACCESS: {
    pattern: 'dash',
    width: 3,
    alpha: 0.72,
    dashLength: 18,
    dashPattern: 0xf0f0,
  },
  APPROXIMATE_APPROACH: {
    pattern: 'dot',
    width: 2.25,
    alpha: 0.5,
    dashLength: 10,
    dashPattern: 0x1111,
  },
};

export function routeGeometryStyle(geometryClass: RenderableGeometryClass): RouteGeometryVisualStyle {
  return { ...VISUAL_STYLES[geometryClass] };
}

function squaredLonLatDistance(lon: number, lat: number, sample: RouteSample): number {
  const lonDelta = lon - sample.lon;
  const latDelta = lat - sample.lat;
  return lonDelta * lonDelta + latDelta * latDelta;
}

function nearestElevationM(routeSamples: RouteSample[], lon: number, lat: number): number {
  if (routeSamples.length === 0) return 0;
  let nearest = routeSamples[0];
  let nearestDistance = squaredLonLatDistance(lon, lat, nearest);
  for (let index = 1; index < routeSamples.length; index += 1) {
    const candidate = routeSamples[index];
    const candidateDistance = squaredLonLatDistance(lon, lat, candidate);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }
  return nearest.elevationM;
}

function requireRenderableClass(geometryClass: GeometryEvidenceClass): RenderableGeometryClass {
  if (geometryClass === 'PROJECT_LOCATION') {
    throw new Error('PROJECT_LOCATION cannot be rendered as a corridor line');
  }
  return geometryClass;
}

export function buildCorridorRenderLines(corridor: CorridorDefinition): CorridorRenderLine[] {
  if (corridor.geometrySegments && corridor.geometrySegments.length > 0) {
    return corridor.geometrySegments.map((segment) => ({
      id: segment.id,
      geometryClass: segment.geometryClass,
      points: segment.geometry.coordinates.map(([lon, lat]) => ({
        lon,
        lat,
        elevationM: nearestElevationM(corridor.routeSamples, lon, lat),
      })),
    }));
  }

  return [{
    id: `${corridor.id}:legacy`,
    geometryClass: requireRenderableClass(corridor.geometryClass),
    points: corridor.routeSamples.map((sample) => ({
      lon: sample.lon,
      lat: sample.lat,
      elevationM: sample.elevationM,
    })),
  }];
}
