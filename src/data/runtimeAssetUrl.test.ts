import { describe, expect, it } from 'vitest';
import { resolveRuntimeAssetUrl } from './runtimeAssetUrl';

describe('resolveRuntimeAssetUrl', () => {
  it('keeps root-hosted assets unchanged', () => {
    expect(resolveRuntimeAssetUrl('/data/projects/projects.v1.json', '/'))
      .toBe('/data/projects/projects.v1.json');
  });

  it('prefixes GitHub Pages subpath assets with Vite BASE_URL', () => {
    expect(resolveRuntimeAssetUrl('/data/projects/projects.v1.json', '/sanjuan-mining-ops-sim/'))
      .toBe('/sanjuan-mining-ops-sim/data/projects/projects.v1.json');
  });

  it('does not duplicate the base path when already resolved', () => {
    expect(resolveRuntimeAssetUrl('/sanjuan-mining-ops-sim/data/projects/projects.v1.json', '/sanjuan-mining-ops-sim/'))
      .toBe('/sanjuan-mining-ops-sim/data/projects/projects.v1.json');
  });
});
