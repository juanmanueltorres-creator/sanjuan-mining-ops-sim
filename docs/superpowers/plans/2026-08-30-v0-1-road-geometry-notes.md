# V0.1 Road Geometry Plan — Normative Clarifications

This file is part of the implementation plan in `2026-08-30-v0-1-road-geometry.md` and resolves two self-review ambiguities before implementation.

## 1. No illustrative source ids in production artifacts

The `segments.v2.geojson` example in Task 4 uses the strings `actual-source-id` and `actual-evidence-id` only to illustrate the output shape. Those strings are **not valid implementation values** and must never be committed.

The builder must construct each feature from the finalized manifest:

```js
const properties = {
  id: segmentPlan.id,
  corridorId: 'veladero',
  geometryClass: segmentPlan.geometryClass,
  sourceDatasetId: segmentPlan.sourceDatasetId,
  sourceFeatureIds: [...segmentPlan.sourceFeatureIds],
  evidenceRefs: [...segmentPlan.evidenceRefs],
  sourceRetrievedAt: sourceRecord.retrievedAt,
  sourceLicense: sourceRecord.license,
  limitations: [...segmentPlan.limitations],
};
```

`sourceFeatureIds` must therefore contain only identifiers found in the frozen source snapshot selected during Task 3. `evidenceRefs` must contain only ids present in `metadata.v2.json.evidence`.

## 2. Geometry evidence registry location

`metadata.v2.json.evidence` remains the canonical `EvidenceRef[]` registry for the Veladero corridor bundle because the existing static loader already merges corridor metadata evidence into `StaticOperationData.evidence`.

V0.1 adds one evidence record for every geometry source actually used by a production segment, plus one derived build-method record. Use stable ids:

```text
veladero-dnv-road-geometry-v2
veladero-ign-road-geometry-v2
veladero-osm-access-geometry-v2     # include only if OSM geometry is actually used
veladero-route-geometry-build-v2
```

Rules:

- `veladero-dnv-road-geometry-v2`: `PRIMARY`; source URL points to the DNV/Datos Argentina national-road resource/catalog; limitations state that the catalog is an eventual reference dataset and not live road status.
- `veladero-ign-road-geometry-v2`: `PRIMARY`; limitations explicitly state the provincial-road source is IGN 2016 reference geometry.
- `veladero-osm-access-geometry-v2`: `PRIMARY` as direct publicly mapped geometry, but limitations state it is OpenStreetMap mapping, not operator evidence, current authorization, or verified mine navigation. Record ODbL 1.0 and `© OpenStreetMap contributors`. Omit this evidence record entirely when no OSM production segment is used.
- `veladero-route-geometry-build-v2`: `DERIVED`; documents source feature selection, orientation, explicit reconstructed gaps, concatenation, chainage, and 0/205/360 operational calibration.
- UNIDE WMS remains a `GeometrySourceRecord` with role `CORROBORATION`. It may have `featureIds: []` because no vector feature is claimed from a WMS image. It is not referenced as the sole evidence of a `PUBLIC_ROAD` segment.

Every `RoadGeometrySegment.evidenceRefs` must resolve against `metadata.v2.json.evidence`. Every `RoadGeometrySegment.sourceDatasetId` must resolve against `sources.v2.json.sources`.

The V2 validator and loader must enforce both graphs independently.
