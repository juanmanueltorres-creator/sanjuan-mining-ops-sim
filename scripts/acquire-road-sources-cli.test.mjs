import { describe, expect, it, vi } from 'vitest';
import * as acquisition from './acquire-road-sources.mjs';

const EXPECTED_CONFIG = {
  veladero: {
    regionalBbox: [-69.5, -31.8, -68.3, -29.9],
    fallbackBbox: [-70.1, -30.25, -69.2, -29.25],
  },
  hualilan: {
    regionalBbox: [-69.25, -31.75, -68.35, -30.55],
    fallbackBbox: [-69.25, -31.25, -68.70, -30.55],
  },
  'los-azules': {
    regionalBbox: [-70.40, -31.80, -68.30, -30.85],
    fallbackBbox: [-70.45, -31.55, -69.20, -30.85],
  },
};

describe('road source acquisition CLI contract', () => {
  it('exports exact authoring bboxes for all active corridors', () => {
    expect(acquisition.ROAD_SOURCE_ACQUISITION_CONFIG).toEqual(EXPECTED_CONFIG);
  });

  it.each(['veladero', 'hualilan', 'los-azules'])('dispatches %s to the generic acquisition writer', async (corridorId) => {
    expect(acquisition.runRoadSourceAcquisitionCli).toBeTypeOf('function');

    const acquire = vi.fn(async (requestedCorridorId, options) => ({
      inventory: { corridorId: requestedCorridorId },
      outputDir: options.outputDir,
      snapshots: {},
    }));

    const result = await acquisition.runRoadSourceAcquisitionCli([corridorId], {
      acquire,
      outputDir: 'artifacts/fixture-road-sources',
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith(corridorId, expect.objectContaining({
      outputDir: 'artifacts/fixture-road-sources',
    }));
    expect(result.inventory.corridorId).toBe(corridorId);
  });

  it('fails closed for unsupported corridor ids', async () => {
    expect(acquisition.runRoadSourceAcquisitionCli).toBeTypeOf('function');
    await expect(acquisition.runRoadSourceAcquisitionCli(['unknown-corridor'], {
      acquire: vi.fn(),
    })).rejects.toThrow(/unsupported corridor/i);
  });
});
