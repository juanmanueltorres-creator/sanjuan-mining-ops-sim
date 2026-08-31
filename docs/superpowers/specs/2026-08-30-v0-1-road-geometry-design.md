# San Juan Mining Ops Sim — V0.1 Road Geometry Design

Date: 2026-08-30
Status: Approved design, pre-implementation
Repository: `juanmanueltorres-creator/sanjuan-mining-ops-sim`
Branch: `feat/v0.1-road-geometry`

## 1. Purpose

V0 proved the full simulation loop in production: Cesium/WebGL, static sourced territory, 24 deterministic synthetic mobilizations, modelled weather, background traffic, provenance, timeline and GitHub Pages deployment.

The remaining visual weakness is corridor geometry. The current Veladero corridor is a sparse reconstruction with only a handful of control vertices, so long straight chords cross valleys and mountain ranges instead of following the mapped road network.

V0.1 improves corridor geometry without changing the core simulation model.

The product question is:

> Can the operational simulation follow defensible public-road and publicly mapped access geometry while preserving explicit uncertainty and the deterministic V0 operating model?

Core rule:

> Better geometry must increase spatial fidelity without increasing evidentiary overclaim.

## 2. Scope

### V0.1 includes

- Geometry upgrade for **Veladero first**.
- Official-first source hierarchy for public-road geometry.
- Versioned source snapshots/manifests and per-segment provenance.
- Dense route geometry that follows mapped roads rather than sparse straight chords.
- Piecewise distance calibration preserving the published operational distance axis:
  - San Juan = km 0.
  - Tudcum/main-gate context = km 205.
  - Veladero = km 360.
- Rebuilt `route-samples` on the new geometry.
- Existing analytical elevation profile reused on the operational distance axis.
- Distinct cartographic styling for sourced public roads, reconstructed access and approximate approach.
- Automated geometry/provenance validation.
- Regression protection that V0 operational semantics remain unchanged except for spatial position.
- Production deployment and real-browser smoke test after merge.

### Explicitly out of scope

- Claiming any private/access geometry is current operator navigation data.
- Live road condition, closure, authorization or transitability.
- New speed profiles, delays, weather effects or fleet behavior.
- Rebuilding the elevation model from a new DEM.
- Navigation/routing instructions for real operations.
- Hualilán and Los Azules geometry changes in the first implementation pass.
- Runtime calls to Overpass, DNV, UNIDE, WFS/WMS or any route provider.
- Satellite digitization as the default source method.

Hualilán and Los Azules only proceed after the Veladero pattern is validated technically and visually.

## 3. Existing State

The current Veladero asset is intentionally labelled `RECONSTRUCTED_ACCESS` and contains a sparse `LineString` from San Juan to Veladero through a small set of regional anchors.

The current metadata already states:

- approximately 360 km total route distance;
- approximately 205 km from San Juan to the main-gate/Tudcum context;
- approximately 155–156 km from Tudcum to Veladero;
- passage through Conconta Pass, Valle del Cura and Despoblados Pass;
- schematic unsupported intermediate high-mountain positions;
- no claim of current operator routing.

V0.1 retains those evidence boundaries while replacing unsupported visual chords wherever defensible source geometry exists.

## 4. Evidence Hierarchy

Geometry sources are selected in this order.

### Tier 1 — official vector road geometry

Preferred for public road sections.

1. **Dirección Nacional de Vialidad / Datos Argentina — Rutas Nacionales**
   - SIG-Vial: `https://www.argentina.gob.ar/transporte/vialidad-nacional/sig-vial`
   - Open dataset: `https://datos.gob.ar/dataset/transporte-rutas-nacionales`
   - Used for national-road geometry such as RN 40 where the source feature can be unambiguously selected.

2. **Official/provincial or IGN road datasets**
   - Rutas Provinciales dataset: `https://datos.gob.ar/dataset/transporte-rutas-provinciales`
   - Source identifies the provincial-road dataset as IGN-derived.
   - Used when the relevant San Juan provincial-road feature is identifiable and geometrically consistent with the corridor evidence.

