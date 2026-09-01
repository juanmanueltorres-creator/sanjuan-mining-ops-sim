import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('deterministic Cesium dependency contract', () => {
  test('pins the Cesium package family and commits a lockfile', () => {
    const pkg = readJson('package.json');

    expect(pkg.dependencies.cesium).toBe('1.132.0');
    expect(pkg.overrides?.['@cesium/engine']).toBe('19.0.0');
    expect(pkg.overrides?.['@cesium/widgets']).toBe('13.0.0');
    expect(existsSync('package-lock.json')).toBe(true);

    const lock = readJson('package-lock.json');
    expect(lock.packages?.['node_modules/cesium']?.version).toBe('1.132.0');
    expect(lock.packages?.['node_modules/@cesium/engine']?.version).toBe('19.0.0');
    expect(lock.packages?.['node_modules/@cesium/widgets']?.version).toBe('13.0.0');
  });
});
