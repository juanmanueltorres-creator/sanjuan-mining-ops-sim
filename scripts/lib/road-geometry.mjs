export function buildChainage(coordinates) {
  return coordinates.map(([lon, lat]) => ({ lon, lat, chainageKm: 0 }));
}

export function calibrateOperationalKm() {
  return 0;
}

export function interpolateElevation() {
  return 0;
}

export function locateAnchor(_points, anchor) {
  return { ...anchor, geometryChainageKm: 0, distanceToRouteKm: Number.POSITIVE_INFINITY };
}

export function operationalSegmentAt(segments) {
  return segments[0];
}

export function resamplePolyline(coordinates) {
  return buildChainage(coordinates);
}

export function validateAnchorOrder() {}

export function validateSegmentContinuity() {}
