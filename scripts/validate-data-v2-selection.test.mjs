import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('data validation gate', () => {
  it('validates the mixed V1/V2 corridor asset map and includes road-geometry validation', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['scripts/validate-data.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));

    expect(stdout).toMatch(/corridor assets: hualilan=v1, veladero=v2, los-azules=v1/i);
    expect(pkg.scripts['validate:data']).toBe(
      'node scripts/validate-data.mjs && node scripts/validate-road-geometry.mjs veladero',
    );
  });
});
