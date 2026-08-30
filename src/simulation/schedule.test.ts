import { describe, expect, it } from 'vitest';
import { buildV0Schedule } from './schedule';

describe('buildV0Schedule', () => {
  it('builds the exact 24-unit V0 fleet mix', () => {
    const fleet = buildV0Schedule('20260830');

    expect(fleet).toHaveLength(24);
    expect(fleet.filter((vehicle) => vehicle.type === 'PERSONNEL')).toHaveLength(12);
    expect(fleet.filter((vehicle) => vehicle.type === 'FIELD')).toHaveLength(6);
    expect(fleet.filter((vehicle) => vehicle.type === 'LOGISTICS')).toHaveLength(6);
    expect(new Set(fleet.map((vehicle) => vehicle.id)).size).toBe(24);
    expect(fleet.every((vehicle) => vehicle.synthetic)).toBe(true);
  });

  it('is exactly reproducible for the same seed', () => {
    expect(buildV0Schedule('20260830')).toEqual(buildV0Schedule('20260830'));
  });

  it('puts every vehicle category on every active corridor', () => {
    const fleet = buildV0Schedule('20260830');

    for (const corridorId of ['hualilan', 'veladero', 'los-azules']) {
      const types = new Set(fleet.filter((vehicle) => vehicle.corridorId === corridorId).map((vehicle) => vehicle.type));
      expect(types).toEqual(new Set(['PERSONNEL', 'FIELD', 'LOGISTICS']));
    }
  });

  it('stays inside the approved departure window and uses only named synthetic assumptions', () => {
    const fleet = buildV0Schedule('20260830');
    const minutes = fleet.map((vehicle) => {
      const [hour, minute] = vehicle.departureTime.split(':').map(Number);
      return hour * 60 + minute;
    });

    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(360);
    expect(Math.max(...minutes)).toBeLessThan(480);
    expect(fleet.every((vehicle) => vehicle.evidenceRefs.includes('synthetic-operating-plan-v1'))).toBe(true);
  });
});
