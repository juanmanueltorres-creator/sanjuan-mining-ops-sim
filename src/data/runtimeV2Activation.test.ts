import { describe, expect, it } from 'vitest';
import { DEFAULT_CORRIDOR_ASSET_VERSIONS } from './loadOperation';

describe('V0.2A runtime corridor activation', () => {
  it('uses V2 assets by default for all active corridors', () => {
    expect(DEFAULT_CORRIDOR_ASSET_VERSIONS).toEqual({
      hualilan: 'v2',
      veladero: 'v2',
      'los-azules': 'v2',
    });
  });
});
