# V0.2D Operational POIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, versioned operational-context POI layer for fuel, repairs, health, police/Gendarmería, supplies and lodging near the refined corridors without turning POIs into routing, availability or safety claims.

**Architecture:** Follow the existing IGN road-context pattern. Acquire an OSM POI snapshot only during authoring, freeze retrieval/query metadata, deterministically normalize/filter that snapshot against the three refined V2 corridor geometries, check in a small runtime GeoJSON + metadata sidecar, load it independently from operational data, and render category icons only at useful map scales. Selecting a POI opens one context-only detail panel; it never changes the simulation.

**Tech Stack:** Node.js ESM authoring scripts, OpenStreetMap/Overpass authoring data, GeoJSON/JSON checked-in runtime artifacts, React/TypeScript, CesiumJS billboards/entities, Vitest, Puppeteer QA.

**Spec:** `docs/superpowers/specs/2026-09-01-v0-2-territorial-operations-ui-design.md`

## Global Constraints

- PR D depends on merged V0.2A refined V2 geometry for Hualilán and Los Azules.
- Runtime must not call Overpass or another live POI/business API during ordinary map navigation.
- Initial approved categories are exactly `FUEL`, `MECHANICAL_REPAIR`, `TYRE_REPAIR`, `HEALTH`, `POLICE_GENDARMERIA`, `SUPPLIES`, `LODGING`.
- `CONNECTIVITY_NODE` is excluded from the OSM-only V1 artifact unless a separate explicit evidence source is added; do not infer connectivity from generic OSM tags.
- POIs must never modify corridor geometry, snap/move vehicles, alter ETA/state/events, or trigger rerouting.
- POIs must never imply that fuel exists in stock, a workshop is open, a health facility is staffed, a road is safe, or access is authorized.
- OSM attribution/license/retrieval metadata must be versioned and visible through Sources.
- POI layer failure must not make operational data unavailable.
- No precise “X km from route” user-facing claim in V1; proximity is used only as an authoring filter.
- Runtime artifact is capped at 500 POIs; exceeding the cap fails authoring and requires a narrower selection, not silent truncation.

---

### Task 1: Acquire and Freeze a Bounded OSM POI Source Snapshot

**Files:**
- Create: `scripts/acquire-poi-context.mjs`
- Create: `scripts/acquire-poi-context.test.mjs`
- Modify: `package.json`
- Create by authoring: `public/data/context/poi-source-snapshots/osm-pois.v1.geojson`
- Create by authoring: `public/data/context/poi-source-snapshots/osm-pois.v1.json`

**Interfaces:**

```js
export const POI_CORRIDOR_PADDING_DEGREES = 0.08;
export function buildPoiOverpassQuery(bbox) { ... }
export function normalizeOverpassPois(document) { ... }
export async function acquirePoiContext({ fetcher = fetch, now = () => new Date().toISOString() } = {}) { ... }
```

Normalized source feature:

```json
{
  "type": "Feature",
  "id": "osm:node:123",
  "properties": {
    "osmType": "node",
    "osmId": 123,
    "tags": {"amenity":"fuel","name":"Example"}
  },
  "geometry": {"type":"Point","coordinates":[-69.0,-31.0]}
}
```

- [ ] **Step 1: Write failing query/normalization tests**

The Overpass query must use `nwr` and `out center tags` so nodes, ways and relations normalize to point context without importing business polygons:

```js
const query = buildPoiOverpassQuery([-69.2, -31.7, -68.4, -30.8]);
assert.match(query, /nwr\["amenity"="fuel"\]/);
assert.match(query, /nwr\["shop"="car_repair"\]/);
assert.match(query, /nwr\["shop"="tyres"\]/);
assert.match(query, /out center tags/);
```

Normalization must accept:

```js
{ type: 'node', id: 1, lat: -31, lon: -69, tags: { amenity: 'fuel', name: 'YPF' } }
{ type: 'way', id: 2, center: { lat: -31.1, lon: -69.1 }, tags: { shop: 'car_repair' } }
```

