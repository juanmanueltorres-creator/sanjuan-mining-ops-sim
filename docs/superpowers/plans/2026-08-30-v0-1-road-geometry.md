# San Juan Mining Ops Sim — V0.1 Road Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use strict RED → GREEN → REFACTOR. Do not activate Veladero V2 until its source, geometry, and regression gates are green.

**Goal:** Replace Veladero's sparse V0 route chords with a dense, versioned, official-first hybrid road/access geometry while preserving the existing 0→205→360 km operational axis, all schedule/state/ETA semantics, provenance boundaries, and static-runtime architecture.

**Architecture:** Keep operational distance and road-class segments separate from physical geometry. New V2 source snapshots and a geometry-source manifest build `segments.v2.geojson`, `corridor.v2.geojson`, and dense `route-samples.v2.json`. The loader activates V2 only for Veladero; Hualilán and Los Azules remain V1. Cesium renders geometry segments by evidence class while vehicles continue to move from operational `distanceKm` through `routeSamples`.

**Tech Stack:** TypeScript + React 19 + Vite 7 + Vitest, Node 22 ESM data scripts, CesiumJS 1.132, Zod, static JSON/GeoJSON, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-v0-1-road-geometry-design.md`

## Global constraints

- Branch: `feat/v0.1-road-geometry`; never implement on `main`.
- Veladero only in the first pass. Hualilán and Los Azules assets remain unchanged.
- Preserve the operational axis exactly: San Juan = `0 km`, Tudcum = `205 km`, Veladero = `360 km`.
- Preserve current Veladero operational segments exactly: `0–52`, `52–140`, `140–205`, `205–260`, `260–340`, `340–360`, including road classes and synthetic speed behavior.
- `segmentId` on `RouteSample` remains the **operational** segment id. Geometry provenance uses separate `geometrySegmentId` / `geometryClass` metadata.
- Do not add Conconta or Despoblados to `CorridorDefinition.nodes`; doing so would create new `PASS_NODE` events and violate non-positional compatibility. They are build/QA anchors only.
- Reuse `profile.v1.json`; do not regenerate weather or elevation in V0.1.
- The checked-in V0 weather snapshot remains immutable and still resolves by corridor + operational distance/time. Document that it was generated for the V0 run and is reused unchanged to preserve run semantics.
- No external road/network calls at runtime. DNV/IGN/UNIDE/Overpass are acquisition-time only.
- Overall Veladero `geometryClass` remains conservative `RECONSTRUCTED_ACCESS`; per-geometry-segment classes drive styling and provenance.
- `PUBLIC_ROAD` requires source geometry. A missing connection cannot be silently bridged as public road.
- Anchor tolerance: default 2 km; >2 km and ≤5 km requires documented broad-feature reason; >5 km fails.
- Adjacent source-segment connection tolerance: 250 m.
- Gap >2 km fails unless represented explicitly as `RECONSTRUCTED_ACCESS`/`APPROXIMATE_APPROACH` with method + provenance.
- Derived high-mountain chord default max: 5 km unless explicitly evidence-backed and documented.
- Measured V2 polyline chainage coarse guard: 324–396 km.
- Runtime remains one Cesium `Viewer`, one primary `CustomDataSource`, persistent vehicle/background entities.
- Do not claim operator routing, navigation suitability, road status, authorization, closure, or safety.

---

## Task 1 — Extend contracts and schemas for geometry provenance

**Files**
- Modify: `src/domain/contracts.ts`
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/schemas.test.ts`

**Purpose:** Add optional geometry audit metadata without changing existing V1 contracts or operational movement semantics.

- [ ] **Step 1: Write RED schema tests**

Add a valid mixed-evidence corridor fixture and require optional geometry fields to survive parsing:

```ts
const parsed = parseCorridor({
  ...validCorridor,
  geometrySegments: [{
    id: 'veladero-public-01',
    corridorId: 'veladero',
    geometryClass: 'PUBLIC_ROAD',
    geometry: { type: 'LineString', coordinates: [[-68.53,-31.53],[-68.60,-31.30]] },
    sourceFeatureIds: ['dnv:rn40:1'],
    evidenceRefs: ['dnv-routes'],
    sourceDatasetId: 'dnv-rutas-nacionales-20260830',
    sourceRetrievedAt: '2026-08-30',
    sourceLicense: 'Otra (Abierta)',
    limitations: ['Reference geometry; not a live road-status source.'],
  }],
  routeSamples: [{
    distanceKm: 10,
    lon: -68.6,
    lat: -31.3,
    elevationM: 800,
    segmentId: 'veladero-01',
    geometryChainageKm: 9.8,
    geometrySegmentId: 'veladero-public-01',
    geometryClass: 'PUBLIC_ROAD',
  }],
});
expect(parsed.geometrySegments?.[0].geometryClass).toBe('PUBLIC_ROAD');
expect(parsed.routeSamples[0].geometrySegmentId).toBe('veladero-public-01');
```

