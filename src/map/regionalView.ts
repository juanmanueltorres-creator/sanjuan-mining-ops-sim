export interface RegionalViewPreset {
  lon: number;
  lat: number;
  heightM: number;
  headingDeg: number;
  pitchDeg: number;
}

export const REGIONAL_VIEW: RegionalViewPreset = {
  lon: -69.4,
  lat: -31.45,
  heightM: 340_000,
  headingDeg: 2,
  pitchDeg: -70,
};

/**
 * Low, oblique terrain-verification camera positioned south-east of Veladero
 * and aimed north-west at the project area. This is visual QA only; it does not
 * affect operational geometry, navigation or simulation state.
 */
export const VELADERO_VIEW: RegionalViewPreset = {
  lon: -69.62,
  lat: -29.65,
  heightM: 38_000,
  headingDeg: 315,
  pitchDeg: -42,
};

export interface RegionalViewAimPoint {
  lat: number;
  lon: number;
  forwardDistanceKm: number;
}

/**
 * Lightweight QA approximation for the ground point under the camera centre ray.
 * It is not used for navigation or Cesium placement; it only guards camera
 * presets from drifting away from the intended territory.
 */
export function estimateRegionalViewAimPoint(view: RegionalViewPreset): RegionalViewAimPoint {
  const pitchRad = Math.abs(view.pitchDeg) * Math.PI / 180;
  const headingRad = view.headingDeg * Math.PI / 180;
  const forwardDistanceKm = (view.heightM / 1000) / Math.tan(pitchRad);
  const northKm = forwardDistanceKm * Math.cos(headingRad);
  const eastKm = forwardDistanceKm * Math.sin(headingRad);
  const kmPerLatitudeDegree = 111.32;
  const kmPerLongitudeDegree = kmPerLatitudeDegree * Math.cos(view.lat * Math.PI / 180);

  return {
    lat: view.lat + northKm / kmPerLatitudeDegree,
    lon: view.lon + eastKm / kmPerLongitudeDegree,
    forwardDistanceKm,
  };
}