### Tier 2 — provincial official corroboration

**UNIDE San Juan**

- Portal: `https://web.sanjuan.gob.ar/unide/`
- WMS: `https://unide.sanjuan.gob.ar/geoserver/wms`

UNIDE is an official provincial geospatial source and can corroborate route placement/layer context. A WMS image alone is not treated as vector provenance. If no extractable vector service is available, UNIDE may corroborate but does not silently become a digitized route source.

### Tier 3 — OpenStreetMap fallback/completion

OpenStreetMap may supply missing mapped road/access geometry when official vector data is absent or insufficient.

Rules:

- OSM data is source geometry, not operator evidence.
- OSM-derived access segments remain `RECONSTRUCTED_ACCESS` unless the segment is independently established as a public road.
- OSM attribution and ODbL information must remain visible/documented.
- Source snapshots or extracts used by this repository must preserve OSM provenance and retrieval date.
- No live Overpass dependency at runtime.

Reference: `https://osmfoundation.org/wiki/Licence/Attribution_Guidelines`.

### Tier 4 — derived reconstruction

Where no defensible vector geometry exists, the route may retain a derived reconstruction between sourced anchors.

Such geometry must:

- be explicitly classified `RECONSTRUCTED_ACCESS`;
- identify the anchors and method used;
- never be presented as a verified operator trace;
- never inherit a `PUBLIC_ROAD` class solely because it visually follows a road-like feature.

### Tier 5 — approximate project approach

An unsupported final connection may be represented only as `APPROXIMATE_APPROACH` or omitted.

## 5. Primary Veladero Narrative Constraint

The corridor narrative is constrained by the published Veladero technical report.

Primary reference:

`https://www.sec.gov/Archives/edgar/data/756894/000119312518094430/d542549dex991.htm`

The report states, in substance:

- Veladero is approximately 360 km by road from San Juan;
- the regional approach uses RN 40 and provincial-road/public-road connections to the Iglesia/Tudcum area;
- the road distance to the main gate near Tudcum is approximately 205 km;
- the remaining approximately 155–156 km is an all-season gravel access road;
- the access continues via Conconta Pass, Valle del Cura and Despoblados Pass to Veladero.

These values constrain the scenario distance axis and anchor order. They do not provide a turn-by-turn vector route.

## 6. Geometry Model

### 6.1 Keep the existing evidence classes

V0.1 continues to use:

```text
PUBLIC_ROAD
RECONSTRUCTED_ACCESS
APPROXIMATE_APPROACH
PROJECT_LOCATION
```

The classification describes evidentiary confidence/use, not merely whether a line exists in a public map.

### 6.2 Segment-level geometry

The canonical Veladero corridor becomes a sequence of independently sourced/derived segments rather than one homogeneous `LineString` claim.

Conceptual structure:

```ts
interface RoadGeometrySegment {
  id: string;
  corridorId: 'veladero';
  geometryClass: GeometryEvidenceClass;
  geometry: GeoJSON.LineString;
  sourceFeatureIds: string[];
  evidenceRefs: string[];
  sourceDatasetId: string;
  sourceRetrievedAt: string;
  sourceLicense?: string;
  limitations: string[];
}
```

The runtime corridor may still expose one `LineString`/`MultiLineString` to existing consumers, but the source asset must retain segment boundaries and provenance.

### 6.3 Expected Veladero segment story

The implementation should attempt to resolve, in order:

```text
San Juan
  ↓
public/national road network
  ↓
Iglesia / Pismanta context
  ↓
Tudcum / main-gate context
  ↓
Conconta Pass
  ↓
Valle del Cura
  ↓
Despoblados Pass
  ↓
Veladero
```

The exact public-road labels are accepted only when supported by the selected source features. The design does not hard-code an unverified route number merely to make the narrative look complete.