Also retain a V1 fixture with no `geometrySegments` and assert it still parses.

Run:

```bash
npm test -- --run src/domain/schemas.test.ts
```

Expected RED: new fields are missing/rejected.

- [ ] **Step 2: Add exact contracts**

```ts
export type GeometrySourceRole = 'PRIMARY' | 'CORROBORATION' | 'FALLBACK';
export type GeometrySourceFormat = 'GeoJSON' | 'Shapefile' | 'WMS' | 'OSM';

export interface GeometrySourceRecord {
  id: string;
  provider: string;
  datasetName: string;
  sourceUrl: string;
  retrievedAt: string;
  role: GeometrySourceRole;
  format: GeometrySourceFormat;
  license?: string;
  attribution?: string;
  featureIds: string[];
  limitations: string[];
}

export interface RoadGeometrySegment {
  id: string;
  corridorId: string;
  geometryClass: Exclude<GeometryEvidenceClass, 'PROJECT_LOCATION'>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  sourceFeatureIds: string[];
  evidenceRefs: string[];
  sourceDatasetId: string;
  sourceRetrievedAt: string;
  sourceLicense?: string;
  limitations: string[];
}
```

Extend `RouteSample`:

```ts
geometryChainageKm?: number;
geometrySegmentId?: string;
geometryClass?: Exclude<GeometryEvidenceClass, 'PROJECT_LOCATION'>;
```

Extend `CorridorDefinition`:

```ts
geometrySegments?: RoadGeometrySegment[];
```

Do **not** alter `CorridorSegment`; it remains the operational speed/timing model.

- [ ] **Step 3: Extend Zod schemas**

Add optional route audit fields and optional `geometrySegments`. Each road geometry segment must have ≥2 valid coordinate pairs, non-empty evidence/source ids, and a non-`PROJECT_LOCATION` class.

- [ ] **Step 4: GREEN and full compatibility check**

```bash
npm test -- --run src/domain/schemas.test.ts src/data/loadOperation.test.ts src/simulation/vehicle.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: add road geometry provenance contracts"
```

---

## Task 2 — Build the pure chainage/calibration geometry library

**Files**
- Create: `scripts/lib/road-geometry.mjs`
- Create: `scripts/lib/road-geometry.test.mjs`

**Purpose:** Make geometry math deterministic/testable and reusable by acquisition/build/validation scripts.

- [ ] **Step 1: Write RED tests for chainage, anchor lookup and calibration**

```js
import { describe, expect, it } from 'vitest';
import {
  buildChainage,
  calibrateOperationalKm,
  interpolateElevation,
  locateAnchor,
  resamplePolyline,
  validateSegmentContinuity,
} from './road-geometry.mjs';

it('builds monotonically increasing geodesic chainage', () => {
  const points = buildChainage([[0,0],[0.01,0],[0.02,0]]);
  expect(points[0].chainageKm).toBe(0);
  expect(points[2].chainageKm).toBeCloseTo(2.224, 2);
});

it('maps chainage piecewise onto the operational 0/205/360 axis', () => {
  const anchors = [
    { geometryChainageKm: 0, operationalKm: 0 },
    { geometryChainageKm: 200, operationalKm: 205 },
    { geometryChainageKm: 355, operationalKm: 360 },
  ];
  expect(calibrateOperationalKm(100, anchors)).toBeCloseTo(102.5, 6);
  expect(calibrateOperationalKm(277.5, anchors)).toBeCloseTo(282.5, 6);
});

it('fails continuity when adjacent source segments are more than 250m apart', () => {
  expect(() => validateSegmentContinuity(
    [[-69.0,-30.0],[-69.001,-30.0]],
    [[-69.01,-30.0],[-69.02,-30.0]],
    250,
  )).toThrow(/gap/i);
});
```

Run:

```bash
npm test -- --run scripts/lib/road-geometry.test.mjs
```

Expected RED: module/functions absent.

- [ ] **Step 2: Implement the minimum pure API**

Export:

```js
haversineMeters(a, b)
buildChainage(coordinates)
interpolateCoordinateAtChainage(points, chainageKm)
resamplePolyline(coordinates, spacingMeters = 250, requiredChainagesKm = [])
locateAnchor(points, anchor)
calibrateOperationalKm(chainageKm, calibrationAnchors)
interpolateElevation(profileSamples, operationalKm)
operationalSegmentAt(operationalSegments, operationalKm)
validateSegmentContinuity(previousCoordinates, nextCoordinates, toleranceMeters = 250)
validateAnchorOrder(locatedAnchors)
```

Rules:
- Earth-distance math uses haversine; no provider/geocoder dependency.
- `buildChainage` rejects fewer than 2 coordinates, NaN/out-of-range lon/lat, and duplicate-only geometry.
- `calibrateOperationalKm` rejects non-monotonic geometry chainage or operational km.
- `resamplePolyline` includes first/end points and all supplied exact required chainages in sorted order.
- `interpolateElevation` reproduces the piecewise-linear semantics of `profile.v1.json`.

- [ ] **Step 3: Add exact boundary tests**

Require:
- exact `0`, `205`, `360` output when corresponding chainages are supplied;
- profile interpolation reproduces the V1 elevation anchors at `52/140/205/260/300/340/360`;
- anchor order rejects Conconta before Tudcum or Veladero before Despoblados.

- [ ] **Step 4: GREEN/commit**

```bash
npm test -- --run scripts/lib/road-geometry.test.mjs
git add scripts/lib
git commit -m "feat: add deterministic road geometry math"
```

---

## Task 3 — Acquire and freeze official-first Veladero source snapshots

**Files**
- Create: `scripts/acquire-road-sources.mjs`
- Create: `scripts/acquire-road-sources.test.mjs`
- Create: `.github/workflows/road-geometry-acquisition.yml`
- Create after acquisition: `public/data/corridors/veladero/source-snapshots/dnv-national-roads.v1.geojson`
- Create after acquisition: `public/data/corridors/veladero/source-snapshots/ign-provincial-roads.v1.geojson`
- Create after acquisition only if used: `public/data/corridors/veladero/source-snapshots/osm-high-mountain-access.v1.geojson`
- Create: `public/data/corridors/veladero/sources.v2.json`

**Purpose:** Freeze small, auditable source extracts. Runtime never fetches these providers.

- [ ] **Step 1: RED acquisition-normalization tests**

Test pure helpers inside the acquisition module with fixture responses:

```js
expect(normalizeWfsFeatureCollection({ type:'FeatureCollection', features:[feature] }).features).toHaveLength(1);
expect(normalizeOverpassWays({ elements:[{ type:'way', id:123, tags:{highway:'track'}, geometry:[{lon:-69.6,lat:-29.9},{lon:-69.7,lat:-29.8}]}] })
  .features[0].properties.osmWayId).toBe(123);
```

Require clipping to reject features outside the configured acquisition bboxes.

- [ ] **Step 2: Implement acquisition endpoints exactly**

Use the CKAN API to resolve current download URLs rather than hard-coding a transient WFS URL:

```js
const OFFICIAL_RESOURCES = [
  {
    id: 'dnv-rutas-nacionales-20260830',
    resourceId: '98a9ee1b-321d-4b68-b00e-bf44ae448e2c',
    provider: 'Dirección Nacional de Vialidad / Datos Argentina',
  },
  {
    id: 'ign-rutas-provinciales-2016-20260830',
    resourceId: '903edc8b-da5b-4f3e-b555-eef41b89c3f3',
    provider: 'Instituto Geográfico Nacional / Datos Argentina',
  },
];
const CKAN_RESOURCE = 'https://datos.gob.ar/api/3/action/resource_show?id=';
```

For a WFS URL returned by CKAN, replace its `outputFormat` with `application/json` and remove restrictive `maxFeatures` or set it high enough before parsing. Clip to a regional San Juan→Tudcum bbox; do not commit nationwide source files.

High-mountain OSM acquisition is fallback/completion only:

```text
POST https://overpass-api.de/api/interpreter
fallback: https://overpass.kumi.systems/api/interpreter

[out:json][timeout:120];
way["highway"](-30.25,-70.10,-29.25,-69.20);
out tags geom;
```

