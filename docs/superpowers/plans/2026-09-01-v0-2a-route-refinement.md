# V0.2A Route Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish evidence-aware V2 geometry for Hualilán and Los Azules while preserving their existing operational distance axes, simulation semantics, profiles, events and ETA behavior.

**Architecture:** Reuse the existing Veladero V2 geometry pipeline instead of creating a second route system. Generalize the builder, validator and loader from a Veladero-only assumption to any of the three active corridors; each corridor continues to carry frozen source snapshots, an explicit `sources.v2.json` assembly manifest, geometry-classed segments and a calibrated operational distance axis independent from measured physical chainage.

**Tech Stack:** Node.js ESM authoring scripts, GeoJSON/JSON versioned artifacts, TypeScript/Vitest runtime loader tests, existing DNV/IGN WFS + OSM Overpass authoring sources, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-01-v0-2-territorial-operations-ui-design.md`

## Global Constraints

- Do not change the simulation engine, operational state machine, ETA semantics, environment model or evidence rules.
- Hualilán operational distance remains exactly `0 → 120 km`; Los Azules remains exactly `0 → 276 km`.
- Existing V1 `segments`, `nodes`, `totalDistanceKm` and analytical elevation profiles remain the operational contract.
- Physical V2 chainage may differ from operational distance and must never silently replace it.
- Geometry classes remain `PUBLIC_ROAD`, `RECONSTRUCTED_ACCESS`, `APPROXIMATE_APPROACH`.
- Runtime must never perform automatic routing or pathfinding.
- Source acquisition is authoring-only; runtime and CI validation use checked-in artifacts.
- DNV/IGN source geometry is preferred for public-road legs; OSM is fallback/corroborating geometry where official vector coverage is insufficient; derived connectors must remain explicit.
- No geometry may imply current road condition, safety, access authorization, closure or transitability.
- If source identity/feature continuity cannot be established inside the defined guards, fail closed and do not publish that corridor as V2.

---

### Task 1: Generalize the V2 Geometry Pipeline Without Changing Veladero

**Files:**
- Modify: `scripts/build-road-geometry.mjs`
- Modify: `scripts/validate-road-geometry.mjs`
- Create: `scripts/road-geometry-generic.test.mjs`
- Modify: `src/data/loadOperation.ts`
- Test: `src/data/loadOperation.test.ts` if present; otherwise create `src/data/loadOperation.v2-corridors.test.ts`

**Interfaces:**
- Consumes: `sources.v2.json` with `corridorId`, `anchors`, `sources`, `routeSegments`, `guards`; V1 metadata/profile/route samples.
- Produces: generic `buildRoadGeometry(manifest, sourceDocs, v1Metadata, v1Profile, options)` and `validateRoadGeometry(bundle)` that accept `hualilan`, `veladero`, or `los-azules` based on matching IDs rather than hard-coded Veladero rules.
- Required invariant: every manifest anchor carrying finite `operationalKm` must map to an exact V2 route sample at that same operational kilometre.

- [ ] **Step 1: Write the failing generic builder/validator test**

Create a synthetic Hualilán bundle with a 0 km origin anchor and 120 km destination anchor. The test must demonstrate that the current Veladero-only guards reject it.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGeometry } from './build-road-geometry.mjs';
import { validateRoadGeometry } from './validate-road-geometry.mjs';

const v1Metadata = {
  schemaVersion: 'sanjuan.corridor-metadata/v1',
  id: 'hualilan',
  name: 'San Juan → Hualilán',
  totalDistanceKm: 120,
  geometryClass: 'RECONSTRUCTED_ACCESS',
  segments: [
    { id: 'hualilan-01', corridorId: 'hualilan', startKm: 0, endKm: 120, distanceKm: 120,
      elevationMinM: 650, elevationMaxM: 1700, roadClass: 'mixed', geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [] },
  ],
  nodes: [],
  evidenceRefs: ['route-build'],
  evidence: [{ id: 'route-build', role: 'DERIVED', sourceName: 'fixture', retrievedAt: '2026-09-01', limitations: ['fixture'] }],
  retrievedAt: '2026-09-01',
  limitations: ['fixture'],
};

const manifest = {
  schemaVersion: 'sanjuan.road-geometry-sources/v2',
  corridorId: 'hualilan',
  generatedAt: '2026-09-01T00:00:00Z',
  guards: { sourceConnectionToleranceM: 250, maxUndocumentedGapKm: 2, maxDerivedChordKm: 5, chainageMinKm: 0, chainageMaxKm: 200 },
  anchors: [
    { id: 'san-juan', lon: -68.5364, lat: -31.5375, operationalKm: 0, maxDistanceToRouteKm: 2 },
    { id: 'hualilan', lon: -68.95, lat: -30.73333, operationalKm: 120, maxDistanceToRouteKm: 2 },
  ],
  sources: [{ id: 'fixture-derived', provider: 'fixture', datasetName: 'fixture', sourceUrl: 'fixture', retrievedAt: '2026-09-01', role: 'FALLBACK', format: 'GeoJSON', featureIds: [], limitations: ['fixture'] }],
  evidence: [],
  routeSegments: [{
    id: 'hualilan-derived', corridorId: 'hualilan', geometryClass: 'RECONSTRUCTED_ACCESS', sourceDatasetId: 'fixture-derived', sourceFeatureIds: [], evidenceRefs: ['route-build'],
    derivedGeometry: { type: 'LineString', coordinates: [[-68.5364, -31.5375], [-68.7, -31.1], [-68.95, -30.73333]] },
    limitations: ['fixture'],
  }],
};

const profile = { samples: [{ distanceKm: 0, elevationM: 650 }, { distanceKm: 120, elevationM: 1700 }] };
const built = buildRoadGeometry(manifest, {}, v1Metadata, profile);
assert.equal(built.routeSamples.samples[0].distanceKm, 0);
assert.equal(built.routeSamples.samples.at(-1).distanceKm, 120);
assert.ok(built.routeSamples.samples.some((sample) => sample.distanceKm === 120));
assert.doesNotThrow(() => validateRoadGeometry({
  manifest,
  sourceDocs: {},
  v1Metadata,
  metadata: built.metadata,
  corridor: built.corridor,
  segments: built.segments,
  routeSamples: built.routeSamples,
}));
```

