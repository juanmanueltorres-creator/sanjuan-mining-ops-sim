import {
  CesiumTerrainProvider,
  IonResource,
  type TerrainProvider,
} from 'cesium';

export type TerrainInstallResult =
  | { state: 'READY' }
  | { state: 'ELLIPSOID' }
  | { state: 'FAILED'; error: string }
  | { state: 'ABORTED' };

interface TerrainTarget {
  terrainProvider: unknown;
  isDestroyed(): boolean;
}

export function normalizeTerrainToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function createWorldTerrainProvider(token: string): Promise<TerrainProvider> {
  const resource = await IonResource.fromAssetId(1, { accessToken: token });
  return CesiumTerrainProvider.fromUrl(resource, { requestVertexNormals: true });
}

export async function installPreferredTerrain(
  target: TerrainTarget,
  token: string | null,
  createProvider: (token: string) => Promise<unknown> = createWorldTerrainProvider,
): Promise<TerrainInstallResult> {
  if (!token) return { state: 'ELLIPSOID' };

  try {
    const provider = await createProvider(token);
    if (target.isDestroyed()) return { state: 'ABORTED' };
    target.terrainProvider = provider;
    return { state: 'READY' };
  } catch (error) {
    return {
      state: 'FAILED',
      error: error instanceof Error ? error.message : 'Terrain provider failed',
    };
  }
}