Normalize OSM ways to GeoJSON retaining exact way ids and tags. Do not infer `PUBLIC_ROAD` from `highway=*` alone for the mine-access leg.

- [ ] **Step 3: Create manual acquisition workflow**

`.github/workflows/road-geometry-acquisition.yml` is `workflow_dispatch` only, Node 22, `contents: read`, and uploads `artifacts/road-geometry-acquisition/` as an artifact. It is not part of CI and does not mutate the repository.

Commands:

```yaml
- run: npm install --no-audit --no-fund
- run: node scripts/acquire-road-sources.mjs veladero
- uses: actions/upload-artifact@v4
  with:
    name: veladero-road-sources
    path: artifacts/road-geometry-acquisition/
```

- [ ] **Step 4: Run acquisition and inspect source inventory**

```bash
node scripts/acquire-road-sources.mjs veladero
```

If local networking is unavailable, dispatch the acquisition workflow and download its artifact. Inspect `source-inventory.json` before committing any geometry.

Source hierarchy for final selection:
1. DNV vector for national-road sections.
2. IGN provincial vector for provincial/public-road sections.
3. UNIDE (`https://unide.sanjuan.gob.ar/geoserver/wms`) recorded as `CORROBORATION` only unless a real vector layer is independently resolved.
4. OSM fallback/completion.

- [ ] **Step 5: Finalize `sources.v2.json` with real ids — no placeholders**

Manifest anchors are fixed:

```json
[
  {"id":"san-juan","lat":-31.5375,"lon":-68.5364,"operationalKm":0,"maxDistanceToRouteKm":2},
  {"id":"tudcum","lat":-30.188378113,"lon":-69.270283595,"operationalKm":205,"maxDistanceToRouteKm":2},
  {"id":"conconta","lat":-29.9595,"lon":-69.6293,"maxDistanceToRouteKm":2,"sourceFeatureId":"osm-node-4564110594"},
  {"id":"despoblados","lat":-29.4963,"lon":-69.7718,"maxDistanceToRouteKm":2,"sourceFeatureId":"osm-node-4564115590"},
  {"id":"veladero","lat":-29.36833,"lon":-69.95222,"operationalKm":360,"maxDistanceToRouteKm":2}
]
```

The final manifest must contain the **actual selected** DNV/IGN/OSM feature ids discovered in the acquisition artifact. If official features are unavailable or do not connect, record the gap as an explicit reconstructed segment; do not fabricate an official feature id.

Required source records include:
- DNV national roads: role `PRIMARY`, format `GeoJSON`, catalog license recorded as `Otra (Abierta)` with eventual/stale-reference limitation.
- IGN provincial roads 2016: role `PRIMARY`, format `GeoJSON`, license as published, with explicit 2016-age limitation.
- UNIDE: role `CORROBORATION`, format `WMS`, no fake vector feature ids.
- OSM only if used: role `FALLBACK`, format `OSM`, license `ODbL 1.0`, attribution `© OpenStreetMap contributors`, exact way ids.
- Barrick technical report: evidence/narrative constraint, never geometry-source identity.

- [ ] **Step 6: GREEN acquisition tests and commit source freeze**

```bash
npm test -- --run scripts/acquire-road-sources.test.mjs
git add scripts/acquire-road-sources* .github/workflows/road-geometry-acquisition.yml public/data/corridors/veladero/source-snapshots public/data/corridors/veladero/sources.v2.json
git commit -m "data: freeze Veladero road geometry sources"
```

**STOP condition:** If no defensible connected path can be constructed through `Tudcum → Conconta → Despoblados → Veladero` without an undocumented >2 km gap, stop implementation and report the evidence gap instead of generating V2.

---

## Task 4 — Build and validate Veladero V2 artifacts

**Files**
- Create: `scripts/build-road-geometry.mjs`
- Create: `scripts/build-road-geometry.test.mjs`
- Create: `scripts/validate-road-geometry.mjs`
- Create generated: `public/data/corridors/veladero/segments.v2.geojson`
- Create generated: `public/data/corridors/veladero/corridor.v2.geojson`
- Create generated: `public/data/corridors/veladero/route-samples.v2.json`
- Create generated: `public/data/corridors/veladero/metadata.v2.json`
- Modify: `package.json`

**Purpose:** Convert frozen source features into a dense route without changing operational semantics.

