# V0.1.1 Terrain + Road Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the San Juan mining simulation read as an operation moving through real topography and a subdued regional road network without changing deterministic operational behavior.

**Architecture:** Keep the existing single Cesium `Viewer`, load Cesium World Terrain as an optional visual provider, and render corridor/vehicle Z relative to terrain while leaving analytical `elevationM` untouched. Load road context through a separate optional data path so terrain or road-context failure can never fail operational-data loading or influence route interpolation.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest 3, CesiumJS 1.132, checked-in GeoJSON/JSON assets, Node.js 22 scripts.

**Spec:** `docs/superpowers/specs/2026-08-30-v0-1-1-terrain-road-context-design.md`

## Global Constraints

- Do not change `OperationalRun`, schedules, speeds, ETA, stops, states, events, weather-at-passage, background-traffic behavior, or scenario timing.
- Do not regenerate `route-samples.v2.json`, `profile.v1.json`, or Veladero's `0 → 205 → 360 km` operational calibration.
- Terrain is visual only. `routeSamples.elevationM` remains analytical/context data and never becomes terrain truth.
- Road context is cartographic only. It must never enter routing, snapping, pathfinding, `positionAtDistance()`, ETA, dispatch, or vehicle movement.
- Keep one Cesium `Viewer`; no second viewer and no per-frame/per-vehicle terrain network requests.
- Terrain failure falls back to `EllipsoidTerrainProvider`; road-context failure leaves operational corridors and playback usable.
- Do not commit a Cesium ion token. Production uses one dedicated public/read-only URL-restricted token supplied at build time.
- Do not use the GeoPlatform repository as a runtime or CI dependency.
- Road-context publication is fail-closed: provider attribution/usage terms must be recorded before the artifact is committed.
- Keep V0.2 Inline Execution / Scenario Engine out of this branch.

---

## File Structure

New focused units:

- `src/map/terrainRuntime.ts` — token normalization, async terrain provider creation, safe installation/fallback result.
- `src/map/terrainRuntime.test.ts` — pure/injected terrain success, missing-token, failure, and destroyed-viewer tests.
- `scripts/build-road-context.mjs` — deterministic authoring-time context selection/normalization from the IGN-derived GeoPlatform source file.
- `scripts/build-road-context.test.mjs` — source-shape, bbox-selection, normalization, determinism, and fail-closed metadata tests.
- `scripts/validate-road-context.mjs` — checked-in artifact/provenance validator used by CI.
- `src/data/loadRoadContext.ts` — optional runtime parser/loader independent from `loadStaticOperationData()`.
- `src/data/loadRoadContext.test.ts` — fail-closed parser and optional-load tests.
- `src/map/roadContextStyle.ts` — small pure style mapping for contextual roads.
- `src/map/roadContextStyle.test.ts` — hierarchy tests against existing corridor styles.
- `public/data/context/roads-context.v1.geojson` — small contextual network if provenance gate passes.
- `public/data/context/roads-context.v1.json` — provenance/build sidecar if provenance gate passes.
- `docs/qa/v0-1-1-terrain-road-context-acceptance.md` — final evidence and release record.

Existing files changed incrementally:

- `src/map/CesiumStage.tsx` — install terrain, use terrain-relative point placement, clamp corridor/context polylines, render optional road context.
- `src/app/App.tsx` — load road context separately from required operational artifacts and pass it to map/Sources.
- `src/ui/AnalysisDrawer.tsx` + test — show road-context source only when the optional artifact loaded.
- `package.json` — road-context build/validate scripts.
- `.github/workflows/ci.yml` — validate checked-in road context without needing a Cesium token.
- `.github/workflows/pages.yml` — expose `VITE_CESIUM_ION_TOKEN` only to the production build from a GitHub secret.
- `docs/data-sources.md` and `README.md` — terrain/context boundaries and attribution.

---

### Task 1: Terrain configuration and fail-safe installation contract

