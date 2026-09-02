# V0.2 Territorial Operations UI — Execution Index

**Status:** approved design; implementation not started  
**Spec:** `docs/superpowers/specs/2026-09-01-v0-2-territorial-operations-ui-design.md`

This file is the authoritative execution entry point for V0.2. It defines PR order and resolves implementation details discovered during plan self-review. Where an amendment below conflicts with a slice plan, **this index wins**.

## Execution order

Execute and review the slices sequentially:

1. `2026-09-01-v0-2a-route-refinement.md`
2. `2026-09-01-v0-2b-mineral-terrain.md`
3. `2026-09-01-v0-2c-persistent-entity-cards.md`
4. `2026-09-01-v0-2d-operational-pois.md`

Do not begin PR D before PR A is merged because the POI authoring filter depends on refined Hualilán and Los Azules V2 geometry. B and C are technically independent of A's data format, but the approved product sequence remains A → B → C → D so visual/context work is evaluated against the refined territory.

Each slice starts from current `main` after the previous slice is merged. Do not stack implementation PRs on the documentation branch.

## Shared release invariants

Across all four PRs:

- no automatic routing or route recommendation;
- no road-safety, access-authorization or transitability inference;
- no changes to analytical elevation from visual terrain;
- no change to simulation state-machine semantics unless separately specified and approved;
- optional context failures never make operational data unavailable;
- source snapshots are authoring inputs, not runtime network dependencies;
- every final PR HEAD must pass its full regression/validation gate before merge;
- actual validator/benchmark/QA outputs go into acceptance documents; never copy expected numbers from a plan and present them as observed.

## Self-review amendments

### Amendment C1 — DOM overlay root is explicit

In Plan C Task 3, `EntityCardOverlay` renders one root container around all visible cards:

```tsx
<div className="entity-card-overlay" aria-label="Map entity context">
  {visibleCards}
</div>
```

The stylesheet must include:

```css
.entity-card-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
}

.entity-card {
  pointer-events: auto;
}
```

The overlay must not create page scroll or intercept empty-map gestures.

### Amendment C2 — selected card accessibility is explicit

The vehicle-card markup in Plan C Task 3 must include:

```tsx
aria-pressed={card.selected}
```

The selected-state test must assert `aria-pressed="true"`. The visual outline remains a second, non-text cue; selection is not communicated by color alone.

### Amendment C3 — Cesium post-render callback must read current inputs

Do not let the `scene.postRender` callback close over stale `data`, `snapshot` or `selectedVehicleId`. Store latest values in refs updated during React render/effects:

```ts
const dataRef = useRef(data);
const snapshotRef = useRef(snapshot);
const selectedVehicleIdRef = useRef(selectedVehicleId);

dataRef.current = data;
snapshotRef.current = snapshot;
selectedVehicleIdRef.current = selectedVehicleId;
```

Register one stable post-render callback during Viewer setup and remove that exact callback during cleanup.

### Amendment C4 — performance guard runs in Vitest, not a standalone Node/TS import

Plan C Task 2's standalone `scripts/benchmark-entity-card-layout.mjs` is superseded.

Create instead:

```text
src/map/entityCardLayout.performance.test.ts
```

The test creates 34 candidates, warms up the function, executes 10,000 layouts using `performance.now()`, logs the measured mean and fails when mean execution exceeds `2 ms` per layout on CI.

Run:

```bash
npm test -- --run src/map/entityCardLayout.performance.test.ts
```

The final PR C gate is therefore simply covered by the normal full Vitest run plus visual QA; no separate Node import path is required.

### Amendment D1 — Overpass multi-value filters use explicit regex

Plan D's category list describes semantics; implementation must generate valid Overpass QL. For multi-value tags use anchored regex, for example:

```text
nwr["amenity"="fuel"](S,W,N,E);
nwr["shop"="car_repair"](S,W,N,E);
nwr["craft"="car_repair"](S,W,N,E);
nwr["shop"="tyres"](S,W,N,E);
nwr["amenity"~"^(hospital|clinic|doctors)$"](S,W,N,E);
nwr["healthcare"~"^(hospital|clinic|doctor)$"](S,W,N,E);
nwr["amenity"="police"](S,W,N,E);
nwr["shop"~"^(convenience|supermarket|general)$"](S,W,N,E);
nwr["tourism"~"^(hotel|motel|hostel|guest_house)$"](S,W,N,E);
```

The full query wraps these clauses in `(...)` and ends with:

```text
out center tags;
```

Tests must assert these exact filter semantics rather than a pseudo-expression such as `amenity=hospital|clinic`.

### Amendment D2 — runtime `sourceUrl` identifies the actual OSM object

Each normalized runtime POI uses:

```js
sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`
```

Metadata still carries the dataset-level source/license/attribution URLs. This keeps feature-level provenance navigable without suggesting a live business-status API.

### Amendment D3 — visual QA does not click map POIs by guessed pixels

Plan D Task 6 must not click a POI using a hard-coded screen coordinate and must not add a production test hook solely for QA.

Selection behavior is proven in deterministic component/App tests from Task 5. Puppeteer visual QA is limited to:

1. regional band: zero visible POI icons;
2. deterministic close camera: expected bounded POI icon count is greater than zero when the checked-in artifact contains features in that viewport;
3. screenshot the close view with entity cards + POIs + HUD/timeline;
4. assert no page overflow and core UI remains in viewport.

If a deterministic close camera does not contain a checked-in POI after authoring, choose a camera target from the **versioned runtime POI artifact** and record that POI ID in the QA script. Do not discover a live POI at test time.

### Amendment B1 — OSM raster limitation is a release gate, not something to hide

Mineral Terrain B intentionally keeps the OSM raster provider. Raster treatment can reduce overall color/noise but cannot independently remove labels while retaining roads. During visual acceptance:

- if the `brightness/contrast/saturation/gamma` treatment achieves the approved hierarchy, ship B;
- if labels still materially overpower terrain/corridors, record B as not accepted and plan a separate vector-basemap/provider decision;
- do not add undocumented CSS/canvas filters, replace the provider ad hoc, or weaken operational colors just to make screenshots pass.

## Planning completeness check

The approved spec maps to concrete slices as follows:

| Spec capability | Implementation slice |
| --- | --- |
| Hualilán / Los Azules refined geometry | V0.2A |
| Mineral Terrain visual hierarchy | V0.2B |
| Persistent vehicle microcards | V0.2C |
| Compact project cards | V0.2C |
| Deterministic decluttering / mobile suppression | V0.2C |
| Versioned operational POIs | V0.2D |
| POI provenance + fail-safe loading | V0.2D |
| No routing/safety/availability inference | Shared invariant + V0.2D validators |
| World Terrain / analytical-Z separation | Preserved regression gate in all relevant slices |

No V0.2 implementation starts from this documentation branch. Create a fresh implementation branch from `main` for PR A when execution is approved.