- [ ] **Step 1: RED build tests**

Use tiny synthetic source segments and require:

```js
const built = buildRoadGeometry(fixtureManifest, fixtureSources, v1Metadata, v1Profile);
expect(built.routeSamples[0].distanceKm).toBe(0);
expect(built.routeSamples.find((s) => s.geometryAnchorId === 'tudcum')?.distanceKm).toBe(205);
expect(built.routeSamples.at(-1).distanceKm).toBe(360);
expect(built.metadata.segments).toEqual(v1Metadata.segments);
expect(built.metadata.nodes).toEqual(v1Metadata.nodes);
```

Also assert a 3 km undocumented gap throws, and a derived high-mountain chord >5 km throws.

- [ ] **Step 2: Implement builder pipeline**

`build-road-geometry.mjs veladero` must:
1. read `sources.v2.json` + checked-in source snapshots;
2. select exact manifest feature ids;
3. orient each selected geometry consistently San Juan→Veladero;
4. concatenate source/derived geometry segments with explicit connectivity checks;
5. compute cumulative geometry chainage;
6. locate San Juan/Tudcum/Conconta/Despoblados/Veladero and validate order/tolerance;
7. use calibration anchors `0 → 0`, `Tudcum chainage → 205`, `end → 360`;
8. resample at default 250 m geometry-chainage spacing **plus exact segment/calibration boundaries**;
9. map every sample to operational km;
10. interpolate elevation from existing `profile.v1.json` by operational km;
11. assign existing operational `segmentId` from V1 operational segments;
12. assign separate `geometrySegmentId` + `geometryClass` from the physical segment;
13. emit V2 artifacts.

Example route sample:

```json
{
  "distanceKm": 205,
  "lon": -69.27028,
  "lat": -30.18838,
  "elevationM": 1931,
  "segmentId": "veladero-04",
  "geometryChainageKm": 201.7,
  "geometrySegmentId": "veladero-access-01",
  "geometryClass": "RECONSTRUCTED_ACCESS"
}
```

Do not add `geometryAnchorId` to the production contract unless necessary; tests may locate anchors from manifest + nearest sample.

- [ ] **Step 3: Emit `segments.v2.geojson` and conservative combined geometry**

`segments.v2.geojson` is a `FeatureCollection`. Every feature has:

```json
{
  "id":"veladero-public-01",
  "corridorId":"veladero",
  "geometryClass":"PUBLIC_ROAD",
  "sourceDatasetId":"dnv-rutas-nacionales-20260830",
  "sourceFeatureIds":["actual-source-id"],
  "evidenceRefs":["actual-evidence-id"],
  "sourceRetrievedAt":"2026-08-30",
  "limitations":["Reference geometry; no live road-status inference."]
}
```

`corridor.v2.geojson` contains the concatenated route and keeps overall `geometryClass: "RECONSTRUCTED_ACCESS"` because the corridor is mixed-evidence.

`metadata.v2.json` copies the six V1 operational segments and Tudcum node unchanged; update evidence/limitations to describe the V2 geometry method.

- [ ] **Step 4: Implement dedicated validator**

`node scripts/validate-road-geometry.mjs veladero` must fail unless:
- all source ids/evidence refs resolve;
- all geometry classes valid;
- all source feature ids are present in frozen source snapshots;
- anchor order is San Juan→Tudcum→Conconta→Despoblados→Veladero;
- anchor tolerances satisfy manifest limits;
- source-segment gaps ≤250 m or explicit reconstructed gap feature exists;
- undocumented gap >2 km absent;
- derived high-mountain chord >5 km absent unless explicit exception;
- total chainage between 324 and 396 km;
- operational samples monotonically cover exactly 0→360;
- geometry chainage monotonic;
- nearest Tudcum sample operational km equals 205;
- V2 operational segments/nodes deep-equal V1 operational segments/nodes.

- [ ] **Step 5: Generate real V2 and inspect metrics**

```bash
npm run acquire:road-sources -- veladero   # only when refreshing sources
npm run build:road-geometry -- veladero
npm run validate:road-geometry -- veladero
```

Add package scripts:

```json
"acquire:road-sources": "node scripts/acquire-road-sources.mjs",
"build:road-geometry": "node scripts/build-road-geometry.mjs",
"validate:road-geometry": "node scripts/validate-road-geometry.mjs"
```

