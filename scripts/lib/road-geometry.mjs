const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

function assertCoordinate(coordinate, label = 'coordinate') {
  if (!Array.isArray(coordinate) || coordinate.length !== 2) {
    throw new Error(`${label}: expected [lon, lat]`);
  }
  const [lon, lat] = coordinate;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`${label}: invalid coordinate`);
  }
}

function assertIncreasing(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (!(values[index] > values[index - 1])) {
      throw new Error(`${label} must increase strictly`);
    }
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function haversineMeters(a, b) {
  assertCoordinate(a, 'start coordinate');
  assertCoordinate(b, 'end coordinate');
  const [lon1, lat1] = a.map((value) => value * DEG_TO_RAD);
  const [lon2, lat2] = b.map((value) => value * DEG_TO_RAD);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildChainage(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('Polyline requires at least two coordinates');
  }

  coordinates.forEach((coordinate, index) => assertCoordinate(coordinate, `coordinate ${index}`));
  let chainageKm = 0;
  const points = coordinates.map(([lon, lat], index) => {
    if (index > 0) {
      const segmentMeters = haversineMeters(coordinates[index - 1], coordinates[index]);
      if (segmentMeters <= EPS) throw new Error(`Polyline segment ${index - 1}-${index} has zero length`);
      chainageKm += segmentMeters / 1000;
    }
    return { lon, lat, chainageKm };
  });

  if (chainageKm <= EPS) throw new Error('Polyline has no measurable length');
  return points;
}

export function interpolateCoordinateAtChainage(points, requestedChainageKm) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Chainage points are required');
  const chainages = points.map((point) => point.chainageKm);
  assertIncreasing(chainages, 'Geometry chainage');
  if (!Number.isFinite(requestedChainageKm)) throw new Error('Requested chainage must be finite');

  if (requestedChainageKm <= chainages[0]) return { ...points[0], chainageKm: chainages[0] };
  if (requestedChainageKm >= chainages.at(-1)) return { ...points.at(-1), chainageKm: chainages.at(-1) };

  let high = 1;
  while (points[high].chainageKm < requestedChainageKm) high += 1;
  const a = points[high - 1];
  const b = points[high];
  const t = (requestedChainageKm - a.chainageKm) / (b.chainageKm - a.chainageKm);
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    chainageKm: requestedChainageKm,
  };
}

export function resamplePolyline(coordinates, spacingMeters = 250, requiredChainagesKm = []) {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) throw new Error('Resample spacing must be positive');
  if (!Array.isArray(requiredChainagesKm)) throw new Error('Required chainages must be an array');

  const points = buildChainage(coordinates);
  const totalKm = points.at(-1).chainageKm;
  const spacingKm = spacingMeters / 1000;
  const targets = [0, totalKm];

  for (let chainageKm = spacingKm; chainageKm < totalKm; chainageKm += spacingKm) {
    targets.push(chainageKm);
  }
  for (const chainageKm of requiredChainagesKm) {
    if (!Number.isFinite(chainageKm) || chainageKm < -EPS || chainageKm > totalKm + EPS) {
      throw new Error(`Required chainage ${chainageKm} is outside the polyline`);
    }
    targets.push(clamp(chainageKm, 0, totalKm));
  }

  targets.sort((a, b) => a - b);
  const uniqueTargets = [];
  for (const value of targets) {
    if (uniqueTargets.length === 0 || Math.abs(value - uniqueTargets.at(-1)) > EPS) uniqueTargets.push(value);
  }

  return uniqueTargets.map((chainageKm) => interpolateCoordinateAtChainage(points, chainageKm));
}

function validateCalibrationAnchors(anchors) {
  if (!Array.isArray(anchors) || anchors.length < 2) throw new Error('At least two calibration anchors are required');
  for (const [index, anchor] of anchors.entries()) {
    if (!Number.isFinite(anchor.geometryChainageKm) || !Number.isFinite(anchor.operationalKm)) {
      throw new Error(`Calibration anchor ${index} must contain finite chainage and operational km`);
    }
  }
  assertIncreasing(anchors.map((anchor) => anchor.geometryChainageKm), 'Calibration geometry chainage');
  assertIncreasing(anchors.map((anchor) => anchor.operationalKm), 'Calibration operational distance');
}

export function calibrateOperationalKm(chainageKm, anchors) {
  if (!Number.isFinite(chainageKm)) throw new Error('Geometry chainage must be finite');
  validateCalibrationAnchors(anchors);

  if (chainageKm <= anchors[0].geometryChainageKm) return anchors[0].operationalKm;
  if (chainageKm >= anchors.at(-1).geometryChainageKm) return anchors.at(-1).operationalKm;

  let high = 1;
  while (anchors[high].geometryChainageKm < chainageKm) high += 1;
  const a = anchors[high - 1];
  const b = anchors[high];
  const t = (chainageKm - a.geometryChainageKm) / (b.geometryChainageKm - a.geometryChainageKm);
  return a.operationalKm + (b.operationalKm - a.operationalKm) * t;
}

