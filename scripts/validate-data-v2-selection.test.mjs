import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('data validation gate', () => {
  it('validates the active V2 corridor asset map and all road geometries', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['scripts/validate-data.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));

    expect(stdout).toMatch(/corridor assets: hualilan=v2, veladero=v2, los-azules=v2/i);
    expect(pkg.scripts['validate:data']).toBe(
      'node scripts/validate-data.mjs && node scripts/validate-road-geometry.mjs hualilan && node scripts/validate-road-geometry.mjs veladero && node scripts/validate-road-geometry.mjs los-azules',
    );
  });
});
