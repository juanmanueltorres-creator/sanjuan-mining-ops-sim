import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stageSource = readFileSync('src/map/CesiumStage.tsx', 'utf8');
const appSource = readFileSync('src/app/App.tsx', 'utf8');

describe('regional vehicle readability contract', () => {
  it('scales operational vehicle points by camera distance instead of keeping constant regional weight', () => {
    expect(stageSource).toMatch(/NearFarScalar/);
    expect(stageSource).toMatch(/scaleByDistance/);
  });

  it('passes the selected vehicle into the map and reserves stronger point emphasis for it', () => {
    expect(appSource).toMatch(/selectedVehicleId=\{selectedVehicleId\}/);
    expect(stageSource).toMatch(/selectedVehicleId\?: string \| null/);
    expect(stageSource).toMatch(/selectedVehicleId === vehicleId/);
  });
});