Print a concise build report: source segment count, geometry vertex count, route sample count, measured chainage, Tudcum chainage, geometry class counts, max explicit gap/chord.

- [ ] **Step 6: GREEN/commit**

```bash
npm test -- --run scripts/lib/road-geometry.test.mjs scripts/build-road-geometry.test.mjs
npm run validate:road-geometry -- veladero
git add scripts package.json public/data/corridors/veladero
git commit -m "feat: build validated Veladero V2 geometry"
```

---

## Task 5 — Activate Veladero V2 in the static loader and data gate

**Files**
- Modify: `src/data/loadOperation.ts`
- Modify: `src/data/loadOperation.test.ts`
- Modify: `scripts/validate-data.mjs`
- Modify: `package.json`

**Purpose:** Switch only Veladero to V2 while retaining an explicit V1 loading path for regression comparison.

- [ ] **Step 1: RED loader version test**

Add:

```ts
const data = await loadStaticOperationData(fakeFetch);
expect(requestedUrls).toContain('/data/corridors/veladero/metadata.v2.json');
expect(requestedUrls).toContain('/data/corridors/veladero/segments.v2.geojson');
expect(requestedUrls).toContain('/data/corridors/veladero/sources.v2.json');
expect(requestedUrls).toContain('/data/corridors/hualilan/metadata.v1.json');
expect(requestedUrls).toContain('/data/corridors/los-azules/metadata.v1.json');
```

And require explicit legacy loading:

```ts
const v1 = await loadStaticOperationData(fakeFetch, { veladero: 'v1' });
expect(v1.corridors.find((c) => c.id === 'veladero')?.geometrySegments).toBeUndefined();
```

Expected RED: loader hardcodes V1.

- [ ] **Step 2: Implement version map**

```ts
export type CorridorAssetVersion = 'v1' | 'v2';
export type CorridorAssetOverrides = Partial<Record<typeof CORRIDOR_IDS[number], CorridorAssetVersion>>;

const DEFAULT_CORRIDOR_ASSET_VERSIONS = {
  hualilan: 'v1',
  veladero: 'v2',
  'los-azules': 'v1',
} as const;
```

`loadStaticOperationData(fetcher, overrides = {})` merges defaults with overrides. For V2 Veladero fetch:
- `metadata.v2.json`
- `corridor.v2.geojson`
- `profile.v1.json`
- `route-samples.v2.json`
- `segments.v2.geojson`
- `sources.v2.json`

Parse `segments.v2.geojson` into `corridor.geometrySegments` and expose validated geometry source records as:

```ts
export interface StaticOperationData {
  projects: ProjectDefinition[];
  corridors: CorridorDefinition[];
  evidence: EvidenceRef[];
  geometrySources: GeometrySourceRecord[];
}
```

For V1 corridors, `geometrySources` contributes nothing and `geometrySegments` stays absent.

Validate every V2 segment's `sourceDatasetId`, source feature ids, and evidence refs fail-closed.

- [ ] **Step 3: Make `validate:data` the umbrella gate**

Change package script to:

```json
"validate:data": "node scripts/validate-data.mjs && node scripts/validate-road-geometry.mjs veladero"
```

Update `validate-data.mjs` with the same asset version map so it reads Veladero V2 and the other bundles V1.

- [ ] **Step 4: GREEN/full gate**

```bash
npm test -- --run src/data/loadOperation.test.ts src/domain/schemas.test.ts
npm run validate:data
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/data scripts/validate-data.mjs package.json
git commit -m "feat: activate Veladero V2 corridor assets"
```

---

## Task 6 — Preserve operational behavior and render geometry confidence