**Files:**
- Create: `src/map/terrainRuntime.ts`
- Create: `src/map/terrainRuntime.test.ts`

**Interfaces:**
- Consumes: optional `VITE_CESIUM_ION_TOKEN` string and an existing Cesium Viewer-like object.
- Produces:
  - `normalizeTerrainToken(value: unknown): string | null`
  - `createWorldTerrainProvider(token: string): Promise<TerrainProvider>`
  - `installPreferredTerrain(target, token, createProvider?): Promise<TerrainInstallResult>`
  - `TerrainInstallResult = { state: 'READY' | 'ELLIPSOID' | 'FAILED' | 'ABORTED'; error?: string }`

- [ ] **Step 1: Write RED tests for missing token, successful installation, provider failure, and destroyed viewer**

```ts
import { describe, expect, it, vi } from 'vitest';
import { installPreferredTerrain, normalizeTerrainToken } from './terrainRuntime';

describe('terrain runtime', () => {
  it('treats missing and blank tokens as ellipsoid mode', async () => {
    expect(normalizeTerrainToken(undefined)).toBeNull();
    expect(normalizeTerrainToken('   ')).toBeNull();

    const target = { terrainProvider: { kind: 'ellipsoid' }, isDestroyed: () => false };
    const createProvider = vi.fn();
    await expect(installPreferredTerrain(target, null, createProvider)).resolves.toEqual({ state: 'ELLIPSOID' });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('installs the resolved provider without touching simulation data', async () => {
    const provider = { kind: 'terrain' };
    const target = { terrainProvider: { kind: 'ellipsoid' }, isDestroyed: () => false };
    const createProvider = vi.fn().mockResolvedValue(provider);
    await expect(installPreferredTerrain(target, 'public-token', createProvider)).resolves.toEqual({ state: 'READY' });
    expect(target.terrainProvider).toBe(provider);
  });

  it('keeps the existing ellipsoid provider when terrain loading fails', async () => {
    const original = { kind: 'ellipsoid' };
    const target = { terrainProvider: original, isDestroyed: () => false };
    const createProvider = vi.fn().mockRejectedValue(new Error('terrain unavailable'));
    const result = await installPreferredTerrain(target, 'public-token', createProvider);
    expect(result).toEqual({ state: 'FAILED', error: 'terrain unavailable' });
    expect(target.terrainProvider).toBe(original);
  });

  it('does not install a provider after viewer teardown', async () => {
    const original = { kind: 'ellipsoid' };
    let destroyed = false;
    const target = { terrainProvider: original, isDestroyed: () => destroyed };
    const createProvider = vi.fn().mockImplementation(async () => {
      destroyed = true;
      return { kind: 'terrain' };
    });
    await expect(installPreferredTerrain(target, 'public-token', createProvider)).resolves.toEqual({ state: 'ABORTED' });
    expect(target.terrainProvider).toBe(original);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/map/terrainRuntime.test.ts`

Expected: FAIL because `terrainRuntime.ts` does not exist.

- [ ] **Step 3: Implement the minimal runtime helper**

```ts
import {
  CesiumTerrainProvider,
  IonResource,
  type TerrainProvider,
} from 'cesium';

export type TerrainInstallResult =
  | { state: 'READY' }
  | { state: 'ELLIPSOID' }
  | { state: 'FAILED'; error: string }
  | { state: 'ABORTED' };

interface TerrainTarget {
  terrainProvider: unknown;
  isDestroyed(): boolean;
}

export function normalizeTerrainToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function createWorldTerrainProvider(token: string): Promise<TerrainProvider> {
  const resource = await IonResource.fromAssetId(1, { accessToken: token });
  return CesiumTerrainProvider.fromUrl(resource, { requestVertexNormals: true });
}

export async function installPreferredTerrain(
  target: TerrainTarget,
  token: string | null,
  createProvider: (token: string) => Promise<unknown> = createWorldTerrainProvider,
): Promise<TerrainInstallResult> {
  if (!token) return { state: 'ELLIPSOID' };
  try {
    const provider = await createProvider(token);
    if (target.isDestroyed()) return { state: 'ABORTED' };
    target.terrainProvider = provider;
    return { state: 'READY' };
  } catch (error) {
    return { state: 'FAILED', error: error instanceof Error ? error.message : 'Terrain provider failed' };
  }
}
```

