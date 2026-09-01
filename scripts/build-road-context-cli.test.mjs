import { describe, expect, it } from 'vitest';
import { resolveRoadContextCli } from './build-road-context.mjs';

describe('road-context CLI contract', () => {
  it('accepts one --input and derives every versioned input/output and provenance field', () => {
    expect(resolveRoadContextCli(['--input', '../Geo_Platform/web/public/data/san_juan_rutas.geojson'])).toEqual({
      sourcePath: '../Geo_Platform/web/public/data/san_juan_rutas.geojson',
      routeSamplePaths: [
        'public/data/corridors/hualilan/route-samples.v1.json',
        'public/data/corridors/veladero/route-samples.v2.json',
        'public/data/corridors/los-azules/route-samples.v1.json',
      ],
      outputGeojsonPath: 'public/data/context/roads-context.v1.geojson',
      outputMetadataPath: 'public/data/context/roads-context.v1.json',
      sourceIdentity: {
        repository: 'juanmanueltorres-creator/Geo_Platform',
        path: 'web/public/data/san_juan_rutas.geojson',
        commit: 'a4812d053f4f381b9d3e1d5ff30abb9fed7d6772',
        blobSha: '1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70',
      },
      provenance: {
        sourceUrl: 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG',
        licenseUrl: 'https://www.ign.gob.ar/descargas/tyc1.html',
        attribution: 'FUENTE: Instituto Geográfico Nacional de la República Argentina',
      },
    });
  });

  it('fails closed when --input is missing or extra CLI surface is supplied', () => {
    expect(() => resolveRoadContextCli([])).toThrow(/--input/i);
    expect(() => resolveRoadContextCli(['--source', 'legacy.geojson'])).toThrow(/unknown|--input/i);
    expect(() => resolveRoadContextCli(['--input', 'roads.geojson', '--output-geojson', 'elsewhere.geojson'])).toThrow(/unknown/i);
  });
});