- [ ] **Step 2: Run the test and verify the expected RED**

Run:

```bash
node --test scripts/road-geometry-generic.test.mjs
```

Expected: FAIL because the current implementation says `Unsupported corridor hualilan` and/or requires Veladero/Tudcum km 205.

- [ ] **Step 3: Generalize the builder minimally**

Replace Veladero-specific assertions with manifest/V1 consistency rules:

```js
assert(typeof manifest?.corridorId === 'string' && manifest.corridorId.length > 0, 'corridorId required');
assert(v1Metadata?.id === manifest.corridorId, 'V1 metadata corridor id mismatch');
...
assert(calibrationAnchors.length >= 2, 'Operational calibration requires at least origin and destination anchors');
assert(Math.abs(calibrationAnchors[0].operationalKm) <= EPS, 'Operational calibration must start at 0 km');
assert(
  Math.abs(calibrationAnchors.at(-1).operationalKm - v1Metadata.totalDistanceKm) <= EPS,
  'Operational calibration must end at V1 totalDistanceKm',
);
```

Delete the hard-coded `205` sample assertion. After route samples are built, require every finite operational anchor exactly:

```js
for (const anchor of calibrationAnchors) {
  assert(
    routeSamples.some((sample) => Math.abs(sample.distanceKm - anchor.operationalKm) <= EPS),
    `Generated samples must include exact operational km ${anchor.operationalKm} for anchor ${anchor.id}`,
  );
}
```

- [ ] **Step 4: Generalize the validator minimally**

Replace the hard-coded Veladero ID/order/360/205 rules with:

```js
assert(typeof manifest?.corridorId === 'string' && manifest.corridorId.length > 0, 'manifest corridorId required');
assert(v1Metadata?.id === manifest.corridorId, 'V1 metadata id mismatch');
assert(metadata?.id === manifest.corridorId, 'V2 metadata id mismatch');
assert(routeSamples.corridorId === manifest.corridorId, 'V2 route-sample corridor id mismatch');

const expectedAnchorOrder = (manifest.anchors ?? []).map((anchor) => anchor.id);
assert(deepEqual(locatedAnchors.map((anchor) => anchor.id), expectedAnchorOrder), `anchor order must be ${expectedAnchorOrder.join(' → ')}`);

assert(Math.abs(samples[0].distanceKm) <= EPS, 'V2 operational samples must start at 0 km');
assert(
  Math.abs(samples.at(-1).distanceKm - v1Metadata.totalDistanceKm) <= EPS,
  `V2 operational samples must end at ${v1Metadata.totalDistanceKm} km`,
);

for (const anchor of manifest.anchors ?? []) {
  if (!Number.isFinite(anchor.operationalKm)) continue;
  const nearest = nearestSampleToAnchor(samples, anchor);
  assert(nearest, `Unable to locate route sample for ${anchor.id}`);
  assert(
    Math.abs(nearest.sample.distanceKm - anchor.operationalKm) <= EPS,
    `${anchor.id} sample must equal operational km ${anchor.operationalKm}`,
  );
}
```