**Files**
- Create: `src/map/routeGeometryStyle.ts`
- Create: `src/map/routeGeometryStyle.test.ts`
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/ui/AnalysisDrawer.tsx`
- Modify: `src/ui/AnalysisDrawer.test.tsx`
- Modify: `src/ui/task9.css`
- Create: `src/qa/v01RoadGeometryAcceptance.test.ts`

**Purpose:** Prove V1→V2 changes spatial positions only, then make geometry evidence visible without increasing UI obstruction.

- [ ] **Step 1: RED V1 vs V2 non-positional regression test**

Load both bundles through the loader:

```ts
const v1Data = await loadStaticOperationData(fileFetcher, { veladero: 'v1' });
const v2Data = await loadStaticOperationData(fileFetcher);
const runArtifacts = await loadStaticRunArtifacts(fileFetcher);
const traffic = await loadTrafficCalibration(fileFetcher);
const v1Spec = buildV0OperationSpec(v1Data, runArtifacts.run.seed, traffic);
const v2Spec = buildV0OperationSpec(v2Data, runArtifacts.run.seed, traffic);
```

At `360, 540, 720, 960, 1200`, compare a signature that includes:
- sim time;
- vehicle `id/type/corridorId/state/direction/distanceKm/segmentId/etaMinute/environmentContext`;
- metrics;
- corridor states;
- operational events;
- context events;

and explicitly excludes only:
- `vehicle.position`;
- `vehicle.elevationM` if floating interpolation makes exact equality noisy.

Require exact equality of the signature. Also assert at least one Veladero vehicle position differs between V1 and V2 at a mid-run checkpoint, proving the new geometry is actually being used.

**Do not add Conconta/Despoblados runtime nodes to make this test pass.**

- [ ] **Step 2: RED geometry-style test**

```ts
expect(routeGeometryStyle('PUBLIC_ROAD')).toMatchObject({ pattern:'solid' });
expect(routeGeometryStyle('RECONSTRUCTED_ACCESS')).toMatchObject({ pattern:'dash' });
expect(routeGeometryStyle('APPROXIMATE_APPROACH')).toMatchObject({ pattern:'dot' });
```

Implement a renderer-agnostic style descriptor containing pattern, width, opacity, and dash length/pattern; Cesium conversion stays in `CesiumStage`.

- [ ] **Step 3: Render physical geometry segments, not one route-sample polyline**

In `addStaticTerritory`:
- if `corridor.geometrySegments` exists, add one static polyline entity per geometry segment;
- otherwise preserve the current single-polyline V1 fallback;
- use `PolylineDashMaterialProperty` for reconstructed/approximate classes;
- use `clampToGround: true` for route polylines where supported;
- keep entity ids stable, e.g. `corridor:veladero:veladero-public-01`;
- do not recreate on simulation ticks.

Vehicle/background positions still use `corridor.routeSamples`, so both automatically follow V2.

- [ ] **Step 4: RED Sources drawer provenance test**

Require a V2 fixture to show:
- `ROUTE GEOMETRY`;
- `PUBLIC ROAD · SOURCED`;
- `RECONSTRUCTED ACCESS`;
- `APPROXIMATE APPROACH` only when present;
- source provider/dataset records;
- OSM `ODbL`/attribution when an OSM source exists;
- text matching `not current operator navigation`.

- [ ] **Step 5: Implement compact geometry provenance UI**

Add one Sources section, not a new permanent panel. Reuse `EvidenceCard`-style compact disclosure. Render source URL/license/limitations from `operation.geometrySources` and a three-row mini legend. Do not duplicate global OSM basemap credit as if it were route evidence; route OSM evidence is listed only if V2 actually uses OSM geometry.

Keep mobile drawer constraints (`10px` side insets, internal scrolling, ≤54vh) unchanged unless visual QA proves a necessary adjustment.

- [ ] **Step 6: GREEN/commit**

```bash
npm test -- --run src/qa/v01RoadGeometryAcceptance.test.ts src/map/routeGeometryStyle.test.ts src/ui/AnalysisDrawer.test.tsx src/map/cesiumAdapter.test.ts
npm run validate:data
npm run build
git add src/map src/ui src/qa
git commit -m "feat: render sourced Veladero road geometry"
```

---

## Task 7 — Final acceptance, documentation, PR and production smoke

**Files**
- Modify: `README.md`
- Modify: `docs/data-sources.md`
- Create: `docs/qa/v0-1-road-geometry-acceptance.md`
- Modify only if required by QA: `scripts/visual-qa.mjs`, `src/ui/task9.css`

**Purpose:** Close V0.1 with reproducible provenance and without claiming a WebGL visual result the headless runner cannot actually inspect.

- [ ] **Step 1: Full automated gate**

Run from the feature branch:

```bash
npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

All must pass together on the same HEAD.

Expected suite additions:
- geometry math tests;
- acquisition normalization tests;
- V2 loader tests;
- V1/V2 non-positional equivalence;
- source/evidence resolution;
- geometry styling/UI provenance.

- [ ] **Step 2: Record quantitative V2 acceptance**

