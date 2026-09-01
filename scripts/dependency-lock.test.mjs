import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('deterministic Cesium dependency contract', () => {
  test('pins and installs the compatible Cesium package family', () => {
    const pkg = readJson('package.json');

    expect(pkg.dependencies.cesium).toBe('1.132.0');
    expect(pkg.overrides?.['@cesium/engine']).toBe('19.0.0');
    expect(pkg.overrides?.['@cesium/widgets']).toBe('13.0.0');
    expect(pkg.overrides?.['@zip.js/zip.js']).toBe('2.7.73');

    expect(readJson('node_modules/cesium/package.json').version).toBe('1.132.0');
    expect(readJson('node_modules/@cesium/engine/package.json').version).toBe('19.0.0');
    expect(readJson('node_modules/@cesium/widgets/package.json').version).toBe('13.0.0');
    expect(readJson('node_modules/@zip.js/zip.js/package.json').version).toBe('2.7.73');
  });
});