Use `IonResource.fromAssetId(1, { accessToken })` rather than mutating `Ion.defaultAccessToken`; the token remains scoped to this terrain resource.

- [ ] **Step 4: Run GREEN plus existing map tests**

Run:

```bash
npm test -- --run src/map/terrainRuntime.test.ts src/map/cartographicReadout.test.ts src/map/cesiumAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map/terrainRuntime.ts src/map/terrainRuntime.test.ts
git commit -m "feat: add fail-safe terrain runtime"
```

---

### Task 2: Install terrain in the existing Viewer without changing app availability

**Files:**
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/ui/MapInstrumentation.tsx`
- Modify: `src/ui/MapInstrumentation.test.tsx`

**Interfaces:**
- Consumes: Task 1 `normalizeTerrainToken()` and `installPreferredTerrain()`.
- Produces: an existing Viewer that starts on ellipsoid immediately, then upgrades to real terrain asynchronously when configured.

- [ ] **Step 1: Add RED instrumentation coverage for explicit terrain state**

Extend `MapInstrumentationProps` with:

```ts
terrainState: 'READY' | 'ELLIPSOID' | 'FAILED';
```

Add tests requiring `TERRAIN 3D` only for `READY`, and `TERRAIN ELLIPSOID` for fallback/failure. Keep the existing cursor text behavior.

```tsx
render(
  <MapInstrumentation
    headingDeg={0}
    scaleLabel="10 km"
    scaleWidthPx={80}
    cursorText="31.5° S · 68.5° W · ELEV 650 m"
    webGlAvailable
    terrainState="READY"
    onRegionalView={vi.fn()}
  />,
);
expect(screen.getByText('TERRAIN 3D')).toBeVisible();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/ui/MapInstrumentation.test.tsx`

Expected: FAIL because the prop/state is not implemented.

- [ ] **Step 3: Wire terrain bootstrap into `CesiumStage`**

In the Viewer creation effect:

```ts
const [terrainState, setTerrainState] = useState<'READY' | 'ELLIPSOID' | 'FAILED'>('ELLIPSOID');

const token = normalizeTerrainToken(import.meta.env.VITE_CESIUM_ION_TOKEN);
void installPreferredTerrain(viewer, token).then((result) => {
  if (viewer.isDestroyed() || result.state === 'ABORTED') return;
  if (result.state === 'FAILED') {
    console.warn('Cesium terrain unavailable; continuing with ellipsoid fallback.');
    setTerrainState('FAILED');
  } else {
    setTerrainState(result.state);
  }
  viewer.scene.requestRender();
});
```

Do not await terrain before creating the Viewer. The operational map must remain available immediately on the existing ellipsoid path.

Pass `terrainState` into `MapInstrumentation`. Do not log the token or provider URL containing credentials.

- [ ] **Step 4: Update the cursor readout rule**

Keep terrain elevation provider-specific:

```ts
const hasTerrain = terrainState === 'READY'
  && !(viewer.terrainProvider instanceof EllipsoidTerrainProvider);
const terrainHeight = hasTerrain ? viewer.scene.globe.getHeight(cartographic) : undefined;
```

When no terrain tile height exists, `formatElevation(undefined)` remains the existing unavailable representation; do not substitute `routeSamples.elevationM`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
npm test -- --run src/map/terrainRuntime.test.ts src/ui/MapInstrumentation.test.tsx src/map/cartographicReadout.test.ts
npm run build
```

