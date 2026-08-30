# San Juan Mining Ops Sim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, map-first Cesium simulation of 24 synthetic mining mobilizations across three sourced/reconstructed San Juan corridors, with versioned elevation/weather context, provenance, background traffic, and compact responsive operational UI.

**Architecture:** Keep sourced territory/evidence, synthetic operation, pure simulation, environment lookup, and presentation adapters separate. The browser loads immutable versioned assets, the pure engine derives `OperationalSnapshot` values from `SanJuanOperationSpec + OperationalRun + simTime`, and a Cesium adapter updates persistent entities without owning simulation logic.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, CesiumJS (direct Viewer integration, no Resium), Zod for runtime contracts, browser Web Animations API for small UI transitions, static JSON/GeoJSON assets, Node scripts for asset validation/build steps.

**Spec:** `docs/superpowers/specs/2026-08-30-sanjuan-mining-ops-sim-design.md`

## Global Constraints

- Operational day is exactly `06:00` to `20:00` in `America/Argentina/San_Juan`.
- Playback options are exactly `60×`, `120×`, `300×`, `600×`; default is `300×`; initial state is paused.
- V0 has exactly 24 highlighted synthetic operational vehicles: 12 `PERSONNEL`, 6 `FIELD`, 6 `LOGISTICS`.
- Active operational destinations are Hualilán, Veladero, and Los Azules; the other seven sourced projects remain regional context only.
- V0 `OperationalRun.mode` is `SIMULATED`; weather semantics live in `EnvironmentSnapshot.modelKind`.
- Weather/environment never changes vehicle speed, state, closures, or transitability in V0.
- Evidence roles must remain explicit: `PRIMARY`, `DERIVED`, `CALIBRATION`, `ANALOGUE`, `QUALITATIVE`, `SYNTHETIC_ASSUMPTION`, `METHOD_REFERENCE`.
- Corridor geometry classes are `PUBLIC_ROAD`, `RECONSTRUCTED_ACCESS`, `APPROXIMATE_APPROACH`, `PROJECT_LOCATION`; reconstructed/approximate geometry must never be presented as operator-verified.
- Source states are `READY`, `STALE`, `PARTIAL`, `UNAVAILABLE`; missing critical evidence fails closed.
- One Cesium `Viewer`; one primary active `CustomDataSource`; do not recreate all vehicle entities every frame.
- No React state update on every animation frame; animation-frame work lives in the controller/adapter boundary.
- No provider request per vehicle or simulation tick; weather is consumed from immutable versioned snapshots.
- UI motion is restrained (~160–220 ms) and honors `prefers-reduced-motion`.
- No clipped text/charts/labels, no oversized panels hiding most of the map, and no decorative cartographic controls.
- Main experience must expose north reference, scale, coordinate readout, elevation readout, and imagery/terrain attribution.
- No live GPS, real company telemetry, mine dispatch/FMS, safety prediction, automatic closures, OEM physics, mine-internal haulage, auth/database/AI agent, or sensitive private routes in V0.

---

## File Structure Map

Create/maintain these focused units as the implementation evolves:

```text
src/
  app/
    App.tsx                     # composition only
    app.css                     # global layout/tokens/responsive rules
  domain/
    contracts.ts               # TypeScript domain types
    schemas.ts                 # Zod runtime schemas
    evidence.ts                # evidence/source helpers
  simulation/
    clock.ts                    # operational clock math
    rng.ts                      # deterministic named streams
    routeMath.ts                # route-sample interpolation
    vehicle.ts                  # vehicle snapshot/state derivation
    engine.ts                   # whole-operation snapshot derivation
    events.ts                   # operational/context event derivation
  environment/
    lookup.ts                   # weather-at-passage lookup/interpolation
    contextRules.ts             # display-only context rules
  data/
    loadOperation.ts            # fetch + validate immutable V0 assets
  map/
    CesiumMap.tsx               # Viewer lifecycle only
    cesiumAdapter.ts            # persistent entities + snapshot updates
    cartographicReadout.ts      # compass/scale/cursor/elevation utilities
  ui/
    IntroOverlay.tsx
    CommandHud.tsx
    Timeline.tsx
    VehiclePanel.tsx
    AnalysisDrawer.tsx
    SourceState.tsx
  test/
    setup.ts

scripts/
  validate-data.mjs             # validate all checked-in JSON/GeoJSON assets
  build-environment.mjs         # produce immutable environment snapshot artifact
  build-route-samples.mjs       # derive route distance samples from versioned geometry/profile

public/data/
  projects/projects.v1.json
  corridors/hualilan/*.json|geojson
  corridors/veladero/*.json|geojson
  corridors/los-azules/*.json|geojson
  environment/environment-sj-*.json
  calibration/traffic.v1.json
  runs/sanjuan-v0-run.v1.json
```

No single UI component should become the source of truth for simulation state, provenance, or asset validation.

---

### Task 1: Scaffold the tested React/Cesium application shell

**Files:**
- Create/modify via scaffold: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`
- Create: `src/app/App.tsx`
- Create: `src/app/app.css`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: none.
- Produces: a green React/Vite/Vitest baseline and a root `<App />` ready for domain work.

- [ ] **Step 1: Scaffold the Vite React TypeScript project into the repository**

Run from repository root:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install cesium zod
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-plugin-static-copy
```

Preserve the existing `README.md`, `LICENSE`, `docs/`, and `.gitignore`; if the scaffold wants to overwrite them, restore those files from `main` before continuing.

