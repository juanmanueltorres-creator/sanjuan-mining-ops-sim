import { describe, expect, it, vi } from 'vitest';
import { OVERPASS_ENDPOINTS, fetchOverpassRoadSource } from './acquire-road-sources.mjs';

const bbox = [-70.1, -30.25, -69.2, -29.25];

function successfulOverpassResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      elements: [{
        type: 'way',
        id: 777,
        tags: { highway: 'track' },
        geometry: [
          { lon: -69.4, lat: -30.0 },
          { lon: -69.8, lat: -29.5 },
        ],
      }],
    }),
  };
}

describe('Overpass acquisition transport', () => {
  it('uses the current public Private.coffee mirror instead of the legacy Kumi hostname', () => {
    expect(OVERPASS_ENDPOINTS).toContain('https://overpass.private.coffee/api/interpreter');
    expect(OVERPASS_ENDPOINTS).not.toContain('https://overpass.kumi.systems/api/interpreter');
  });

  it('identifies the application and requests JSON on every Overpass request', async () => {
    const fetcher = vi.fn(async (_url, options) => {
      expect(options.method).toBe('POST');
      expect(options.headers['content-type']).toMatch(/form-urlencoded/i);
      expect(options.headers.accept).toBe('application/json');
      expect(options.headers['user-agent']).toContain('sanjuan-mining-ops-sim');
      expect(options.headers.referer).toBe('https://github.com/juanmanueltorres-creator/sanjuan-mining-ops-sim');
      return successfulOverpassResponse();
    });

    const result = await fetchOverpassRoadSource(bbox, fetcher, ['https://overpass.test/interpreter']);

    expect(result.featureCollection.features[0].id).toBe('osm-way-777');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