Expected: PASS. Build must also pass with no terrain token in the local environment.

- [ ] **Step 6: Commit**

```bash
git add src/map/CesiumStage.tsx src/ui/MapInstrumentation.tsx src/ui/MapInstrumentation.test.tsx
git commit -m "feat: install optional Cesium terrain"
```

---

### Task 3: Separate analytical elevation from visual terrain placement

**Files:**
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/map/cesiumAdapter.test.ts`
- Modify: `src/map/routeGeometryStyle.test.ts`
- Test existing: `src/qa/v01RoadGeometryAcceptance.test.ts`

**Interfaces:**
- Consumes: unchanged `VehicleEntitySink.setPosition(id, lon, lat, elevationM)` contract.
- Produces: terrain-relative visual placement while the adapter continues receiving analytical elevation unchanged.

- [ ] **Step 1: Add RED assertions that the map adapter still forwards analytical elevation unchanged**

Keep/extend the adapter test with a sink spy:

```ts
expect(sink.setPosition).toHaveBeenCalledWith(
  vehicle.id,
  vehicle.position.lon,
  vehicle.position.lat,
  vehicle.elevationM,
);
```

This is the architectural guard: simulation remains analytical; only the Cesium sink interprets visual Z.

- [ ] **Step 2: Run the focused adapter test**

Run: `npm test -- --run src/map/cesiumAdapter.test.ts`

Expected: PASS before visual changes; keep this as the compatibility baseline.

- [ ] **Step 3: Change point graphics to terrain-relative height**

Import `HeightReference` and change entity construction, not the adapter contract:

```ts
point: {
  ...,
  heightReference: HeightReference.RELATIVE_TO_GROUND,
}
```

For operational vehicle positions use visual offset only:

```ts
const next = Cartesian3.fromDegrees(lon, lat, 8);
```

For background traffic:

```ts
const next = Cartesian3.fromDegrees(lon, lat, 5);
```

For project markers keep the existing display separation (`80` active, `20` inactive) but make point and active label `HeightReference.RELATIVE_TO_GROUND`.

Do not delete or rewrite the `elevationM` parameter. Name it `_elevationM` inside the Cesium sink only if lint/type rules require acknowledging it; the adapter and domain contract stay unchanged.

- [ ] **Step 4: Clamp operational corridor lines to ground**

Keep the existing analytical coordinates as a fallback when terrain polylines are unsupported, but set:

```ts
polyline: {
  positions,
  width: style.width,
  material,
  clampToGround: true,
  zIndex: 10,
}
```

Cesium 1.132 supports `PolylineGraphics.clampToGround`; on supported scenes the line follows terrain, and `zIndex` gives the operational corridor priority over later road-context ground lines.

- [ ] **Step 5: Run the complete operational regression before any road-context work**

Run:

```bash
npm test -- --run src/map/cesiumAdapter.test.ts src/map/routeGeometryStyle.test.ts src/qa/v01RoadGeometryAcceptance.test.ts
npm run validate:data
npm run validate:road-geometry -- veladero
npm run build
```

Expected: all PASS. No operational artifact should change in `git status`.

- [ ] **Step 6: Commit**

```bash
git add src/map/CesiumStage.tsx src/map/cesiumAdapter.test.ts src/map/routeGeometryStyle.test.ts
git commit -m "feat: render operation relative to terrain"
```

---

### Task 4: Production terrain configuration and real-WebGL terrain gate

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: repository secret `CESIUM_ION_PUBLIC_TOKEN` created in GitHub settings.
- Produces: `VITE_CESIUM_ION_TOKEN` only during the Pages build; client code remains functional when absent.

- [ ] **Step 1: Update Pages build environment**

Change only the build step:

```yaml
- name: Build for Pages
  env:
    VITE_BASE_PATH: /sanjuan-mining-ops-sim/
    VITE_CESIUM_ION_TOKEN: ${{ secrets.CESIUM_ION_PUBLIC_TOKEN }}
  run: npm run build