## 7. Operational Distance Axis

### 7.1 Why geometry length and operational distance are separated

A dense sourced polyline will have a measured geodesic length that may differ from the rounded published 360 km narrative. Replacing the existing distance axis with raw geometry length would unnecessarily change schedules, ETA, stop timing and deterministic V0 behavior.

V0.1 therefore separates:

- **geometry chainage** — cumulative length of the actual versioned polyline;
- **operational distance** — scenario distance used by the existing engine.

### 7.2 Piecewise calibration anchors

The required calibration anchors are:

```text
San Juan   geometry start  → operational km 0
Tudcum     source anchor   → operational km 205
Veladero   geometry end    → operational km 360
```

Within each interval, route samples map cumulative geometry chainage monotonically onto the operational distance interval.

Conceptual calibration:

```ts
interface DistanceCalibrationAnchor {
  id: string;
  geometryChainageKm: number;
  operationalKm: number;
  evidenceRefs: string[];
}
```

This preserves V0 operational semantics while allowing vehicles to follow a substantially more faithful path.

### 7.3 Derived intermediate anchors

Conconta and Despoblados are required ordering/geometry-validation anchors, but V0.1 does not assign them invented published kilometer values. Their operational kilometer is derived from the calibrated geometry between Tudcum and Veladero.

## 8. Route Samples and Elevation

`route-samples.v1.json` remains the position boundary consumed by the simulation.

Each sample continues to provide at least:

```ts
interface RouteSample {
  distanceKm: number;       // operational distance
  lon: number;
  lat: number;
  elevationM: number;
}
```

V0.1 may add optional audit metadata such as:

```ts
geometryChainageKm?: number;
geometrySegmentId?: string;
geometryClass?: GeometryEvidenceClass;
```

The existing analytical elevation profile remains versioned and is interpolated against **operational distance**, not re-sampled from a new terrain provider in this release.

This keeps geometry work isolated from the separate problem of engineering-grade elevation/profile generation.

## 9. Source Snapshot and Build Pipeline

No external geometry provider is called by the production app.

The build flow is offline/versioned:

```text
official vector / OSM extract
        ↓
source snapshot + source manifest
        ↓
feature selection
        ↓
segment normalization
        ↓
anchor/order validation
        ↓
segment concatenation
        ↓
geometry chainage
        ↓
piecewise operational-km calibration
        ↓
route-samples generation
        ↓
checked-in V0.1 corridor artifacts
        ↓
runtime static fetch
```

Recommended asset structure:

```text
public/data/corridors/veladero/
  corridor.v2.geojson
  segments.v2.geojson
  route-samples.v2.json
  metadata.v2.json
  profile.v1.json
  sources.v2.json

scripts/
  build-road-geometry.mjs
  validate-road-geometry.mjs
```

The exact filenames may be adjusted during planning, but generated output and source lineage must be versioned.

Raw country-wide source datasets should not be committed solely for convenience. Prefer small clipped source snapshots containing only features required to reproduce the corridor, plus source URL, retrieval date, source feature identifiers and licensing information.

## 10. Source Manifest

The geometry build uses a versioned manifest.

Conceptual shape:

```ts
interface GeometrySourceRecord {
  id: string;
  provider: string;
  datasetName: string;
  sourceUrl: string;
  retrievedAt: string;
  role: 'PRIMARY' | 'CORROBORATION' | 'FALLBACK';
  format: 'GeoJSON' | 'Shapefile' | 'WMS' | 'OSM';
  license?: string;
  attribution?: string;
  featureIds?: string[];
  limitations: string[];
}
```

Every production segment must resolve to one or more source/evidence records. Missing source references fail validation.

## 11. Validation and Fail-Closed Rules

### 11.1 Structural geometry validation

The validator must reject:

- empty geometries;
- invalid coordinate pairs;
- reversed corridor order;
- non-monotonic operational distance;
- duplicate/disconnected segments that are silently concatenated;
- unknown evidence/source references;
- source segments with no declared geometry class;
- `PUBLIC_ROAD` segments sourced only from an unsupported reconstruction record.

