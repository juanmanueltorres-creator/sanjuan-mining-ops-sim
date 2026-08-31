import { describe, expect, it } from 'vitest';
import { visualHeightOffsetM } from './terrainPlacement';

describe('terrain-relative visual placement', () => {
  it('uses display offsets that are independent from analytical elevation', () => {
    expect(visualHeightOffsetM('OPERATIONAL_VEHICLE')).toBe(8);
    expect(visualHeightOffsetM('BACKGROUND_TRAFFIC')).toBe(5);
    expect(visualHeightOffsetM('ACTIVE_PROJECT')).toBe(80);
    expect(visualHeightOffsetM('PROJECT')).toBe(20);
  });
});
