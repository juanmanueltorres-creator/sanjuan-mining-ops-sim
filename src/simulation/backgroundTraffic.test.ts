import { describe, expect, it } from 'vitest';
import { backgroundTrafficAt, type TrafficCalibration } from './backgroundTraffic';

const calibration: TrafficCalibration = {
  baseVisibleVehicles: 20,
  maxVisibleVehicles: 24,
  timeBands: [
    { startMinute: 360, endMinute: 540, relativeIntensity: 0.65 },
    { startMinute: 540, endMinute: 720, relativeIntensity: 1 },
    { startMinute: 720, endMinute: 960, relativeIntensity: 0.8 },
    { startMinute: 960, endMinute: 1201, relativeIntensity: 0.55 },
  ],
  corridorWeights: [
    { corridorId: 'hualilan', weight: 0.34 },
    { corridorId: 'veladero', weight: 0.33 },
    { corridorId: 'los-azules', weight: 0.33 },
  ],
};

describe('backgroundTrafficAt', () => {
  it('is deterministic and keeps civilian traffic visually bounded', () => {
    const a = backgroundTrafficAt('sanjuan-v0-20260830', 600, calibration);
    const b = backgroundTrafficAt('sanjuan-v0-20260830', 600, calibration);

    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    expect(a.every((vehicle) => vehicle.id.startsWith('BG-'))).toBe(true);
    expect(a.every((vehicle) => vehicle.progress >= 0 && vehicle.progress <= 1)).toBe(true);
    expect(a.every((vehicle) => vehicle.visualWeight === 'BACKGROUND')).toBe(true);
  });

  it('keeps identity, corridor and direction stable while progress advances through the same time band', () => {
    const at600 = backgroundTrafficAt('seed', 600, calibration);
    const at601 = backgroundTrafficAt('seed', 601, calibration);

    expect(at601.map(({ id, corridorId, direction }) => ({ id, corridorId, direction }))).toEqual(
      at600.map(({ id, corridorId, direction }) => ({ id, corridorId, direction })),
    );
    expect(at601.some((vehicle, index) => vehicle.progress !== at600[index].progress)).toBe(true);
  });

  it('uses time-band intensity without exceeding the calibration cap', () => {
    expect(backgroundTrafficAt('seed', 420, calibration)).toHaveLength(13);
    expect(backgroundTrafficAt('seed', 600, calibration)).toHaveLength(20);
    expect(backgroundTrafficAt('seed', 1100, calibration)).toHaveLength(11);

    const capped: TrafficCalibration = { ...calibration, baseVisibleVehicles: 100, maxVisibleVehicles: 24 };
    expect(backgroundTrafficAt('seed', 600, capped)).toHaveLength(24);
  });

  it('fails closed when no time band covers the requested minute', () => {
    expect(() => backgroundTrafficAt('seed', 300, calibration)).toThrow(/time band/i);
  });
});