Update `validateFromDisk()` and `buildFromDisk()` to accept exactly the active corridor IDs:

```js
const ACTIVE_CORRIDORS = new Set(['hualilan', 'veladero', 'los-azules']);
if (!ACTIVE_CORRIDORS.has(corridorId)) throw new Error(`Unsupported corridor ${corridorId}`);
```

- [ ] **Step 5: Run generic + Veladero regression tests**

Run:

```bash
node --test scripts/road-geometry-generic.test.mjs
npm run validate:road-geometry -- veladero
npm test -- --run
```

Expected: PASS. The existing Veladero report must retain start 0, end 360 and exact Tudcum 205.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-road-geometry.mjs scripts/validate-road-geometry.mjs scripts/road-geometry-generic.test.mjs
git commit -m "refactor: generalize evidence-aware road geometry pipeline"
```

---

### Task 2: Author and Publish Hualilán V2 Geometry

**Files:**
- Modify: `scripts/acquire-road-sources.mjs`
- Test: `scripts/acquire-road-sources-cli.test.mjs`
- Create: `public/data/corridors/hualilan/sources.v2.json`
- Create: `public/data/corridors/hualilan/source-snapshots/dnv-national-roads.v1.geojson`
- Create: `public/data/corridors/hualilan/source-snapshots/ign-provincial-roads.v1.geojson`
- Create conditionally if required by source coverage: `public/data/corridors/hualilan/source-snapshots/osm-access.v1.geojson`
- Create via builder: `public/data/corridors/hualilan/metadata.v2.json`
- Create via builder: `public/data/corridors/hualilan/corridor.v2.geojson`
- Create via builder: `public/data/corridors/hualilan/segments.v2.geojson`
- Create via builder: `public/data/corridors/hualilan/route-samples.v2.json`

**Interfaces:**
- Consumes: existing V1 Hualilán contract (`120 km`, four operational segments, existing analytical profile) plus frozen DNV/IGN/OSM authoring snapshots.
- Produces: a complete V2 bundle accepted by the generic builder/validator.

- [ ] **Step 1: Add a corridor-specific acquisition configuration and failing CLI test**

Use one generic acquisition function with corridor configuration rather than another script:

```js
export const ROAD_SOURCE_ACQUISITION_CONFIG = {
  veladero: { regionalBbox: [-69.5, -31.8, -68.3, -29.9], fallbackBbox: [-70.1, -30.25, -69.2, -29.25] },
  hualilan: { regionalBbox: [-69.25, -31.75, -68.35, -30.55], fallbackBbox: [-69.25, -31.25, -68.70, -30.55] },
  'los-azules': { regionalBbox: [-70.40, -31.80, -68.30, -30.85], fallbackBbox: [-70.45, -31.55, -69.20, -30.85] },
};
```

The CLI test must expect `hualilan` to resolve rather than throw `currently supports only Veladero`.

- [ ] **Step 2: Run the acquisition CLI test to verify RED**

```bash
node --test scripts/acquire-road-sources-cli.test.mjs
```

Expected: FAIL on Hualilán support.

- [ ] **Step 3: Generalize source acquisition**

Rename the internal operation to generic semantics:

```js
export async function acquireRoadSources(corridorId, {
  fetcher = fetch,
  outputDir = path.join('artifacts', `road-geometry-acquisition-${corridorId}`),
  overpassEndpoints = OVERPASS_ENDPOINTS,
  now = () => new Date().toISOString(),
} = {}) { ... }
```

The inventory must contain `corridorId`, exact request URLs, retrieved timestamp, stable source feature IDs, source attribution/license and the two acquisition bboxes.

- [ ] **Step 4: Acquire Hualilán authoring data**

Run:

```bash
npm run acquire:road-sources -- hualilan
```

Record the resulting inventory and copy only the bounded snapshots actually used by the route assembly into `public/data/corridors/hualilan/source-snapshots/`.

Source selection rules are exact and fail-closed:

1. public-road legs described by the existing Hualilán evidence (`RN40 → RP436 → RN149`) must use matching DNV/IGN feature IDs where available;
2. an OSM way may be used only for a missing publicly mapped access leg, with `role: FALLBACK`, `license: ODbL 1.0`, and `© OpenStreetMap contributors` attribution;
3. unsupported gaps may only be represented as explicit `derivedGeometry`, classified `RECONSTRUCTED_ACCESS` or `APPROXIMATE_APPROACH` and kept within manifest guards;
4. if the selected features cannot form a monotonic San Juan → Hualilán chain within guards, stop this task and do not publish V2.

- [ ] **Step 5: Write `sources.v2.json` with exact selected feature IDs and anchors**

At minimum the calibration anchors must include:

```json
[
  {"id":"san-juan","lat":-31.5375,"lon":-68.5364,"operationalKm":0,"maxDistanceToRouteKm":2},
  {"id":"hualilan","lat":-30.73333,"lon":-68.95,"operationalKm":120,"maxDistanceToRouteKm":2}
]
```

Any intermediate anchor added to constrain geometry must have source/evidence identity and may omit `operationalKm` unless the existing V1 contract already establishes a deterministic kilometre.

- [ ] **Step 6: Build and validate twice for determinism**

```bash
npm run build:road-geometry -- hualilan
sha256sum public/data/corridors/hualilan/metadata.v2.json public/data/corridors/hualilan/corridor.v2.geojson public/data/corridors/hualilan/segments.v2.geojson public/data/corridors/hualilan/route-samples.v2.json
npm run build:road-geometry -- hualilan
sha256sum public/data/corridors/hualilan/metadata.v2.json public/data/corridors/hualilan/corridor.v2.geojson public/data/corridors/hualilan/segments.v2.geojson public/data/corridors/hualilan/route-samples.v2.json
npm run validate:road-geometry -- hualilan
```

Expected: both hash sets identical; report starts at 0 and ends at 120; all source feature IDs resolve; all operational V1 segment IDs remain valid.

- [ ] **Step 7: Commit**

```bash
git add scripts/acquire-road-sources.mjs scripts/acquire-road-sources-cli.test.mjs public/data/corridors/hualilan
git commit -m "feat: add evidence-aware Hualilan V2 geometry"
```

---

### Task 3: Author and Publish Los Azules V2 Geometry

**Files:**
- Create: `public/data/corridors/los-azules/sources.v2.json`
- Create: `public/data/corridors/los-azules/source-snapshots/dnv-national-roads.v1.geojson`
- Create: `public/data/corridors/los-azules/source-snapshots/ign-provincial-roads.v1.geojson`
- Create conditionally if required: `public/data/corridors/los-azules/source-snapshots/osm-access.v1.geojson`
- Create via builder: `public/data/corridors/los-azules/metadata.v2.json`
- Create via builder: `public/data/corridors/los-azules/corridor.v2.geojson`
- Create via builder: `public/data/corridors/los-azules/segments.v2.geojson`
- Create via builder: `public/data/corridors/los-azules/route-samples.v2.json`

**Interfaces:**
- Consumes: V1 Los Azules total distance `276 km`, existing operational segments/nodes/profile, public regional road evidence and the McEwen access narrative already recorded in V1 metadata.
- Produces: source-manifest-backed V2 geometry with Calingasta preserved at exact operational km `164`.

- [ ] **Step 1: Acquire Los Azules sources**

```bash
npm run acquire:road-sources -- los-azules
```

Apply the same fail-closed source order. The regional leg must respect the documented public chain around San Juan/Calingasta; the project-access leg may use OSM only as explicitly attributed mapped geometry, never as operator navigation.

- [ ] **Step 2: Write source manifest anchors**

The manifest must include these operational calibration anchors exactly:

```json
[
  {"id":"san-juan","lat":-31.5375,"lon":-68.5364,"operationalKm":0,"maxDistanceToRouteKm":2},
  {"id":"calingasta","lat":-31.335410441,"lon":-69.427381783,"operationalKm":164,"maxDistanceToRouteKm":2},
  {"id":"los-azules","lat":-31.11277,"lon":-70.22138,"operationalKm":276,"maxDistanceToRouteKm":2}
]
```

- [ ] **Step 3: Build and validate twice**

```bash
npm run build:road-geometry -- los-azules
sha256sum public/data/corridors/los-azules/metadata.v2.json public/data/corridors/los-azules/corridor.v2.geojson public/data/corridors/los-azules/segments.v2.geojson public/data/corridors/los-azules/route-samples.v2.json
npm run build:road-geometry -- los-azules
sha256sum public/data/corridors/los-azules/metadata.v2.json public/data/corridors/los-azules/corridor.v2.geojson public/data/corridors/los-azules/segments.v2.geojson public/data/corridors/los-azules/route-samples.v2.json
npm run validate:road-geometry -- los-azules
```

Expected: identical hashes; start 0; Calingasta exact 164; destination exact 276; V1 operational segments/nodes unchanged.

- [ ] **Step 4: Commit**

```bash
git add public/data/corridors/los-azules
git commit -m "feat: add evidence-aware Los Azules V2 geometry"
```

---

### Task 4: Switch Runtime Defaults to V2 With Operational Regression Protection

**Files:**
- Modify: `src/data/loadOperation.ts`
- Create: `src/data/loadOperation.v2-corridors.test.ts`
- Modify if required by asset fixtures: `src/test/*`

**Interfaces:**
- Consumes: complete checked-in V2 bundles for all three active corridors.
- Produces: `DEFAULT_CORRIDOR_ASSET_VERSIONS = { hualilan: 'v2', veladero: 'v2', 'los-azules': 'v2' }`.

- [ ] **Step 1: Write the failing loader test**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CORRIDOR_ASSET_VERSIONS } from './loadOperation';

describe('V0.2 corridor defaults', () => {
  it('uses V2 geometry for all active corridors', () => {
    expect(DEFAULT_CORRIDOR_ASSET_VERSIONS).toEqual({
      hualilan: 'v2',
      veladero: 'v2',
      'los-azules': 'v2',
    });
  });
});
```

Also add a fetcher fixture that proves Hualilán/Los Azules V2 paths request `metadata.v2.json`, `corridor.v2.geojson`, `segments.v2.geojson`, `route-samples.v2.json`, `sources.v2.json`.

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/data/loadOperation.v2-corridors.test.ts
```

Expected: FAIL because current defaults are V1 and the loader rejects non-Veladero V2.

- [ ] **Step 3: Remove the Veladero-only runtime gate and change defaults**

```ts
export const DEFAULT_CORRIDOR_ASSET_VERSIONS = {
  hualilan: 'v2',
  veladero: 'v2',
  'los-azules': 'v2',
} as const;
```

The V2 loading branch must be corridor-generic; do not special-case Veladero after artifact validation is generic.

- [ ] **Step 4: Add an operational snapshot regression test**

For fixed scenario seed/time samples `06:00`, `13:00`, `20:00`, compare pre-switch expected operational fields against V2:

```ts
const stable = snapshot.vehicles.map(({ id, state, direction, distanceKm, segmentId, etaMinute }) => ({
  id, state, direction, distanceKm, segmentId, etaMinute,
}));
```

Assert the same IDs/state/direction/distance/segment/ETA and operational event sequence. Spatial `lon/lat` may differ because geometry is intentionally refined.

- [ ] **Step 5: Run full regression**

```bash
npm test -- --run
npm run validate:data
npm run validate:road-geometry -- hualilan
npm run validate:road-geometry -- veladero
npm run validate:road-geometry -- los-azules
npm run audit:claims
npm run build
npm run qa:visual
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/loadOperation.ts src/data/loadOperation.v2-corridors.test.ts
git commit -m "feat: use refined V2 geometry for active corridors"
```

---

### Task 5: Put All Three V2 Validators in CI and Record Acceptance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/data-sources.md`
- Create: `docs/qa/v0-2a-route-refinement-acceptance.md`

**Interfaces:**
- Consumes: validated V2 bundles.
- Produces: permanent CI gates and an acceptance record containing measured physical chainage, vertex/sample counts, source-gap metrics and the unchanged operational endpoints for each corridor.

- [ ] **Step 1: Add all corridor validators to CI**

CI command block:

```yaml
- name: Validate V2 road geometry
  run: |
    npm run validate:road-geometry -- hualilan
    npm run validate:road-geometry -- veladero
    npm run validate:road-geometry -- los-azules
```

- [ ] **Step 2: Run CI-equivalent commands locally/inline**

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run validate:road-geometry -- hualilan
npm run validate:road-geometry -- veladero
npm run validate:road-geometry -- los-azules
npm run audit:claims
npm run build
npm run qa:visual
```

Expected: all PASS.

- [ ] **Step 3: Record acceptance values from validator output**

The acceptance record must state for each corridor:

- physical measured chainage;
- operational start/end km;
- operational anchor km values;
- geometry vertex count;
- route sample count;
- geometry segment count and class counts;
- max explicit source gap;
- max derived chord;
- source manifests/snapshot provenance;
- statement that operational state/direction/distance/segment/ETA/events remained unchanged for regression fixtures.

Do not copy expected values from the plan; record the values actually emitted by validators.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml docs/data-sources.md docs/qa/v0-2a-route-refinement-acceptance.md
git commit -m "docs: record V0.2A route refinement acceptance"
```

### PR A Completion Gate

Do not merge PR A unless:

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run validate:road-geometry -- hualilan
npm run validate:road-geometry -- veladero
npm run validate:road-geometry -- los-azules
npm run audit:claims
npm run build
npm run qa:visual
```

all pass on the PR HEAD, and the operational regression test proves only spatial placement changed.
