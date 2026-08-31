import { describe, expect, it, vi } from 'vitest';
import { installPreferredTerrain, normalizeTerrainToken } from './terrainRuntime';

describe('terrain runtime', () => {
  it('treats missing and blank tokens as ellipsoid mode', async () => {
    expect(normalizeTerrainToken(undefined)).toBeNull();
    expect(normalizeTerrainToken('   ')).toBeNull();

    const target = { terrainProvider: { kind: 'ellipsoid' }, isDestroyed: () => false };
    const createProvider = vi.fn();
    await expect(installPreferredTerrain(target, null, createProvider)).resolves.toEqual({ state: 'ELLIPSOID' });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('installs the resolved provider without touching simulation data', async () => {
    const provider = { kind: 'terrain' };
    const target = { terrainProvider: { kind: 'ellipsoid' }, isDestroyed: () => false };
    const createProvider = vi.fn().mockResolvedValue(provider);
    await expect(installPreferredTerrain(target, 'public-token', createProvider)).resolves.toEqual({ state: 'READY' });
    expect(target.terrainProvider).toBe(provider);
  });

  it('keeps the existing ellipsoid provider when terrain loading fails', async () => {
    const original = { kind: 'ellipsoid' };
    const target = { terrainProvider: original, isDestroyed: () => false };
    const createProvider = vi.fn().mockRejectedValue(new Error('terrain unavailable'));
    const result = await installPreferredTerrain(target, 'public-token', createProvider);
    expect(result).toEqual({ state: 'FAILED', error: 'terrain unavailable' });
    expect(target.terrainProvider).toBe(original);
  });

  it('does not install a provider after viewer teardown', async () => {
    const original = { kind: 'ellipsoid' };
    let destroyed = false;
    const target = { terrainProvider: original, isDestroyed: () => destroyed };
    const createProvider = vi.fn().mockImplementation(async () => {
      destroyed = true;
      return { kind: 'terrain' };
    });
    await expect(installPreferredTerrain(target, 'public-token', createProvider)).resolves.toEqual({ state: 'ABORTED' });
    expect(target.terrainProvider).toBe(original);
  });
});
