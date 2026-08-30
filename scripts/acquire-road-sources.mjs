export function normalizeWfsFeatureCollection(input) {
  return input;
}

export function normalizeOverpassWays() {
  return { type: 'FeatureCollection', features: [] };
}

export function clipFeatureCollectionToBbox(input) {
  return input;
}

export function normalizeWfsUrl(url) {
  return url;
}