- [ ] **Step 2: Add Vitest and Cesium static-asset configuration**

Add to `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
      ],
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Write the failing shell test**

`src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the product shell without implying live telemetry', () => {
    render(<App />);
    expect(screen.getByText('SAN JUAN MINING OPS SIM')).toBeInTheDocument();
    expect(screen.getByText(/synthetic operation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the shell test and verify RED**

```bash
npm test -- --run src/app/App.test.tsx
```

Expected: FAIL because `App` does not yet export the required shell copy.

- [ ] **Step 5: Implement the minimal shell**

`src/app/App.tsx`:

```tsx
import './app.css';

export function App() {
  return (
    <main className="app-shell">
      <h1>SAN JUAN MINING OPS SIM</h1>
      <p>Real territory · modelled environment · synthetic operation.</p>
    </main>
  );
}
```

Update `src/main.tsx` to render this `App` export and import Cesium widget CSS:

```ts
import 'cesium/Build/Cesium/Widgets/widgets.css';
```

- [ ] **Step 6: Verify test, typecheck, and build**

```bash
npm test -- --run
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig*.json index.html src
 git commit -m "chore: scaffold tested Cesium app shell"
```

---

### Task 2: Define and runtime-validate the domain contracts

**Files:**
- Create: `src/domain/contracts.ts`
- Create: `src/domain/schemas.ts`
- Create: `src/domain/evidence.ts`
- Create: `src/domain/schemas.test.ts`

**Interfaces:**
- Consumes: Zod.
- Produces: `parseOperationSpec(input)`, `parseEnvironmentSnapshot(input)`, `parseOperationalRun(input)` and exported domain types used by every later task.

- [ ] **Step 1: Write failing validation tests**

Cover these exact cases in `src/domain/schemas.test.ts`:

```ts
it('rejects a corridor with no evidence refs', () => { /* parse throws */ });
it('rejects a V0 run with OBSERVED mode', () => { /* parse throws */ });
it('accepts source states READY STALE PARTIAL UNAVAILABLE', () => { /* all parse */ });
it('preserves geometry evidence class', () => { /* output class unchanged */ });
```

Use a shared valid fixture built in the test file and mutate one field per test.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- --run src/domain/schemas.test.ts
```

Expected: FAIL because schemas/functions do not exist.

- [ ] **Step 3: Implement exact core enums/types**

`src/domain/contracts.ts` must export at minimum:

```ts
export type SourceState = 'READY' | 'STALE' | 'PARTIAL' | 'UNAVAILABLE';
export type EvidenceRole = 'PRIMARY' | 'DERIVED' | 'CALIBRATION' | 'ANALOGUE' | 'QUALITATIVE' | 'SYNTHETIC_ASSUMPTION' | 'METHOD_REFERENCE';
export type GeometryEvidenceClass = 'PUBLIC_ROAD' | 'RECONSTRUCTED_ACCESS' | 'APPROXIMATE_APPROACH' | 'PROJECT_LOCATION';
export type VehicleType = 'PERSONNEL' | 'FIELD' | 'LOGISTICS';
export type VehicleState = 'AT_BASE' | 'EN_ROUTE' | 'AT_STOP' | 'AT_PROJECT' | 'RETURNING' | 'DONE';
export type ContextSeverity = 'INFO' | 'ATTENTION';

export interface EvidenceRef {
  id: string;
  role: EvidenceRole;
  sourceName: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceTimestamp?: string;
  method?: string;
  license?: string;
  limitations: string[];
}

export interface RouteSample {
  distanceKm: number;
  lon: number;
  lat: number;
  elevationM: number;
  segmentId: string;
}
```

Then define the spec-approved `CorridorDefinition`, `CorridorSegment`, `VehicleDefinition`, `EnvironmentSnapshot`, `EnvironmentNode`, `EnvironmentHour`, `OperationalRun`, `OperationalEvent`, `ContextEvent`, `VehicleSnapshot`, and `OperationalSnapshot` interfaces using the exact names above.

- [ ] **Step 4: Implement Zod schemas and parse helpers**

`src/domain/schemas.ts` exports:

```ts
export function parseOperationSpec(input: unknown): SanJuanOperationSpec;
export function parseEnvironmentSnapshot(input: unknown): EnvironmentSnapshot;
export function parseOperationalRun(input: unknown): OperationalRun;
```

Enforce V0 run mode with:

```ts
const operationalRunSchema = z.object({
  mode: z.literal('SIMULATED'),
  // remaining approved fields
});
```

Require non-empty evidence arrays on critical sourced assets and require `synthetic: z.literal(true)` on every operational vehicle.

- [ ] **Step 5: Implement evidence helpers**

`src/domain/evidence.ts`:

```ts
export function evidenceById(refs: EvidenceRef[]): Map<string, EvidenceRef> {
  return new Map(refs.map((ref) => [ref.id, ref]));
}

export function assertEvidenceRefsExist(ids: string[], refs: EvidenceRef[]): void {
  const index = evidenceById(refs);
  const missing = ids.filter((id) => !index.has(id));
  if (missing.length) throw new Error(`Missing evidence refs: ${missing.join(', ')}`);
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --run src/domain/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain
 git commit -m "feat: add validated operation contracts"
```

---

### Task 3: Implement deterministic clock and named RNG streams

**Files:**
- Create: `src/simulation/clock.ts`
- Create: `src/simulation/rng.ts`
- Create: `src/simulation/clock.test.ts`
- Create: `src/simulation/rng.test.ts`

**Interfaces:**
- Consumes: no browser/UI dependencies.
- Produces: `OperationalClock`, `advanceClock`, `resetClock`, `createNamedRng(seed, name)`.

- [ ] **Step 1: Write failing clock tests**

```ts
expect(createClock().minuteOfDay).toBe(360); // 06:00
expect(advanceClock(createClock(), 1_000, 300).minuteOfDay).toBe(365); // 5 sim min
expect(advanceClock(createClock({ minuteOfDay: 1199 }), 1000, 600).minuteOfDay).toBe(1200); // clamp 20:00
expect(resetClock(createClock({ minuteOfDay: 900 })).minuteOfDay).toBe(360);
```

Also verify paused clocks do not advance.

- [ ] **Step 2: Write failing RNG tests**

Verify:

```ts
createNamedRng('20260830', 'departures')();
```

returns the same sequence across two instances, while `departures` and `dwellTimes` streams differ.

- [ ] **Step 3: Run tests and verify RED**

```bash
npm test -- --run src/simulation/clock.test.ts src/simulation/rng.test.ts
```

- [ ] **Step 4: Implement clock math**

Use integer/float simulated minutes, never wall-clock `Date` arithmetic:

```ts
export const START_MINUTE = 6 * 60;
export const END_MINUTE = 20 * 60;

export interface OperationalClock {
  minuteOfDay: number;
  playing: boolean;
}

export function advanceClock(clock: OperationalClock, elapsedRealMs: number, playback: 60 | 120 | 300 | 600): OperationalClock {
  if (!clock.playing) return clock;
  const simulatedMinutes = (elapsedRealMs / 1000) * (playback / 60);
  return { ...clock, minuteOfDay: Math.min(END_MINUTE, clock.minuteOfDay + simulatedMinutes) };
}
```

- [ ] **Step 5: Implement a small deterministic PRNG with named seed hashing**

`createNamedRng(seed, name)` hashes `${seed}:${name}` to uint32 and feeds a local Mulberry32 generator. No code outside `rng.ts` uses `Math.random()` for scenario generation.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/simulation/clock.test.ts src/simulation/rng.test.ts
git add src/simulation
 git commit -m "feat: add deterministic operational clock"
```

---

### Task 4: Add sourced project registry and provenance validation

**Files:**
- Create: `public/data/projects/projects.v1.json`
- Create: `src/data/loadOperation.ts`
- Create: `src/data/loadOperation.test.ts`
- Create: `scripts/validate-data.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2 parse helpers.
- Produces: `loadProjects(fetcher): Promise<ProjectDefinition[]>` and `npm run validate:data`.

- [ ] **Step 1: Write failing loader tests**

Use a fake `fetcher` and assert:

```ts
const projects = await loadProjects(fakeFetch);
expect(projects).toHaveLength(10);
expect(projects.filter((p) => p.activeOperationalDestination)).toHaveLength(3);
expect(projects.map((p) => p.name)).toEqual(expect.arrayContaining(['Hualilán', 'Veladero', 'Los Azules']));
```

Add a failure case for a project whose evidence reference is absent.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/data/loadOperation.test.ts
```

- [ ] **Step 3: Create `projects.v1.json`**

Populate exactly these projects: Filo del Sol, Josemaría, Veladero, Gualcamayo, El Pachón, Los Azules, Altar, Hualilán, Casposo, Filo Sur. Each record must contain stable id, display name, sourced project location coordinates, `activeOperationalDestination`, and evidence refs. The file must also contain a top-level evidence registry with source name, source URL, retrieval date, role, and limitations.

Do not infer operator-private facilities. Project markers represent sourced project locations only.

- [ ] **Step 4: Implement loader + evidence checks**

`loadProjects` must parse JSON, validate the exact count/active destinations, and call `assertEvidenceRefsExist` for every project.

- [ ] **Step 5: Add static-data validation script**

`package.json`:

```json
{
  "scripts": {
    "validate:data": "node scripts/validate-data.mjs"
  }
}
```

`scripts/validate-data.mjs` must read checked-in JSON files, fail non-zero for invalid JSON/missing required project evidence, and print a concise asset count summary.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/data/loadOperation.test.ts
npm run validate:data
git add public/data/projects src/data scripts/validate-data.mjs package.json
 git commit -m "feat: add sourced San Juan project registry"
```

---

### Task 5: Build the first corridor asset pipeline with Hualilán

**Files:**
- Create: `public/data/corridors/hualilan/corridor.v1.geojson`
- Create: `public/data/corridors/hualilan/profile.v1.json`
- Create: `public/data/corridors/hualilan/metadata.v1.json`
- Create: `public/data/corridors/hualilan/route-samples.v1.json`
- Create: `scripts/build-route-samples.mjs`
- Create: `src/simulation/routeMath.ts`
- Create: `src/simulation/routeMath.test.ts`
- Modify: `scripts/validate-data.mjs`

**Interfaces:**
- Consumes: versioned public road geometry + derived elevation profile.
- Produces: `positionAtDistance(samples, distanceKm): RouteSample` and a validated Hualilán corridor asset bundle.

- [ ] **Step 1: Audit and record corridor evidence before adding geometry**

Use public road sources only. Record each used source URL, retrieval date, method, and limitation in `metadata.v1.json`. Any portion derived from public roads but not operator-verified must be classed `RECONSTRUCTED_ACCESS`; if the final approach cannot be supported, class it `APPROXIMATE_APPROACH` or stop the corridor short of unsupported geometry.

Acceptance: no segment may use an evidence class stronger than its source supports.

- [ ] **Step 2: Write failing route-math tests**

```ts
const samples = [
  { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 'a' },
  { distanceKm: 10, lon: -69, lat: -30, elevationM: 1600, segmentId: 'b' },
];
const p = positionAtDistance(samples, 5);
expect(p.lon).toBeCloseTo(-68.5);
expect(p.lat).toBeCloseTo(-30.5);
expect(p.elevationM).toBeCloseTo(1100);
```

Also test clamping at 0/end and segment-id selection.

- [ ] **Step 3: Implement route interpolation**

`positionAtDistance` performs binary search by `distanceKm`, linear interpolation for lon/lat/elevation, and returns the downstream sample's `segmentId` when crossing a boundary.

- [ ] **Step 4: Implement `build-route-samples.mjs`**

The script reads corridor geometry + elevation profile and writes deterministic samples sorted by distance with fields exactly matching `RouteSample`. It must reject non-monotonic distance or missing segment assignment.

- [ ] **Step 5: Extend `validate:data` for corridor invariants**

Checks:

```text
geometry has >= 2 coordinates
segments cover [0,totalDistance] without gaps/overlap
route samples are monotonic
first sample distance = 0
last sample distance ~= total corridor distance
all evidence refs resolve
all geometry classes are approved enum values
```

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/simulation/routeMath.test.ts
npm run validate:data
git add public/data/corridors/hualilan scripts src/simulation/routeMath*
 git commit -m "feat: add Hualilan corridor asset pipeline"
```

---

### Task 6: Add Veladero and Los Azules corridor bundles using the same contract

**Files:**
- Create: `public/data/corridors/veladero/{corridor.v1.geojson,profile.v1.json,metadata.v1.json,route-samples.v1.json}`
- Create: `public/data/corridors/los-azules/{corridor.v1.geojson,profile.v1.json,metadata.v1.json,route-samples.v1.json}`
- Create: `src/data/corridors.test.ts`

**Interfaces:**
- Consumes: Task 5 corridor contract/pipeline.
- Produces: three validated active corridor bundles with segment IDs and evidence classes.

- [ ] **Step 1: Write failing registry test**

Load all corridor metadata and assert:

```ts
expect(corridors.map((c) => c.id).sort()).toEqual(['hualilan', 'los-azules', 'veladero']);
expect(corridors.every((c) => c.routeSamples.length > 1)).toBe(true);
expect(corridors.every((c) => c.evidenceRefs.length > 0)).toBe(true);
```

- [ ] **Step 2: Build Veladero corridor evidence chain**

Use sourced public road geometry through San Juan/Iglesia/Tudcum where available. Treat mine-access portions as `RECONSTRUCTED_ACCESS` unless operator/public evidence validates them. Segment the corridor into the approved operational hierarchy (San Juan→Albardón→Talacasto→Iglesia→Tudcum→high mountain→project approach) using versioned distance boundaries.

- [ ] **Step 3: Build Los Azules corridor evidence chain**

Use sourced public roads toward Calingasta and only supported public/reconstructed access beyond. Preserve a distinct approach evidence class where the public record does not validate an operator route.

- [ ] **Step 4: Generate route samples and validate all three corridors**

```bash
node scripts/build-route-samples.mjs hualilan
node scripts/build-route-samples.mjs veladero
node scripts/build-route-samples.mjs los-azules
npm run validate:data
```

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- --run src/data/corridors.test.ts
git add public/data/corridors src/data/corridors.test.ts
 git commit -m "feat: add Veladero and Los Azules corridors"
```

---

### Task 7: Implement vehicle state, speed profiles, stops, and deterministic 24-unit schedule

**Files:**
- Create: `src/simulation/vehicle.ts`
- Create: `src/simulation/vehicle.test.ts`
- Create: `src/simulation/schedule.ts`
- Create: `src/simulation/schedule.test.ts`
- Create: `public/data/runs/sanjuan-v0-run.v1.json`

**Interfaces:**
- Consumes: `RouteSample[]`, named RNG streams, operation contracts.
- Produces: `snapshotVehicle(vehicle, corridor, simMinute): VehicleSnapshot`, `buildV0Schedule(seed): VehicleDefinition[]`.

- [ ] **Step 1: Write failing state-machine tests**

For a compact fixture vehicle assert exact states before departure, during outbound travel, at a planned stop, at project dwell, on return, and after completion.

```ts
expect(snapshotVehicle(vehicle, corridor, 350).state).toBe('AT_BASE');
expect(snapshotVehicle(vehicle, corridor, 370).state).toBe('EN_ROUTE');
expect(snapshotVehicle(vehicle, corridor, 900).state).toBe('RETURNING');
```

- [ ] **Step 2: Write failing schedule tests**

```ts
const fleet = buildV0Schedule('20260830');
expect(fleet).toHaveLength(24);
expect(fleet.filter((v) => v.type === 'PERSONNEL')).toHaveLength(12);
expect(fleet.filter((v) => v.type === 'FIELD')).toHaveLength(6);
expect(fleet.filter((v) => v.type === 'LOGISTICS')).toHaveLength(6);
expect(new Set(fleet.map((v) => v.id)).size).toBe(24);
expect(buildV0Schedule('20260830')).toEqual(buildV0Schedule('20260830'));
```

- [ ] **Step 3: Implement versioned synthetic speed profiles**

Define a small scenario table keyed by vehicle type and segment class (`pavedLowland`, `mountainRoad`, `highMountain`, `approach`). Every value is attached to an evidence ref with role `SYNTHETIC_ASSUMPTION`; do not call these observed speeds.

- [ ] **Step 4: Implement `snapshotVehicle`**

Compute travel duration by walking corridor segments and planned stops; derive outbound/at-project/return position deterministically; use `positionAtDistance` for coordinates/elevation; calculate ETA from the same schedule model.

- [ ] **Step 5: Implement `buildV0Schedule`**

Use named RNG streams `departures`, `vehicleAssignment`, `dwellTimes`, `returnOffsets`. Stagger departures; ensure every active corridor receives all three vehicle categories and at least one return movement before 20:00.

- [ ] **Step 6: Freeze the checked-in V0 run artifact**

`sanjuan-v0-run.v1.json` references the scenario version, seed, active corridor asset versions, and environment snapshot id (temporarily `environment-sj-v0-placeholder` is NOT permitted). Do not create this file until Task 11 has produced a real snapshot id; if implementing tasks sequentially, keep the run builder code here and create the artifact in Task 11.

- [ ] **Step 7: Verify and commit code**

```bash
npm test -- --run src/simulation/vehicle.test.ts src/simulation/schedule.test.ts
git add src/simulation
 git commit -m "feat: add deterministic 24-vehicle schedule"
```

---

### Task 8: Implement the operation engine and event contracts

**Files:**
- Create: `src/simulation/engine.ts`
- Create: `src/simulation/events.ts`
- Create: `src/simulation/engine.test.ts`
- Create: `src/simulation/events.test.ts`

**Interfaces:**
- Consumes: `SanJuanOperationSpec`, `OperationalRun`, `snapshotVehicle`.
- Produces: `getOperationalSnapshot(spec, run, simMinute): OperationalSnapshot`, `deriveOperationalEvents(...)`.

- [ ] **Step 1: Write failing determinism test**

```ts
const a = getOperationalSnapshot(spec, run, 582);
const b = getOperationalSnapshot(spec, run, 582);
expect(a).toEqual(b);
```

Assert all vehicle coordinates are finite and remain within their assigned route sample bounds.

- [ ] **Step 2: Write failing operational event tests**

For one fixture vehicle require ordered events:

```text
DEPART_BASE → ENTER_CORRIDOR → PASS_NODE* → ARRIVE_PROJECT → DEPART_PROJECT → ENTER_RETURN → ARRIVE_BASE
```

Events must be stable and sorted by `(t, vehicleId, event)`.

- [ ] **Step 3: Implement `deriveOperationalEvents`**

Generate events from the deterministic schedule, not from UI side effects. Event timestamps are simulation minutes/seconds relative to start; repeated snapshot calls must not duplicate logical events.

- [ ] **Step 4: Implement `getOperationalSnapshot`**

Return vehicles, corridor states, events up to current `simMinute`, and compact metrics (`activeVehicles`, `atProject`, `returning`, `done`). Do not call weather provider code here.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run src/simulation/engine.test.ts src/simulation/events.test.ts
git add src/simulation/engine* src/simulation/events*
 git commit -m "feat: add deterministic operation snapshot engine"
```

---

### Task 9: Create the Cesium regional scene and persistent snapshot adapter

**Files:**
- Create: `src/map/CesiumMap.tsx`
- Create: `src/map/cesiumAdapter.ts`
- Create: `src/map/cesiumAdapter.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: sourced projects/corridors + `OperationalSnapshot`.
- Produces: `createSceneEntities(dataSource, territory)` once and `applyOperationalSnapshot(dataSource, snapshot)` on updates.

- [ ] **Step 1: Write failing adapter test against a small fake entity collection abstraction**

Keep Cesium-specific mutation behind a tiny interface so unit tests can assert:

```ts
expect(adapter.vehicleEntityCount()).toBe(24);
adapter.apply(snapshotAt0800);
adapter.apply(snapshotAt0801);
expect(adapter.vehicleEntityCount()).toBe(24); // no recreation/leak
```

- [ ] **Step 2: Implement one Viewer lifecycle**

`CesiumMap.tsx` creates the `Viewer` once in `useEffect`, disables unneeded default widgets, creates one primary `CustomDataSource`, and destroys the viewer on unmount.

- [ ] **Step 3: Render regional territory once**

Create project entities and active-corridor polylines from validated assets. Context-only projects use subdued styling. Use semantic corridor colors but no looping glow.

- [ ] **Step 4: Create 24 persistent vehicle entities once**

Entity IDs are stable vehicle IDs. Use simple billboards/points or small models only if they do not compromise performance or asset licensing. Do not recreate entities per snapshot.

- [ ] **Step 5: Implement snapshot application**

`applyOperationalSnapshot` updates position/orientation/show/label properties only. React passes the latest snapshot through a ref/controller boundary; no `setState` per animation frame.

- [ ] **Step 6: Verify tests/build and commit**

```bash
npm test -- --run src/map/cesiumAdapter.test.ts
npm run build
git add src/map src/app
 git commit -m "feat: add Cesium operational scene"
```

---

### Task 10: Add intro, compact command HUD, timeline, and selection flow

**Files:**
- Create: `src/ui/IntroOverlay.tsx`
- Create: `src/ui/CommandHud.tsx`
- Create: `src/ui/Timeline.tsx`
- Create: `src/ui/VehiclePanel.tsx`
- Create: `src/ui/ui.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: clock controller + `OperationalSnapshot` + selected vehicle id.
- Produces: user controls for `START SHIFT`, play/pause/reset, playback, and vehicle inspection.

- [ ] **Step 1: Write failing UI smoke tests**

Use Testing Library to verify:

```ts
expect(screen.getByRole('button', { name: /start shift/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /start shift/i }));
expect(screen.queryByText(/real territory · modelled environment/i)).not.toBeVisible();
expect(screen.getByText('06:00')).toBeVisible();
```

Add play/pause/reset and selected-vehicle panel assertions.

- [ ] **Step 2: Implement intro overlay**

Copy must remain concise and include the exact semantic boundary `Real territory · modelled environment · synthetic operation.` The app/Viewer remain mounted behind the overlay. Exit animation uses WAAPI only when reduced motion is false.

- [ ] **Step 3: Implement one-line desktop HUD**

Show title, time, playback selector, play/pause, active vehicle count, active corridor count, source state. Use CSS grid/flex with `min-width: 0` and wrapping/collapse rules rather than ellipsis on critical text.

- [ ] **Step 4: Implement thin timeline**

06:00–20:00 playhead, selected significant events only, no full Gantt. Timeline control updates simulation time through the clock controller, not directly through Cesium.

- [ ] **Step 5: Implement compact vehicle panel**

Desktop width target `320–380px`; internal overflow scroll; show type/corridor/state/direction/distance/segment/elevation/ETA. Environment fields render `—` until Task 12.

- [ ] **Step 6: Wire Cesium entity selection**

Clicking an operational vehicle sets `selectedVehicleId`; clicking terrain/corridor does not accidentally open vehicle detail.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- --run src/ui/ui.test.tsx
npm run build
git add src/ui src/app src/map
 git commit -m "feat: add operational controls and vehicle inspection"
```

---

### Task 11: Build the immutable environment snapshot pipeline and finalize the run artifact

**Files:**
- Create: `scripts/build-environment.mjs`
- Create: `public/data/environment/environment-sj-<issued-stamp>.json`
- Create/modify: `public/data/runs/sanjuan-v0-run.v1.json`
- Create: `src/data/environmentAsset.test.ts`
- Modify: `scripts/validate-data.mjs`

**Interfaces:**
- Consumes: active corridor environment nodes + Open-Meteo model response at build time only.
- Produces: a checked-in immutable `EnvironmentSnapshot` with stable id and a run artifact referencing it.

- [ ] **Step 1: Define environment nodes for all active corridors**

Use corridor start/intermediate/high-elevation/destination-adjacent nodes already tied to route distance/elevation. Store node IDs in corridor metadata; do not invent extra precision beyond the corridor asset.

- [ ] **Step 2: Implement the environment build script**

`build-environment.mjs` accepts explicit target date and output path, fetches the provider once per grouped node request where supported, normalizes hourly temperature/precipitation/snowfall/wind/gust/direction/optional visibility/cloud cover, stamps `issuedAt`, `dataAsOf`, `provider`, `modelKind`, source URL, and limitations, then writes deterministic key ordering.

Example invocation:

```bash
node scripts/build-environment.mjs --target-date 2026-08-30 --out public/data/environment/environment-sj-20260830.json
```

- [ ] **Step 3: Write failing asset tests before accepting the generated snapshot**

Assertions:

```ts
expect(snapshot.nodes.length).toBeGreaterThanOrEqual(9);
expect(snapshot.modelKind).toMatch(/FORECAST|HISTORICAL_REFERENCE/);
expect(snapshot.sourceState).toMatch(/READY|STALE|PARTIAL|UNAVAILABLE/);
expect(snapshot.evidenceRefs.length).toBeGreaterThan(0);
```

Also assert every hourly timestamp is parseable and each node belongs to one active corridor.

- [ ] **Step 4: Generate the real versioned snapshot and finalize run JSON**

Do not use placeholder ids. `sanjuan-v0-run.v1.json` must reference the exact generated environment snapshot id, `mode: "SIMULATED"`, scenario version, target date, issued time, data-as-of, and seed.

- [ ] **Step 5: Extend data validation**

Fail if the run references a missing environment file/id, if source state is invalid, or if required modelled-weather evidence metadata is absent.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/data/environmentAsset.test.ts
npm run validate:data
git add scripts public/data/environment public/data/runs src/data/environmentAsset.test.ts
 git commit -m "feat: add immutable environment snapshot"
```

---

### Task 12: Implement weather-at-passage and display-only context signals

**Files:**
- Create: `src/environment/lookup.ts`
- Create: `src/environment/lookup.test.ts`
- Create: `src/environment/contextRules.ts`
- Create: `src/environment/contextRules.test.ts`
- Modify: `src/simulation/engine.ts`
- Modify: `src/ui/VehiclePanel.tsx`

**Interfaces:**
- Consumes: `VehicleSnapshot`, `EnvironmentSnapshot`, explicit `ContextRule[]`.
- Produces: `environmentAtPassage(...)` and `deriveContextEvents(...)`; movement remains unchanged.

- [ ] **Step 1: Write failing interpolation tests**

For temperature/wind, test spatial+temporal interpolation between two nodes/times. For precipitation, assert model-step selection rather than fabricated sub-hour precision. For missing node/hour, expect `{ sourceState: 'UNAVAILABLE', values: null }`.

- [ ] **Step 2: Implement `environmentAtPassage`**

Signature:

```ts
export function environmentAtPassage(
  snapshot: EnvironmentSnapshot,
  corridorId: string,
  distanceKm: number,
  simIsoTime: string,
): EnvironmentContext;
```

Never perform network IO.

- [ ] **Step 3: Write failing context-rule tests**

Use explicit scenario rules and assert `HIGH_ELEVATION`, `STRONG_GUST`, etc. produce `INFO|ATTENTION` events with rule/evidence refs. Then assert vehicle position and ETA are byte-for-byte identical with context rules enabled vs disabled.

- [ ] **Step 4: Implement context rules**

Rules are data, not hidden constants. Every threshold carries `sourceKind: 'SCENARIO_DISPLAY_RULE'` and explanatory limitation text.

- [ ] **Step 5: Integrate context into engine/UI**

Attach `EnvironmentContext` and context events to snapshots after movement derivation. Vehicle panel shows `MODELLED ENVIRONMENT`, source state, and up to a few active signals; it never renders `SAFE`, `DANGER`, `ROAD CLOSED`, or stop advice.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/environment/lookup.test.ts src/environment/contextRules.test.ts src/simulation/engine.test.ts
git add src/environment src/simulation/engine.ts src/ui/VehiclePanel.tsx
 git commit -m "feat: add weather-at-passage context"
```

---

### Task 13: Add deterministic calibrated background territorial traffic

**Files:**
- Create: `public/data/calibration/traffic.v1.json`
- Create: `src/simulation/backgroundTraffic.ts`
- Create: `src/simulation/backgroundTraffic.test.ts`
- Modify: `src/map/cesiumAdapter.ts`
- Modify: `src/simulation/engine.ts`

**Interfaces:**
- Consumes: DNV historical traffic calibration + Andean analogue metadata; named `backgroundTraffic` RNG stream.
- Produces: subdued deterministic civilian traffic snapshots separate from the 24 operational vehicles.

- [ ] **Step 1: Create calibration artifact with honest evidence roles**

Store relative intensity/time-of-day factors, not claims of current vehicle counts. DNV TMDA is `CALIBRATION`; Chile PNCV is `ANALOGUE`; limitations must state that this is not live San Juan traffic.

- [ ] **Step 2: Write failing determinism/salience tests**

Assert the same seed/time returns the same background entities and that operational vehicle count remains exactly 24. Background traffic IDs must use a separate namespace such as `BG-` and must never appear in operational metrics.

- [ ] **Step 3: Implement a simple background generator**

Generate a small bounded number of synthetic civilian markers from calibration intensity and time-of-day. No car-following, congestion, lane changes, or route optimization.

- [ ] **Step 4: Render in a visually subordinate Cesium layer**

Use smaller/desaturated markers, no labels by default, and no vehicle panel. Operational vehicles remain clearly dominant.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run src/simulation/backgroundTraffic.test.ts
npm run validate:data
git add public/data/calibration src/simulation/backgroundTraffic* src/map/cesiumAdapter.ts src/simulation/engine.ts
 git commit -m "feat: add calibrated background traffic"
```

---

### Task 14: Add cartographic instrumentation using proven Cesium patterns

**Files:**
- Create: `src/map/cartographicReadout.ts`
- Create: `src/map/cartographicReadout.test.ts`
- Create: `src/ui/MapInstrumentation.tsx`
- Modify: `src/map/CesiumMap.tsx`
- Modify: `src/app/app.css`
- Create: `docs/research/cesium-cartographic-controls.md`

**Interfaces:**
- Consumes: Cesium camera/scene/globe APIs.
- Produces: north/heading, scale, cursor coordinates/elevation, home/reset controls, and explicit attribution surfaces.

- [ ] **Step 1: Audit existing Cesium/open-source map control patterns before coding**

Document in `docs/research/cesium-cartographic-controls.md` the exact APIs/patterns chosen for compass heading, scale calculation, cursor pick/elevation, home camera, and attribution. Prefer Cesium built-ins/community-established math over decorative custom approximations. Record source links and license/attribution implications.

- [ ] **Step 2: Write failing pure utility tests**

Test formatting and scale selection independently of Cesium DOM:

```ts
expect(formatCoordinates(-31.5376, -68.5364)).toBe('31.5376° S · 68.5364° W');
expect(formatElevation(1025.4)).toBe('1,025 m');
expect(selectScaleBarMeters(376)).toBe(200);
```

`selectScaleBarMeters` must choose a readable 1/2/5×10ⁿ value not exceeding available ground distance.

- [ ] **Step 3: Implement cursor coordinate/elevation readout**

Use Cesium scene/globe picking; when no valid terrain point exists, render `—` rather than stale coordinates/elevation.

- [ ] **Step 4: Implement north/heading reference and home camera**

Compass orientation is driven by `camera.heading`. Home reset flies/sets camera to a versioned San Juan regional extent; do not use looping camera animation.

- [ ] **Step 5: Implement dynamic scale bar**

Derive ground distance from screen-space picks or the audited equivalent; update on camera change, not every React render.

- [ ] **Step 6: Expose readable attribution**

Do not hide Cesium/imagery/terrain attribution. If default credits are repositioned, retain complete readable credit behavior.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- --run src/map/cartographicReadout.test.ts
npm run build
git add src/map/cartographicReadout* src/ui/MapInstrumentation.tsx src/map/CesiumMap.tsx src/app/app.css docs/research
 git commit -m "feat: add cartographic map instrumentation"
```

---

### Task 15: Add analysis/source surfaces and responsive no-clipping rules

**Files:**
- Create: `src/ui/AnalysisDrawer.tsx`
- Create: `src/ui/SourceState.tsx`
- Create: `src/ui/AnalysisDrawer.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: corridor profile/environment/events/evidence registry.
- Produces: progressive-disclosure profile, climate, events, sources, and responsive desktop/tablet/mobile layouts.

- [ ] **Step 1: Write failing disclosure tests**

Verify sources are not all dumped into the initial map view, drawer tabs can reveal `Profile`, `Climate`, `Events`, `Sources`, and unavailable data renders a calm source-state message.

- [ ] **Step 2: Implement analysis drawer with content-sized constraints**

Desktop max width around `420px`; vehicle panel `320–380px`; internal scroll only when content exceeds safe height. Charts must reserve explicit axis/padding space rather than rely on overflow clipping.

- [ ] **Step 3: Implement responsive breakpoints**

CSS expectations:

```text
>=1280px: map-first desktop, side panel/drawer
768–1279px: narrower panel + more collapse
<768px: map top + simplified HUD + bottom-sheet detail
```

Critical labels must wrap or reflow; do not apply uncontrolled `text-overflow: ellipsis` to evidence/source state or operational state.

- [ ] **Step 4: Implement reduced-motion branch**

Central helper reads `matchMedia('(prefers-reduced-motion: reduce)')`; drawers/intro switch to instant state changes when true.

- [ ] **Step 5: Verify UI/build and commit**

```bash
npm test -- --run src/ui/AnalysisDrawer.test.tsx src/ui/ui.test.tsx
npm run build
git add src/ui src/app
 git commit -m "feat: add responsive analysis surfaces"
```

---

### Task 16: Final verification, visual QA, provenance audit, and README

**Files:**
- Modify: `README.md`
- Create: `docs/qa/v0-acceptance.md`
- Create: `docs/data-sources.md`
- Modify as needed only for defects found during verification.

**Interfaces:**
- Consumes: complete V0.
- Produces: verified build, documented evidence boundary, user-facing project explanation, and acceptance checklist.

- [ ] **Step 1: Run the full automated gate**

```bash
npm test -- --run
npm run validate:data
npm run build
```

Expected: all PASS. Do not claim completion if any gate is red.

- [ ] **Step 2: Perform deterministic replay verification**

Run/reload the same checked-in V0 run twice and compare a serialized set of snapshots at 06:00, 09:00, 12:00, 16:00, 20:00. Store the verification method/results in `docs/qa/v0-acceptance.md`; same run must produce identical domain snapshots.

- [ ] **Step 3: Perform manual visual QA at representative widths**

Check at minimum desktop `1440×900`, tablet `1024×768`, mobile `390×844`:

```text
no clipped text
no clipped chart axes/labels
no panel hiding the majority of the map
HUD remains readable
vehicle panel can scroll internally
north/scale/coordinates/elevation/attribution visible
regional labels do not become unreadable clutter
```

Record pass/fail per viewport in `docs/qa/v0-acceptance.md` and fix every fail before proceeding.

- [ ] **Step 4: Audit semantic/provenance claims**

Search UI/data/docs for unsafe overclaim terms and inspect context:

```bash
grep -RniE "safe|unsafe|road closed|real-time|live telemetry|operator route|verified route" src public README.md docs || true
```

Any occurrence must either be explanatory/negative wording or be supported by explicit primary evidence. Confirm every synthetic speed/departure/stop is tagged `SYNTHETIC_ASSUMPTION` and every reconstructed route is visibly classed as such.

- [ ] **Step 5: Write `docs/data-sources.md`**

For each projects/corridors/elevation/weather/traffic reference, list role, source, retrieval date, method, license where known, and limitations. Keep qualitative Reddit/community evidence explicitly separate from numeric calibration and state that it defines questions/taxonomy only.

- [ ] **Step 6: Rewrite README as the product entry point**

README sections:

```text
What it is
What it is not
V0 experience
Data/evidence model
Architecture
Run locally
Tests/data validation
Sources and limitations
Roadmap
License
```

Lead with `Real territory · modelled environment · synthetic operation.` and explicitly state that the app is not live company telemetry or a safety/transitability system.

- [ ] **Step 7: Re-run full gate after documentation/defect fixes**

```bash
npm test -- --run
npm run validate:data
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit final V0 verification**

```bash
git add README.md docs src public scripts
 git commit -m "docs: verify and document mining ops V0"
```

---

## Plan Completion Gate

Before declaring V0 complete, verify every spec requirement maps to a completed task above:

- Contracts/provenance: Tasks 2, 4–6, 11, 16.
- 10 projects / 3 corridors: Tasks 4–6.
- Deterministic 24-vehicle day: Tasks 3, 7, 8.
- Cesium map-first scene: Tasks 9–10.
- Elevation: Tasks 5–6.
- Immutable weather snapshot: Task 11.
- Weather at passage + non-decisional context: Task 12.
- Background traffic: Task 13.
- Cartographic references: Task 14.
- Progressive disclosure / no clipping / responsive: Task 15.
- Tests/build/source audit/README: Task 16.

Do not pull mine-internal haulage or `minehaulsim` DES complexity into this implementation. Its role remains methodological reference only.