```

Do not add the token to `.env`, README examples, source files, tests, workflow output, or artifacts intentionally. The compiled browser token is necessarily observable; security comes from the token being public/read-only and URL/asset restricted.

- [ ] **Step 2: Document the exact token policy**

Add a short deployment section to README:

```text
CESIUM_ION_PUBLIC_TOKEN
- dedicated to sanjuan-mining-ops-sim
- read-only/public asset access only
- restricted to the GitHub Pages deployment origin/path and local dev origins when required
- never use the account default token
```

- [ ] **Step 3: Verify the no-token fallback locally/CI**

Run:

```bash
npm test -- --run
npm run build
npm run qa:visual
```

Expected: PASS with no token. Headless/WebGL fallback must remain unchanged.

- [ ] **Step 4: Real-WebGL terrain smoke gate**

On a WebGL-capable browser with a valid restricted token, inspect:

```text
San Juan regional view
Tudcum → Conconta transition
Veladero / high Cordillera
```

Required observations before Task 5:

```text
terrain relief visibly present
operational corridor follows terrain instead of floating above flat ellipsoid
vehicle points stay visually attached to terrain-following corridor
playback, selection, Sources, north arrow, scale and cursor remain usable
```

If the current execution environment cannot initialize WebGL, record the gate as `PENDING REAL BROWSER` and do not claim terrain visual acceptance. Do not weaken automated tests to compensate.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "ci: configure production Cesium terrain token"
```

---

### Task 5: Build and validate the IGN road-context artifact

**Files:**
- Create: `scripts/build-road-context.mjs`
- Create: `scripts/build-road-context.test.mjs`
- Create: `scripts/validate-road-context.mjs`
- Modify: `package.json`
- Create conditionally after provenance gate: `public/data/context/roads-context.v1.geojson`
- Create conditionally after provenance gate: `public/data/context/roads-context.v1.json`

**Interfaces:**
- Consumes authoring source: `Geo_Platform/web/public/data/san_juan_rutas.geojson` from GeoPlatform commit `a4812d053f4f381b9d3e1d5ff30abb9fed7d6772`, blob `1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70`.
- Consumes corridor route-sample files: Hualilán V1, Veladero V2, Los Azules V1.
- Produces checked-in context GeoJSON + sidecar only after source/provider terms are recorded.

- [ ] **Step 1: Write RED tests for deterministic context generation**

Export pure helpers from the `.mjs` script and test:

```js
assert.deepEqual(normalizeRoadFeature({
  type: 'Feature',
  properties: { gid: 10, objeto: 'Huella', rtn: null, sag: 'IGN' },
  geometry: { type: 'MultiLineString', coordinates: [[[-69.0, -31.0], [-69.1, -30.9]]] },
}), {
  type: 'Feature',
  properties: { id: 'ign:10', objectType: 'Huella', roadRef: null, sourceAgency: 'IGN' },
  geometry: { type: 'MultiLineString', coordinates: [[[-69.0, -31.0], [-69.1, -30.9]]] },
});
```

Also require:

- non-IGN/malformed source records fail;
- output order sorts by stable `id`;
- feature-bbox intersection is deterministic;
- no operational fields such as `corridorId`, `distanceKm`, `segmentId`, `speedKph`, `eta`, `accessAllowed`, or `routeMembership` are emitted;
- metadata requires non-empty `sourceUrl`, `licenseUrl`, `attribution`, `sourceCommit`, `sourceBlobSha`, `selectionMethod`, `featureCount`, and `limitations`.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/build-road-context.test.mjs`

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement source bounds and normalization**

Use the three checked-in route-sample bundles to compute one regional bounding box, then expand each side by exactly `0.25` degrees. Select a source feature when its own geometry bbox intersects that expanded bbox. Do **not** simplify or alter selected source coordinates in V0.1.1; feature-level bbox selection is safer than inventing geometry clipping/simplification for a visual layer.

Metadata must record:

```json
{
  "schemaVersion": "sanjuan.road-context/v1",
  "id": "san-juan-ign-road-context-v1",
  "provider": "Instituto Geográfico Nacional de la República Argentina",
  "authoringSource": "Geo_Platform/web/public/data/san_juan_rutas.geojson",
  "sourceCommit": "a4812d053f4f381b9d3e1d5ff30abb9fed7d6772",
  "sourceBlobSha": "1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70",
  "sourceUrl": "https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG",
  "licenseUrl": "https://www.ign.gob.ar/descargas/tyc1.html",
  "attribution": "FUENTE: Instituto Geográfico Nacional de la República Argentina",
  "selectionMethod": "feature-bbox intersection around active-corridor route-sample bbox + 0.25 degrees",
  "contextPaddingDegrees": 0.25,
  "featureCount": 0,
  "limitations": [
    "Cartographic reference only; not an operational route, access authorization, road-status or navigation dataset.",
    "The exact historical IGN download endpoint used when the GeoPlatform authoring file was added was not recorded; provider identity is retained in the source attributes and official IGN reuse terms are cited separately."
  ]
}
```

Set `featureCount` to the actual generated count. Do not guess a license name; point to the official terms URL and preserve the required attribution text.

- [ ] **Step 4: Add explicit CLI and validator scripts**

Package scripts:

```json
"build:road-context": "node scripts/build-road-context.mjs",
"validate:road-context": "node scripts/validate-road-context.mjs"
```

CLI contract:

```bash
node scripts/build-road-context.mjs --input /absolute/or/relative/path/to/san_juan_rutas.geojson
```

The builder writes only the two `public/data/context/` artifacts. The validator checks checked-in files only and must not read the private GeoPlatform repo or call the network.

- [ ] **Step 5: Run GREEN and deterministic double-build**

Run:

```bash
node --test scripts/build-road-context.test.mjs
npm run build:road-context -- --input ../Geo_Platform/web/public/data/san_juan_rutas.geojson
sha256sum public/data/context/roads-context.v1.geojson public/data/context/roads-context.v1.json
npm run build:road-context -- --input ../Geo_Platform/web/public/data/san_juan_rutas.geojson
sha256sum public/data/context/roads-context.v1.geojson public/data/context/roads-context.v1.json
npm run validate:road-context
```

Expected: both SHA-256 pairs identical and validator PASS. If the source file is not available locally, materialize/fetch the exact GeoPlatform blob at the pinned commit for this authoring step only; do not add a CI dependency on it.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-road-context.mjs scripts/build-road-context.test.mjs scripts/validate-road-context.mjs package.json public/data/context
git commit -m "feat: add versioned IGN road context"
```

---

### Task 6: Load, render and disclose road context without touching operational loading

**Files:**
- Create: `src/data/loadRoadContext.ts`
- Create: `src/data/loadRoadContext.test.ts`
- Create: `src/map/roadContextStyle.ts`
- Create: `src/map/roadContextStyle.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/ui/AnalysisDrawer.tsx`
- Modify: `src/ui/AnalysisDrawer.test.tsx`

**Interfaces:**
- Produces:
  - `RoadContextMetadata`
  - `RoadContextFeature`
  - `RoadContextData`
  - `loadRoadContext(fetcher: JsonFetcher): Promise<RoadContextData>`
  - `roadContextStyle(objectType: string): { width: number; alpha: number; color: string }`
- `CesiumStageProps` gains `roadContext: RoadContextData | null`.
- `AnalysisDrawerProps` gains `roadContext: RoadContextData | null`.

- [ ] **Step 1: Write RED loader tests**

Require valid metadata/GeoJSON pairing and reject:

```text
wrong schemaVersion
empty provider/sourceUrl/licenseUrl/attribution
featureCount mismatch
non-FeatureCollection geometry
unsupported geometry type
invalid coordinate pair
missing id/objectType/sourceAgency
```

Use the same `JsonFetcher` shape as existing static loaders.

- [ ] **Step 2: Write RED style hierarchy tests**

```ts
expect(roadContextStyle('Huella').width).toBeLessThan(routeGeometryStyle('APPROXIMATE_APPROACH').width);
expect(roadContextStyle('Huella').alpha).toBeLessThan(routeGeometryStyle('APPROXIMATE_APPROACH').alpha);
expect(roadContextStyle('Ruta Provincial').width).toBeLessThan(routeGeometryStyle('APPROXIMATE_APPROACH').width);
```

Use values no stronger than:

```ts
Huella: { width: 0.75, alpha: 0.12, color: '#cbd5e1' }
other road: { width: 1, alpha: 0.18, color: '#cbd5e1' }
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- --run src/data/loadRoadContext.test.ts src/map/roadContextStyle.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the optional loader and independent App state**

In `App.tsx`, keep the required operational `Promise.all()` unchanged. Start road context separately:

```ts
const [roadContext, setRoadContext] = useState<RoadContextData | null>(null);

void loadRoadContext(fetcher)
  .then((loaded) => {
    if (!cancelled) setRoadContext(loaded);
  })
  .catch((error: unknown) => {
    if (!cancelled) {
      console.warn('Road context unavailable; continuing without contextual roads.', error);
      setRoadContext(null);
    }
  });
```

A road-context 404/parse failure must never call `setDataError()`.

- [ ] **Step 5: Render road context below the operational corridors**

In `CesiumStage`, use a dedicated `roadContextReadyRef`. For every LineString/MultiLineString part:

```ts
dataSource.entities.add({
  id: `road-context:${feature.properties.id}:${partIndex}`,
  name: `${feature.properties.objectType} · IGN context`,
  polyline: {
    positions: coordinates.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 0)),
    width: style.width,
    material: Color.fromCssColorString(style.color).withAlpha(style.alpha),
    clampToGround: true,
    zIndex: 0,
  },
});
```

Operational corridor ground lines remain `zIndex: 10`. Do not add click handlers or operational selection semantics to road-context entities.

- [ ] **Step 6: Add Sources disclosure only when loaded**

Add a `ROAD CONTEXT` section to `AnalysisDrawer` only when `roadContext` is non-null. Show provider, attribution, source link, terms link, build/source date/commit reference, and limitations. Copy must explicitly say:

```text
Cartographic context only. This network does not drive vehicle movement, ETA, access, routing or road-status decisions.
```

Add a test proving the section is absent when `roadContext={null}` and present when a valid fixture is supplied.

- [ ] **Step 7: Run GREEN plus app regression**

Run:

```bash
npm test -- --run src/data/loadRoadContext.test.ts src/map/roadContextStyle.test.ts src/ui/AnalysisDrawer.test.tsx src/app/App.test.tsx
npm run validate:road-context
npm run build
```

Expected: PASS. Existing operational-data-unavailable behavior remains tied only to required operational artifacts.

- [ ] **Step 8: Commit**

```bash
git add src/data/loadRoadContext.ts src/data/loadRoadContext.test.ts src/map/roadContextStyle.ts src/map/roadContextStyle.test.ts src/app/App.tsx src/map/CesiumStage.tsx src/ui/AnalysisDrawer.tsx src/ui/AnalysisDrawer.test.tsx
git commit -m "feat: render optional IGN road context"
```

---

### Task 7: CI, claims, documentation and V0.1.1 acceptance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/data-sources.md`
- Modify: `README.md`
- Create: `docs/qa/v0-1-1-terrain-road-context-acceptance.md`
- Test existing: `src/qa/v01RoadGeometryAcceptance.test.ts`

