export type TerrainPlacementKind =
  | 'OPERATIONAL_VEHICLE'
  | 'BACKGROUND_TRAFFIC'
  | 'ACTIVE_PROJECT'
  | 'PROJECT';

const OFFSETS_M: Record<TerrainPlacementKind, number> = {
  OPERATIONAL_VEHICLE: 8,
  BACKGROUND_TRAFFIC: 5,
  ACTIVE_PROJECT: 80,
  PROJECT: 20,
};

export function visualHeightOffsetM(kind: TerrainPlacementKind): number {
  return OFFSETS_M[kind];
}
