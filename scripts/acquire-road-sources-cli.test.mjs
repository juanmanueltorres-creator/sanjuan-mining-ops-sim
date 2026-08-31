import { describe, expect, it, vi } from 'vitest';
import * as acquisition from './acquire-road-sources.mjs';

describe('road source acquisition CLI contract', () => {
  it('dispatches the Veladero corridor to the acquisition writer', async () => {
    expect(acquisition.runRoadSourceAcquisitionCli).toBeTypeOf('function');

    const acquire = vi.fn(async (options) => ({
      inventory: { corridorId: 'veladero' },
      outputDir: options.outputDir,
      snapshots: {},
    }));

    const result = await acquisition.runRoadSourceAcquisitionCli(['veladero'], {
      acquire,
      outputDir: 'artifacts/fixture-road-sources',
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith(expect.objectContaining({
      outputDir: 'artifacts/fixture-road-sources',
    }));
    expect(result.inventory.corridorId).toBe('veladero');
  });

  it('fails closed for unsupported corridor ids', async () => {
    expect(acquisition.runRoadSourceAcquisitionCli).toBeTypeOf('function');
    await expect(acquisition.runRoadSourceAcquisitionCli(['los-azules'], {
      acquire: vi.fn(),
    })).rejects.toThrow(/only veladero/i);
  });
});