**Interfaces:**
- Consumes all previous tasks.
- Produces one auditable release gate without changing V0.1 operational artifacts.

- [ ] **Step 1: Add road-context validation to CI after core data validation**

```yaml
- name: Validate road context
  run: npm run validate:road-context
```

Do not provide a terrain token to normal PR CI. CI must prove the no-token ellipsoid path builds and tests cleanly.

- [ ] **Step 2: Update data-source documentation**

Document three separate elevation/network concepts:

```text
Analytical elevation → checked-in profile/route samples; simulation/context semantics.
Cesium terrain → visual topographic surface only; external render provider.
IGN road context → checked-in cartographic reference only; never routing/movement.
```

Record the road-context authoring commit/blob, official IGN portal, official terms URL, exact attribution string, 0.25° context padding, generated feature count, and limitations from the sidecar.

- [ ] **Step 3: Run the full automated gate**

Run exactly:

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run validate:road-geometry -- veladero
npm run audit:claims
npm run build
npm run qa:visual
```

Expected:

```text
all tests PASS
all validators PASS
claim audit completes for human review
TypeScript + Vite build PASS
responsive visual QA/fallback PASS
```

Also verify:

```bash
git diff main -- public/data/corridors public/data/runs public/data/environment public/data/calibration
```

Expected: no changes to V0/V0.1 operational artifacts.

- [ ] **Step 4: Create the acceptance record from observed output only**

`docs/qa/v0-1-1-terrain-road-context-acceptance.md` must record:

```text
branch + tested HEAD
exact test count and CI run id
terrain runtime fallback tests
whether real WebGL terrain smoke is PASS or still PENDING
road-context feature count and artifact hashes
source commit/blob + official IGN terms/attribution
confirmation that v01RoadGeometryAcceptance still passes
confirmation that operational artifacts are unchanged
known headless WebGL limitation if still applicable
```

Do not write success values before they are observed.

- [ ] **Step 5: Final real-browser production smoke after merge/deploy**

Verify:

```text
no Operational data unavailable message
terrain visible in Cordillera
corridor and vehicles visually attached to terrain
IGN roads subdued behind operational corridor
Veladero evidence-class line styling remains readable
Sources distinguishes ROAD GEOMETRY vs ROAD CONTEXT
OSM and IGN attribution/limitations remain accurate
playback and vehicle selection still work
GitHub Pages base path has no data/asset 404s
```

If WebGL cannot be tested in the execution environment, leave this item explicitly pending instead of claiming completion.

- [ ] **Step 6: Commit docs/CI**

```bash
git add .github/workflows/ci.yml docs/data-sources.md README.md docs/qa/v0-1-1-terrain-road-context-acceptance.md
git commit -m "docs: record V0.1.1 terrain road context acceptance"
```

---

## Plan Self-Review Result

- **Spec coverage:** terrain provider/fallback, analytical-vs-visual Z, terrain-relative corridor/vehicle/project rendering, optional road-context preprocessing, provenance, independent loading, visual hierarchy, fail-closed behavior, tests, real-browser gates and documentation all map to Tasks 1–7.
- **Scope:** one release with a strict dependency order. Terrain is independently shippable after Task 4; road context cannot weaken terrain or operational correctness.
- **Type consistency:** `RoadContextData`, `TerrainInstallResult`, `loadRoadContext()`, `installPreferredTerrain()`, and `roadContextStyle()` have one stable name throughout the plan.
- **Operational boundary:** no task edits `src/simulation/engine.ts`, route math, run artifacts, environment artifacts, traffic calibration, corridor V2 geometry, route samples, or elevation profile.
- **Security:** no secret token is committed; PR CI remains tokenless; Pages consumes one dedicated public/read-only token via secret injection.
- **No placeholder implementation steps:** every conditional is an explicit fail-closed release gate rather than an unfinished requirement.