export function interpolateElevation(profileSamples, operationalKm) {
  if (!Array.isArray(profileSamples) || profileSamples.length < 2) throw new Error('Elevation profile requires at least two samples');
  if (!Number.isFinite(operationalKm)) throw new Error('Operational distance must be finite');
  for (const [index, sample] of profileSamples.entries()) {
    if (!Number.isFinite(sample.distanceKm) || !Number.isFinite(sample.elevationM)) {
      throw new Error(`Elevation profile sample ${index} is invalid`);
    }
  }
  assertIncreasing(profileSamples.map((sample) => sample.distanceKm), 'Elevation profile distance');

  if (operationalKm <= profileSamples[0].distanceKm) return profileSamples[0].elevationM;
  if (operationalKm >= profileSamples.at(-1).distanceKm) return profileSamples.at(-1).elevationM;

  let high = 1;
  while (profileSamples[high].distanceKm < operationalKm) high += 1;
  const a = profileSamples[high - 1];
  const b = profileSamples[high];
  const t = (operationalKm - a.distanceKm) / (b.distanceKm - a.distanceKm);
  return a.elevationM + (b.elevationM - a.elevationM) * t;
}

export function operationalSegmentAt(segments, operationalKm) {
  if (!Array.isArray(segments) || segments.length === 0) throw new Error('Operational segments are required');
  if (!Number.isFinite(operationalKm)) throw new Error('Operational distance must be finite');
  const sorted = [...segments].sort((a, b) => a.startKm - b.startKm);

  if (operationalKm <= sorted[0].startKm) return sorted[0];
  if (operationalKm >= sorted.at(-1).endKm) return sorted.at(-1);
  const segment = sorted.find((item) => operationalKm >= item.startKm && operationalKm < item.endKm);
  if (!segment) throw new Error(`No operational segment contains km ${operationalKm}`);
  return segment;
}

export function validateSegmentContinuity(previousCoordinates, nextCoordinates, toleranceMeters = 250) {
  if (!Array.isArray(previousCoordinates) || previousCoordinates.length < 2) throw new Error('Previous segment geometry is required');
  if (!Array.isArray(nextCoordinates) || nextCoordinates.length < 2) throw new Error('Next segment geometry is required');
  if (!Number.isFinite(toleranceMeters) || toleranceMeters < 0) throw new Error('Continuity tolerance must be non-negative');
  const gapMeters = haversineMeters(previousCoordinates.at(-1), nextCoordinates[0]);
  if (gapMeters > toleranceMeters) {
    throw new Error(`Segment gap ${gapMeters.toFixed(1)} m exceeds ${toleranceMeters} m tolerance`);
  }
  return gapMeters;
}

export function validateAnchorOrder(locatedAnchors) {
  if (!Array.isArray(locatedAnchors) || locatedAnchors.length < 2) throw new Error('At least two located anchors are required');
  for (let index = 1; index < locatedAnchors.length; index += 1) {
    const previous = locatedAnchors[index - 1];
    const current = locatedAnchors[index];
    if (!Number.isFinite(previous.geometryChainageKm) || !Number.isFinite(current.geometryChainageKm)
      || current.geometryChainageKm <= previous.geometryChainageKm) {
      throw new Error(`Anchor order invalid between ${previous.id ?? index - 1} and ${current.id ?? index}`);
    }
  }
  return locatedAnchors;
}

function projectAnchorToSegment(a, b, anchor) {
  const anchorLatRad = anchor.lat * DEG_TO_RAD;
  const toLocalMeters = (point) => ({
    x: EARTH_RADIUS_M * (point.lon - anchor.lon) * DEG_TO_RAD * Math.cos(anchorLatRad),
    y: EARTH_RADIUS_M * (point.lat - anchor.lat) * DEG_TO_RAD,
  });
  const localA = toLocalMeters(a);
  const localB = toLocalMeters(b);
  const vx = localB.x - localA.x;
  const vy = localB.y - localA.y;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared <= EPS
    ? 0
    : clamp(-(localA.x * vx + localA.y * vy) / lengthSquared, 0, 1);
  const routeLon = a.lon + (b.lon - a.lon) * t;
  const routeLat = a.lat + (b.lat - a.lat) * t;
  return {
    t,
    routeLon,
    routeLat,
    distanceM: haversineMeters([anchor.lon, anchor.lat], [routeLon, routeLat]),
  };
}

export function locateAnchor(points, anchor) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Chainage points are required');
  if (!anchor || typeof anchor !== 'object') throw new Error('Anchor is required');
  assertCoordinate([anchor.lon, anchor.lat], `anchor ${anchor.id ?? ''}`.trim());
  assertIncreasing(points.map((point) => point.chainageKm), 'Geometry chainage');

  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const projected = projectAnchorToSegment(a, b, anchor);
    if (!best || projected.distanceM < best.distanceM) {
      best = {
        ...projected,
        geometryChainageKm: a.chainageKm + (b.chainageKm - a.chainageKm) * projected.t,
      };
    }
  }

  if (!best) throw new Error(`Unable to locate anchor ${anchor.id ?? ''}`.trim());
  const distanceToRouteKm = best.distanceM / 1000;
  if (Number.isFinite(anchor.maxDistanceToRouteKm) && distanceToRouteKm > anchor.maxDistanceToRouteKm) {
    throw new Error(`Anchor ${anchor.id ?? ''} is ${distanceToRouteKm.toFixed(3)} km from route, exceeds ${anchor.maxDistanceToRouteKm} km`.trim());
  }

  return {
    ...anchor,
    geometryChainageKm: best.geometryChainageKm,
    distanceToRouteKm,
    routeLon: best.routeLon,
    routeLat: best.routeLat,
  };
}