`docs/qa/v0-1-road-geometry-acceptance.md` records actual measured values printed by `validate:road-geometry`:
- V2 vertex count and route-sample count;
- measured geometry chainage;
- Tudcum geometry chainage and exact operational km 205 calibration;
- distance from route to each required anchor;
- count by `PUBLIC_ROAD / RECONSTRUCTED_ACCESS / APPROXIMATE_APPROACH`;
- max explicit source gap;
- max derived chord;
- exact source dataset ids and retrieval date;
- V1/V2 non-positional regression result;
- automated test/build/visual-layout results.

Do not fill these with expected values before the validator reports them.

- [ ] **Step 3: Update human-facing provenance**

README changes:
- describe Veladero as V2 official-first hybrid geometry;
- say public-road sections use sourced geometry where available;
- say publicly mapped high-mountain access is not current operator navigation;
- preserve `Real territory · modelled environment · synthetic operation.`;
- keep the limitation that Hualilán/Los Azules are still V1 reconstructed corridors.

`docs/data-sources.md` must list DNV, IGN/provincial, UNIDE corroboration, OSM only if actually used, exact frozen snapshot filenames, retrieval dates, licenses/limitations, and the `0/205/360` calibration rule.

Explicitly document that the immutable 2026-08-30 weather artifact is reused unchanged by operational distance and is not regenerated against V2 geometry in this release.

- [ ] **Step 4: Claims audit**

Review every match from:

```bash
npm run audit:claims
```

No positive claim may state that:
- V2 is an operator-verified route;
- mine access is current/live;
- road is open/closed/safe/unsafe;
- OSM geometry is operator evidence;
- the analytical elevation/weather artifacts are navigation/safety data.

- [ ] **Step 5: Open draft PR after green gate**

PR title:

```text
feat: upgrade Veladero road geometry to V0.1
```

PR body must summarize:
- official-first source hierarchy;
- actual geometry sources used;
- V1→V2 operational regression result;
- chainage/anchor QA;
- UI evidence classes;
- known limitations;
- full CI evidence.

Do not merge yet.

- [ ] **Step 6: Pre-merge review**

Review changed files for:
- unresolved source ids;
- giant derived chords;
- accidental V1 deletion;
- changes to operational segments/speeds/schedule;
- added operational nodes;
- hidden OSM attribution;
- runtime network fetches to road providers.

Any Important/Critical finding returns to RED→GREEN and reruns the full gate.

- [ ] **Step 7: Merge only after explicit user approval**

After merge, existing `.github/workflows/pages.yml` deploys `main` automatically.

- [ ] **Step 8: Real production smoke**

On GitHub Pages, verify with a WebGL-capable browser:
- `Operational data unavailable` is absent;
- Veladero visibly follows a curved road/access path rather than V0 giant chords;
- 24 synthetic units still move and return;
- Veladero vehicles stay on the V2 line;
- Sources shows geometry provenance and limitations;
- map remains dominant and no UI clips at desktop/mobile;
- OSM attribution remains visible.

Capture one production screenshot for the V0.1 acceptance record. The headless CI fallback does **not** substitute for this WebGL smoke.

---

## Expected commit sequence

```text
feat: add road geometry provenance contracts
feat: add deterministic road geometry math
data: freeze Veladero road geometry sources
feat: build validated Veladero V2 geometry
feat: activate Veladero V2 corridor assets
feat: render sourced Veladero road geometry
docs: record V0.1 road geometry acceptance
```

Keep commits smaller if a RED/GREEN cycle naturally produces a narrower unit. Do not combine source acquisition, geometry generation, loader activation, and Cesium rendering in one commit.

## Definition of done

V0.1 is done only when:

1. Veladero V2 is backed by frozen source snapshots and a resolvable manifest.
2. Required anchors occur in the correct order and within explicit tolerances.
3. The route has no undocumented source gap or giant derived chord.
4. Operational distance remains exactly `0 → 205 → 360 km`.
5. V1 and V2 produce identical non-positional operational behavior at the acceptance checkpoints.
6. Vehicles and background traffic use V2 spatial positions automatically through `routeSamples`.
7. Cesium distinguishes sourced/reconstructed/approximate geometry without recreating entities per frame.
8. Sources exposes real geometry provenance/licensing/limitations.
9. Full tests + data validation + claims audit + build + responsive visual QA are green on one HEAD.
10. A real WebGL production smoke after merge confirms the diagonal-chord defect is materially improved.
