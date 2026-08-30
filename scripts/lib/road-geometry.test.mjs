import { describe, expect, it } from 'vitest';
import {
  buildChainage,
  calibrateOperationalKm,
  interpolateElevation,
  locateAnchor,
  operationalSegmentAt,
  resamplePolyline,
  validateAnchorOrder,
  validateSegmentContinuity,
} from './road-geometry.mjs';

describe('road geometry math', () => {
  it('builds monotonically increasing geodesic chainage', () => {
    const points = buildChainage([[0, 0], [0.01, 0], [0.02, 0]]);

    expect(points[0].chainageKm).toBe(0);
    expect(points[1].chainageKm).toBeGreaterThan(points[0].chainageKm);
    expect(points[2].chainageKm).toBeCloseTo(2.224, 2);
  });

  it('maps chainage piecewise onto the operational 0/205/360 axis', () => {
    const anchors = [
      { geometryChainageKm: 0, operationalKm: 0 },
      { geometryChainageKm: 200, operationalKm: 205 },
      { geometryChainageKm: 355, operationalKm: 360 },
    ];

    expect(calibrateOperationalKm(0, anchors)).toBe(0);
    expect(calibrateOperationalKm(100, anchors)).toBeCloseTo(102.5, 6);
    expect(calibrateOperationalKm(200, anchors)).toBe(205);
    expect(calibrateOperationalKm(277.5, anchors)).toBeCloseTo(282.5, 6);
    expect(calibrateOperationalKm(355, anchors)).toBe(360);
  });

  it('fails continuity when adjacent source segments are more than 250m apart', () => {
    expect(() => validateSegmentContinuity(
      [[-69.0, -30.0], [-69.001, -30.0]],
      [[-69.01, -30.0], [-69.02, -30.0]],
      250,
    )).toThrow(/gap/i);
  });

  it('resamples a polyline while retaining exact required calibration chainages', () => {
    const samples = resamplePolyline([[0, 0], [0.02, 0]], 1000, [0.5, 1.5]);
    const chainages = samples.map((sample) => sample.chainageKm);

    expect(chainages[0]).toBe(0);
    expect(chainages.some((value) => Math.abs(value - 0.5) < 1e-9)).toBe(true);
    expect(chainages.some((value) => Math.abs(value - 1.5) < 1e-9)).toBe(true);
    expect(chainages.at(-1)).toBeCloseTo(2.224, 2);
  });

  it('locates a named anchor on the nearest route segment and records route distance', () => {
    const points = buildChainage([[-69.0, -30.0], [-69.0, -29.9]]);
    const located = locateAnchor(points, {
      id: 'fixture-anchor',
      lon: -69.001,
      lat: -29.95,
      maxDistanceToRouteKm: 2,
    });

    expect(located.id).toBe('fixture-anchor');
    expect(located.geometryChainageKm).toBeGreaterThan(5);
    expect(located.geometryChainageKm).toBeLessThan(6.5);
    expect(located.distanceToRouteKm).toBeLessThan(0.2);
  });

  it('rejects route anchors that are not ordered along increasing chainage', () => {
    expect(() => validateAnchorOrder([
      { id: 'san-juan', geometryChainageKm: 0 },
      { id: 'conconta', geometryChainageKm: 220 },
      { id: 'tudcum', geometryChainageKm: 200 },
      { id: 'veladero', geometryChainageKm: 350 },
    ])).toThrow(/anchor order/i);
  });

  it('interpolates the existing analytical elevation profile on operational distance', () => {
    const profile = [
      { distanceKm: 0, elevationM: 650 },
      { distanceKm: 205, elevationM: 1931 },
      { distanceKm: 260, elevationM: 4850 },
      { distanceKm: 360, elevationM: 4300 },
    ];

    expect(interpolateElevation(profile, 0)).toBe(650);
    expect(interpolateElevation(profile, 205)).toBe(1931);
    expect(interpolateElevation(profile, 260)).toBe(4850);
    expect(interpolateElevation(profile, 360)).toBe(4300);
    expect(interpolateElevation(profile, 232.5)).toBeCloseTo((1931 + 4850) / 2, 6);
  });

  it('assigns exact operational boundaries to the following segment except at route end', () => {
    const segments = [
      { id: 'veladero-01', startKm: 0, endKm: 52 },
      { id: 'veladero-02', startKm: 52, endKm: 140 },
      { id: 'veladero-03', startKm: 140, endKm: 205 },
    ];

    expect(operationalSegmentAt(segments, 51.999).id).toBe('veladero-01');
    expect(operationalSegmentAt(segments, 52).id).toBe('veladero-02');
    expect(operationalSegmentAt(segments, 205).id).toBe('veladero-03');
  });
});