### 11.2 Anchor validation

The generated Veladero route must preserve this order:

```text
San Juan → Tudcum → Conconta → Despoblados → Veladero
```

Anchor tolerances are data-quality checks only, never safety/navigation tolerances.

Each anchor declares `maxDistanceToRouteKm` in the manifest. The default for a named locality or mountain-pass anchor is **2 km**. A tolerance above 2 km and up to **5 km** is allowed only when the source feature represents a broad geographic passage rather than a precise point, and the manifest must state the reason. Values above 5 km fail validation.

### 11.3 Distance validation

Required invariants:

- operational start = 0 km;
- Tudcum calibration = 205 km;
- operational end = 360 km;
- route-sample distance is strictly non-decreasing;
- geometry chainage is strictly non-decreasing;
- measured polyline length must remain plausibly consistent with the published ~360 km road narrative.

A default acceptance band of ±10% around 360 km may be used as a coarse corruption detector. It is not a claim that the source geometry is survey-grade.

### 11.4 Connectivity validation

Adjacent sourced segments must connect within **250 m** by default.

If the endpoint gap exceeds 250 m:

- CI/build must not silently draw a straight bridge as `PUBLIC_ROAD`;
- the missing connection must become an explicit `RECONSTRUCTED_ACCESS` or `APPROXIMATE_APPROACH` segment with both endpoint anchors, method and provenance;
- a gap greater than **2 km** fails validation unless the manifest explicitly defines that gap itself as a reconstructed/approximate segment and documents why no better source geometry is available.

These numbers are geometry-integrity checks, not navigation or access tolerances.

### 11.5 No giant unsupported chords

The V0 visual defect must not return.

For derived high-mountain geometry, the default `maxDerivedChordKm` is **5 km**. A longer straight derived chord fails validation unless the manifest explicitly whitelists that segment and ties the exception to evidence showing that the geometry is genuinely source-backed or that no higher-fidelity geometry is available.

Source-backed line segments are not simplified merely to satisfy this rule; the guard applies to **derived bridging chords**, not to legitimate source geometry.

This is a geometry-quality guard, not a routing/safety assertion.

## 12. Simulation Compatibility

The existing engine remains unchanged unless a small adapter contract is required to consume the new route-sample metadata.

V0.1 must preserve:

- 24 synthetic operational vehicles;
- seeded schedule generation;
- vehicle categories;
- departure times;
- synthetic speed profiles;
- planned-stop semantics;
- project dwell/return logic;
- weather-at-passage semantics;
- event ordering;
- playback controls;
- background traffic semantics.

Only vehicle **spatial position along the corridor** is expected to change.

A regression test should compare non-positional operational outputs before/after the geometry upgrade for a fixed seed and selected times.

## 13. Cesium Rendering

V0.1 renders corridor geometry by evidence class.

Recommended visual grammar:

```text
PUBLIC_ROAD            solid line
RECONSTRUCTED_ACCESS   dashed line
APPROXIMATE_APPROACH   dotted / lower-opacity line
```

Constraints:

- geometry should be terrain-following/clamped where supported without changing simulation elevation semantics;
- vehicles remain visually above the surface enough to avoid z-fighting;
- route styling must not overpower project/vehicle symbols;
- line changes must not create a second Viewer or per-frame entity recreation;
- source/evidence class must be available in the Sources surface or a compact legend.

## 14. UI and Provenance

The regional scene should communicate geometry confidence without requiring the user to inspect JSON.

Minimum V0.1 additions:

- a small route-geometry legend or equivalent progressive-disclosure surface;
- Sources drawer entries for the geometry datasets actually used;
- explicit text that publicly mapped mine-access geometry is not current operator navigation;
- OSM attribution/ODbL information when any OSM-derived geometry is included.

No modal or large permanent card should cover significant map area.

