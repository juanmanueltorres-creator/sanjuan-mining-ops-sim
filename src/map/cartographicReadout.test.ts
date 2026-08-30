import { describe, expect, it } from 'vitest';
import { formatCoordinates, formatElevation, selectScaleBarMeters } from './cartographicReadout';

describe('cartographic readout helpers', () => {
  it('formats coordinates with hemispheres and fixed precision', () => {
    expect(formatCoordinates(-31.5376, -68.5364)).toBe('31.5376° S · 68.5364° W');
    expect(formatCoordinates(12.5, 33.25)).toBe('12.5000° N · 33.2500° E');
  });

  it('formats elevation without inventing missing terrain', () => {
    expect(formatElevation(1025.4)).toBe('1,025 m');
    expect(formatElevation(null)).toBe('—');
    expect(formatElevation(Number.NaN)).toBe('—');
  });

  it('selects a readable 1/2/5 scale distance below the requested maximum', () => {
    expect(selectScaleBarMeters(376)).toBe(200);
    expect(selectScaleBarMeters(6_400)).toBe(5_000);
    expect(selectScaleBarMeters(0)).toBeNull();
  });
});