and produce stable IDs `osm:node:1`, `osm:way:2` sorted lexicographically.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/acquire-poi-context.test.mjs
```

Expected: FAIL because the acquisition module does not exist.

- [ ] **Step 3: Implement the exact Overpass category query**

For each V2 corridor bbox expanded by `0.08°`, query:

```text
amenity=fuel
shop=car_repair
craft=car_repair
shop=tyres
amenity=hospital|clinic|doctors
healthcare=hospital|clinic|doctor
amenity=police
shop=convenience|supermarket|general
tourism=hotel|motel|hostel|guest_house
```

Deduplicate responses by `osm:type:id`. The authoring script may issue one query per corridor bbox; it must record every query and endpoint in the source metadata sidecar.

- [ ] **Step 4: Add package command**

```json
"acquire:poi-context": "node scripts/acquire-poi-context.mjs"
```

- [ ] **Step 5: Run authoring acquisition once**

```bash
npm run acquire:poi-context
```

Write only the normalized bounded snapshot and source metadata. Metadata must include:

```json
{
  "schemaVersion": "sanjuan.poi-source/v1",
  "provider": "OpenStreetMap contributors via Overpass API",
  "sourceUrl": "https://www.openstreetmap.org/",
  "licenseUrl": "https://www.openstreetmap.org/copyright",
  "attribution": "© OpenStreetMap contributors",
  "retrievedAt": "<frozen acquisition timestamp>",
  "corridorPaddingDegrees": 0.08,
  "queries": ["<exact executed queries>"],
  "featureCount": 0,
  "limitations": [
    "Static authoring snapshot; not a live availability, opening-hours or service-status feed.",
    "OSM presence does not establish access authorization, road safety or transitability."
  ]
}
```

`featureCount` is the actual normalized source count.

- [ ] **Step 6: Run tests and commit**

```bash
node --test scripts/acquire-poi-context.test.mjs
git add scripts/acquire-poi-context.mjs scripts/acquire-poi-context.test.mjs package.json public/data/context/poi-source-snapshots
git commit -m "feat: freeze operational POI authoring snapshot"
```

---

### Task 2: Normalize Categories, Filter to Corridors and Build Runtime Artifacts

**Files:**
- Create: `scripts/build-poi-context.mjs`
- Create: `scripts/build-poi-context.test.mjs`
- Create: `scripts/validate-poi-context.mjs`
- Create: `scripts/validate-poi-context.test.mjs`
- Modify: `package.json`
- Create: `public/data/context/pois-context.v1.geojson`
- Create: `public/data/context/pois-context.v1.json`

**Interfaces:**

```js
export const POI_CORRIDOR_BUFFER_KM = 8;
export function classifyPoiTags(tags) { ... }
export function buildPoiContext({ source, sourceMetadata, corridors }) { ... }
```

Runtime feature:

```ts
interface PoiContextFeature {
  type: 'Feature';
  properties: {
    id: string;
    category: 'FUEL' | 'MECHANICAL_REPAIR' | 'TYRE_REPAIR' | 'HEALTH' | 'POLICE_GENDARMERIA' | 'SUPPLIES' | 'LODGING';
    name: string | null;
    sourceFeatureId: string;
    sourceUrl: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}
```

- [ ] **Step 1: Write failing category tests**

```js
assert.equal(classifyPoiTags({ amenity: 'fuel' }), 'FUEL');
assert.equal(classifyPoiTags({ shop: 'car_repair' }), 'MECHANICAL_REPAIR');
assert.equal(classifyPoiTags({ craft: 'car_repair' }), 'MECHANICAL_REPAIR');
assert.equal(classifyPoiTags({ shop: 'tyres' }), 'TYRE_REPAIR');
assert.equal(classifyPoiTags({ amenity: 'hospital' }), 'HEALTH');
assert.equal(classifyPoiTags({ healthcare: 'clinic' }), 'HEALTH');
assert.equal(classifyPoiTags({ amenity: 'police' }), 'POLICE_GENDARMERIA');
assert.equal(classifyPoiTags({ shop: 'convenience' }), 'SUPPLIES');
assert.equal(classifyPoiTags({ tourism: 'hostel' }), 'LODGING');
assert.equal(classifyPoiTags({ amenity: 'restaurant' }), null);
```

Do not classify internet/cell/wifi tags as `CONNECTIVITY_NODE`.

- [ ] **Step 2: Write failing corridor-filter tests**

Use `buildChainage()` + `locateAnchor()` from `scripts/lib/road-geometry.mjs`. A POI is selected if its minimum distance to any of the three V2 corridor polylines is <= `8 km`.

A feature at `8.001 km` is excluded. Do not emit the computed distance in runtime properties.

- [ ] **Step 3: Write forbidden-semantics tests**

For every built feature:

```js
for (const forbidden of ['open', 'openingHours', 'available', 'fuelAvailable', 'routeDistanceKm', 'eta', 'accessAllowed', 'transitable', 'safe']) {
  assert.equal(Object.hasOwn(feature.properties, forbidden), false);
}
```

- [ ] **Step 4: Run RED**

```bash
node --test scripts/build-poi-context.test.mjs scripts/validate-poi-context.test.mjs
```

- [ ] **Step 5: Implement deterministic builder**

Builder reads only:

```text
public/data/context/poi-source-snapshots/osm-pois.v1.geojson
public/data/context/poi-source-snapshots/osm-pois.v1.json
public/data/corridors/hualilan/corridor.v2.geojson
public/data/corridors/veladero/corridor.v2.geojson
public/data/corridors/los-azules/corridor.v2.geojson
```

Sort final features by stable `properties.id`. Preserve source names only as strings; never infer missing names.

Metadata schema:

```json
{
  "schemaVersion": "sanjuan.poi-context/v1",
  "id": "san-juan-operational-pois-v1",
  "provider": "OpenStreetMap contributors",
  "sourceUrl": "https://www.openstreetmap.org/",
  "licenseUrl": "https://www.openstreetmap.org/copyright",
  "attribution": "© OpenStreetMap contributors",
  "retrievedAt": "<copied from frozen source metadata>",
  "selectionMethod": "approved category mapping + minimum geometric distance <= 8 km from any active V2 corridor",
  "corridorBufferKm": 8,
  "categories": ["FUEL","MECHANICAL_REPAIR","TYRE_REPAIR","HEALTH","POLICE_GENDARMERIA","SUPPLIES","LODGING"],
  "featureCount": 0,
  "limitations": [
    "Static cartographic context only; not a live service-status or opening-hours feed.",
    "POI presence does not imply availability, access authorization, safety, road condition or transitability."
  ]
}
```

Fail if `featureCount > 500`.

- [ ] **Step 6: Implement validator**

Validator reads only checked-in runtime/source artifacts, verifies schema/category/feature count/stable IDs/point coordinates/attribution/limitations and forbidden fields. It must not call the network.

- [ ] **Step 7: Add package commands**

```json
"build:poi-context": "node scripts/build-poi-context.mjs",
"validate:poi-context": "node scripts/validate-poi-context.mjs"
```

- [ ] **Step 8: Prove deterministic double build**

```bash
npm run build:poi-context
sha256sum public/data/context/pois-context.v1.geojson public/data/context/pois-context.v1.json
npm run build:poi-context
sha256sum public/data/context/pois-context.v1.geojson public/data/context/pois-context.v1.json
npm run validate:poi-context
```

Expected: identical hash pairs and validator PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-poi-context.mjs scripts/build-poi-context.test.mjs scripts/validate-poi-context.mjs scripts/validate-poi-context.test.mjs package.json public/data/context/pois-context.v1.*
git commit -m "feat: add versioned operational POI context"
```

---

### Task 3: Add an Independent Fail-Safe POI Loader

**Files:**
- Create: `src/data/loadPoiContext.ts`
- Create: `src/data/loadPoiContext.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**

```ts
export type PoiCategory = 'FUEL' | 'MECHANICAL_REPAIR' | 'TYRE_REPAIR' | 'HEALTH' | 'POLICE_GENDARMERIA' | 'SUPPLIES' | 'LODGING';
export interface PoiContextData { metadata: PoiContextMetadata; features: PoiContextFeature[]; }
export async function loadPoiContext(fetcher: JsonFetcher): Promise<PoiContextData>;
```

- [ ] **Step 1: Write loader RED tests**

Cover:

- valid metadata/GeoJSON pair;
- unknown category rejected;
- non-Point geometry rejected;
- duplicate feature IDs rejected;
- metadata `featureCount` mismatch rejected;
- empty limitations rejected.

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/data/loadPoiContext.test.ts
```

- [ ] **Step 3: Implement strict parser and loader**

Runtime paths are fixed:

```text
/data/context/pois-context.v1.json
/data/context/pois-context.v1.geojson
```

- [ ] **Step 4: Load POIs separately from operation in `App.tsx`**

Add:

```ts
const [poiContext, setPoiContext] = useState<PoiContextData | null>(null);
```

Use a separate promise, mirroring road context:

```ts
void loadPoiContext(fetcher)
  .then((loaded) => { if (!cancelled) setPoiContext(loaded); })
  .catch((error) => {
    if (!cancelled) {
      console.warn('POI context unavailable; continuing without operational POIs.', error);
      setPoiContext(null);
    }
  });
```

The POI failure must never call `setDataError`.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- --run src/data/loadPoiContext.test.ts src/app/App.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/data/loadPoiContext.ts src/data/loadPoiContext.test.ts src/app/App.tsx
git commit -m "feat: load POI context independently"
```

---

### Task 4: Render Scale-Aware POI Icons Below Operational Entities

**Files:**
- Create: `src/map/poiContextStyle.ts`
- Create: `src/map/poiContextStyle.test.ts`
- Create: `src/map/poiIcon.ts`
- Create: `src/map/poiIcon.test.ts`
- Modify: `src/map/CesiumStage.tsx`

**Interfaces:**

```ts
export function visiblePoiCategories(scale: MapScaleBand): ReadonlySet<PoiCategory>;
export function poiContextStyle(category: PoiCategory): { pixelSize: number; color: string; glyph: string };
export function poiSvgDataUri(category: PoiCategory): string;
```

Visibility contract:

```text
REGIONAL: no POIs
CORRIDOR: FUEL, HEALTH, POLICE_GENDARMERIA
CLOSE: all approved categories
```

- [ ] **Step 1: Write failing style/visibility tests**

```ts
expect([...visiblePoiCategories('REGIONAL')]).toEqual([]);
expect([...visiblePoiCategories('CORRIDOR')].sort()).toEqual(['FUEL','HEALTH','POLICE_GENDARMERIA'].sort());
expect(visiblePoiCategories('CLOSE').has('MECHANICAL_REPAIR')).toBe(true);
expect(visiblePoiCategories('CLOSE').has('TYRE_REPAIR')).toBe(true);
```

- [ ] **Step 2: Write SVG icon tests**

`poiSvgDataUri(category)` must return `data:image/svg+xml` and use deterministic monochrome symbols; do not depend on emoji fonts. Use restrained category glyphs:

```text
FUEL = F
MECHANICAL_REPAIR = R
TYRE_REPAIR = T
HEALTH = +
POLICE_GENDARMERIA = P
SUPPLIES = S
LODGING = L
```

- [ ] **Step 3: Run RED**

```bash
npm test -- --run src/map/poiContextStyle.test.ts src/map/poiIcon.test.ts
```

- [ ] **Step 4: Add a separate Cesium POI `CustomDataSource`**

Do not mix POIs into `san-juan-mining-operations`. Use:

```ts
const poiDataSource = new CustomDataSource('san-juan-operational-poi-context');
```

Each POI entity:

```ts
{
  id: `poi:${feature.properties.id}`,
  position: Cartesian3.fromDegrees(lon, lat, 0),
  billboard: {
    image: poiSvgDataUri(category),
    width: 20,
    height: 20,
    heightReference: HeightReference.CLAMP_TO_GROUND,
  },
  properties: { poiId: feature.properties.id, category },
}
```

Do not set `disableDepthTestDistance: Infinity`; POIs should be occluded by terrain rather than drawing through mountains.

- [ ] **Step 5: Update POI visibility on camera changes**

Reuse `classifyMapScale(cameraHeightM)` from V0.2C. On camera changes, set each POI entity `show` according to its category and band. Keep selection visible even if the scale changes until selection is cleared.

- [ ] **Step 6: Run GREEN**

```bash
npm test -- --run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/map/poiContextStyle.ts src/map/poiContextStyle.test.ts src/map/poiIcon.ts src/map/poiIcon.test.ts src/map/CesiumStage.tsx
git commit -m "feat: render scale-aware operational POIs"
```

---

### Task 5: Add POI Selection, Context-Only Detail and Sources Disclosure

**Files:**
- Create: `src/ui/PoiContextPanel.tsx`
- Create: `src/ui/PoiContextPanel.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/ui/AnalysisDrawer.tsx`
- Create: `src/ui/AnalysisDrawer.poiContext.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- `CesiumStageProps` gains `poiContext`, `selectedPoiId`, `onPoiSelect`.
- `AnalysisDrawerProps` gains nullable `poiContext`.

- [ ] **Step 1: Write failing POI panel tests**

For a named fuel POI:

```tsx
<PoiContextPanel poi={feature} metadata={metadata} />
```

Expect visible copy:

```text
YPF ACA LAS FLORES
FUEL
STATIC MAP CONTEXT
© OpenStreetMap contributors
Context only · no live availability or opening-status claim.
```

For unnamed POI, primary text is the category display name, never `undefined`.

- [ ] **Step 2: Write failing selection-interaction test**

Selecting a POI clears selected vehicle; selecting a vehicle clears selected POI. Persistent vehicle cards remain rendered.

- [ ] **Step 3: Extend Cesium pick handling**

Current vehicle handling recognizes `vehicle:`. Add:

```ts
if (pickedEntity.id.startsWith('poi:')) {
  onPoiSelectRef.current?.(pickedEntity.id.slice('poi:'.length));
  return;
}
```

- [ ] **Step 4: Implement one detail panel at a time**

`App.tsx`:

```ts
const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
const selectVehicle = (id: string) => { setSelectedPoiId(null); setSelectedVehicleId(id); };
const selectPoi = (id: string) => { setSelectedVehicleId(null); setSelectedPoiId(id); };
```

Use the existing lower-right panel region; vehicle and POI panels must never overlap because selection is mutually exclusive.

- [ ] **Step 5: Add Sources disclosure**

When POI context exists, `AnalysisDrawer` must show:

- provider;
- retrieval timestamp;
- OSM source link;
- license link;
- attribution;
- selection method / 8 km authoring buffer;
- feature count;
- limitations.

When POI context is null, do not show a POI section and do not show `Operational data unavailable`.

- [ ] **Step 6: Run GREEN**

```bash
npm test -- --run src/ui/PoiContextPanel.test.tsx src/ui/AnalysisDrawer.poiContext.test.tsx src/app/App.test.tsx
npm test -- --run
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/PoiContextPanel.tsx src/ui/PoiContextPanel.test.tsx src/ui/AnalysisDrawer.tsx src/ui/AnalysisDrawer.poiContext.test.tsx src/app/App.tsx src/map/CesiumStage.tsx src/app/app.css
git commit -m "feat: add POI context selection and provenance"
```

---

### Task 6: CI, Visual QA and Acceptance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/visual-qa.mjs`
- Modify: `docs/data-sources.md`
- Create: `docs/qa/v0-2d-operational-pois-acceptance.md`

**Interfaces:**
- Produces: permanent POI artifact validation and screenshots proving useful context without regional clutter.

- [ ] **Step 1: Add POI validation to CI**

```yaml
- name: Validate operational POI context
  run: npm run validate:poi-context
```

- [ ] **Step 2: Extend visual QA**

Desktop test flow:

1. regional view → assert `.poi` context has zero visible POI icons;
2. click `VELADERO 3D` or move to close-scale fixture → assert close-scale POIs can appear if the artifact contains features in viewport;
3. use a deterministic San Juan/Calingasta close camera in QA when a known fixture POI is required;
4. click one POI entity through a test hook or deterministic screen coordinate and assert `PoiContextPanel` is visible;
5. ensure timeline/HUD/entity cards remain in viewport.

Do not assert a live business is open or available.

- [ ] **Step 3: Run full regression**

```bash
node --test scripts/acquire-poi-context.test.mjs scripts/build-poi-context.test.mjs scripts/validate-poi-context.test.mjs
npm run validate:poi-context
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

Expected: PASS.

- [ ] **Step 4: Record acceptance**

Record actual:

- source retrieval timestamp and exact Overpass endpoint/query count;
- source snapshot feature count;
- runtime feature count by category;
- runtime hashes;
- validator result;
- screenshots at regional/corridor/close views;
- OSM attribution visibility;
- fail-safe loader result;
- statement that operational snapshots/events/ETA/corridor membership are unchanged;
- statement that no live availability/opening/safety/transitability claim is made.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/visual-qa.mjs docs/data-sources.md docs/qa/v0-2d-operational-pois-acceptance.md
git commit -m "docs: record operational POI context acceptance"
```

### PR D Completion Gate

```bash
npm run validate:poi-context
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

All must pass on PR HEAD. Merge only if regional view remains uncluttered, close views expose useful POIs, OSM attribution is explicit, POI failure remains optional, and no operation/routing semantics changed.