## 15. Testing Strategy

### Pure tests

- geometry source manifest parsing;
- source/evidence reference resolution;
- feature selection/normalization;
- segment concatenation;
- geometry chainage calculation;
- piecewise distance calibration;
- route-sample generation;
- anchor order/proximity validation;
- connectivity failure cases;
- geometry-class styling mapping.

### Acceptance tests

For Veladero:

- route starts at San Juan and ends at Veladero;
- Tudcum resolves to operational km 205;
- end resolves to operational km 360;
- Conconta occurs after Tudcum;
- Despoblados occurs after Conconta and before Veladero;
- no unresolved source/evidence refs;
- each segment has a geometry class;
- public-road segments are backed by source geometry;
- deterministic simulation remains deterministic;
- non-positional operational outputs remain stable for the fixed V0 seed.

### Browser QA

Production/browser review must verify:

- the Veladero line follows visible road/mountain curvature instead of giant diagonal chords;
- evidence-class styles are distinguishable but subdued;
- vehicles remain on/near the displayed corridor throughout playback;
- project/corridor/vehicle selection still works;
- Sources drawer remains readable at desktop/tablet/mobile widths;
- no new 404/runtime source fetch occurs under the GitHub Pages base path.

Headless CI inability to initialize full WebGL must continue to fail over gracefully; real-browser production review remains required for final 3D visual acceptance.

## 16. Licensing and Attribution

For every source snapshot the manifest records the available source licence/attribution terms.

OpenStreetMap data is distributed under ODbL and requires attribution. If OSM geometry is incorporated into a versioned corridor artifact:

- the artifact/source manifest must carry an ODbL notice and OpenStreetMap attribution;
- repository documentation must distinguish **code licensing** from **data licensing** rather than implying that the repository MIT licence relicenses OSM-derived data;
- the interactive map must retain visible OpenStreetMap attribution and a path to licence information;
- redistribution/share-alike obligations applicable to the resulting database or derivative database must be respected.

Official datasets are not assumed to have interchangeable licences. Their published licensing metadata is recorded individually during implementation.

No source is ingested merely because it is technically downloadable.

## 17. Delivery Sequence

V0.1 implementation proceeds in this order:

1. establish the source manifest and source-extraction rules;
2. resolve official public-road geometry for the San Juan → Tudcum portion;
3. resolve publicly mapped/corroborated Tudcum → Conconta → Despoblados → Veladero geometry;
4. retain explicit reconstruction only where source geometry is insufficient;
5. assemble and validate segment geometry;
6. build piecewise-calibrated route samples;
7. prove simulation compatibility;
8. render evidence-class styles and provenance UI;
9. run full CI/data/claims/browser QA;
10. deploy and perform real-browser Veladero playback review;
11. only then decide whether to apply the pattern to Hualilán and Los Azules.

## 18. Acceptance Definition

V0.1 Veladero is accepted when all of the following are true:

- the corridor no longer uses sparse unsourced chords where official/publicly mapped road geometry is available;
- every segment has explicit source lineage and geometry class;
- public-road geometry is sourced official-first;
- OSM, if used, is a documented fallback/completion source with attribution;
- unsupported access remains visibly/semantically reconstructed or approximate;
- the operational distance axis remains 0 → 205 → 360 km at the required anchors;
- vehicles follow the new geometry while preserving V0 operational timing/state semantics;
- no runtime geometry provider is required;
- automated validation and tests pass;
- the public GitHub Pages build loads all geometry/data successfully;
- a real WebGL browser review confirms the route visually follows the terrain/road network materially better than V0;
- no new claim of operator verification, navigation suitability, road status, authorization, transitability or safety is introduced.

## 19. Deferred Work

After Veladero V0.1 is validated, the same architecture may be applied independently to:

- Hualilán;
- Los Azules.

A later release may improve elevation with versioned DEM/terrain sampling, but that is intentionally separate from this geometry pass.
