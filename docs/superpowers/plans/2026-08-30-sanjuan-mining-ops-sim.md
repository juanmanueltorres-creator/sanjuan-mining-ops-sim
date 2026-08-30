# San Juan Mining Ops Sim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, map-first Cesium simulation of 24 synthetic mining mobilizations across three sourced/reconstructed San Juan corridors, with versioned elevation/weather context, provenance, calibrated background traffic, and compact responsive operational UI.

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
- Evidence roles remain explicit: `PRIMARY`, `DERIVED`, `CALIBRATION`, `ANALOGUE`, `QUALITATIVE`, `SYNTHETIC_ASSUMPTION`, `METHOD_REFERENCE`.
- Corridor geometry classes are `PUBLIC_ROAD`, `RECONSTRUCTED_ACCESS`, `APPROXIMATE_APPROACH`, `PROJECT_LOCATION`; reconstructed/approximate geometry is never presented as operator-verified.
- Source states are `READY`, `STALE`, `PARTIAL`, `UNAVAILABLE`; missing critical evidence fails closed.
- Use one Cesium `Viewer` and one primary active `CustomDataSource`; do not recreate all vehicle entities every frame.
- Do not update React state on every animation frame; animation-frame work lives in the controller/adapter boundary.
- Do not request provider data per vehicle or simulation tick; weather is consumed from immutable versioned snapshots.
- UI motion is restrained (~160–220 ms) and honors `prefers-reduced-motion`.
- No clipped text/charts/labels, no oversized panels hiding most of the map, and no decorative cartographic controls.
- Main experience exposes north reference, scale, coordinate readout, elevation readout, and imagery/terrain attribution.
- No live GPS, real company telemetry, mine dispatch/FMS, safety prediction, automatic closures, OEM physics, mine-internal haulage, auth/database/AI agent, or sensitive private routes in V0.

---

## File Structure Map

```text
src/
  app/
    App.tsx
    app.css
  domain/
    contracts.ts
    schemas.ts
    evidence.ts
  simulation/
    clock.ts
    rng.ts
    routeMath.ts
    schedule.ts
    vehicle.ts
    events.ts
    engine.ts
    backgroundTraffic.ts
  environment/
    lookup.ts
    contextRules.ts
  data/
    loadOperation.ts
  map/
    CesiumMap.tsx
    cesiumAdapter.ts
    cartographicReadout.ts
  ui/
    IntroOverlay.tsx
    CommandHud.tsx
    Timeline.tsx
    VehiclePanel.tsx
    AnalysisDrawer.tsx
    SourceState.tsx
    MapInstrumentation.tsx
  test/
    setup.ts

scripts/
  validate-data.mjs
  build-route-samples.mjs
  build-environment.mjs

public/data/
  projects/projects.v1.json
  corridors/hualilan/
  corridors/veladero/
  corridors/los-azules/
  environment/
  calibration/traffic.v1.json
  runs/sanjuan-v0-run.v1.json
```

No UI component owns simulation truth, provenance truth, or asset validation.

---

### Task 1: Scaffold a tested React/Cesium shell

**Files:**
- Create/modify via scaffold: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`
- Create: `src/app/App.tsx`, `src/app/app.css`, `src/test/setup.ts`, `src/app/App.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: none.
- Produces: green React/Vite/Vitest baseline and a root `<App />`.

- [ ] **Step 1: Scaffold and install dependencies**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install cesium zod
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-plugin-static-copy
```

Preserve `README.md`, `LICENSE`, `docs/`, and `.gitignore` from `main` if the scaffold tries to replace them.

- [ ] **Step 2: Configure Vitest and Cesium static assets**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
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
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Write the failing shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('states the evidence boundary', () => {
    render(<App />);
    expect(screen.getByText('SAN JUAN MINING OPS SIM')).toBeInTheDocument();
    expect(screen.getByText('Real territory · modelled environment · synthetic operation.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run RED**

```bash
npm test -- --run src/app/App.test.tsx
```

Expected: FAIL because the new `App` export/copy is absent.

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

`src/main.tsx` must import:

```ts
import 'cesium/Build/Cesium/Widgets/widgets.css';
```

- [ ] **Step 6: Run GREEN and build**

```bash
npm test -- --run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig*.json index.html src
git commit -m "chore: scaffold tested Cesium app shell"
```

---

### Task 2: Define and runtime-validate domain contracts

**Files:**
- Create: `src/domain/contracts.ts`, `src/domain/schemas.ts`, `src/domain/evidence.ts`, `src/domain/schemas.test.ts`

**Interfaces:**
- Consumes: Zod.
- Produces: `parseOperationSpec(input)`, `parseEnvironmentSnapshot(input)`, `parseOperationalRun(input)` and shared types.

- [ ] **Step 1: Write failing schema tests**

`src/domain/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseOperationalRun, parseSourceState } from './schemas';

const validRun = {
  id: 'run-v0', targetDate: '2026-08-30', issuedAt: '2026-08-30T09:00:00Z',
  dataAsOf: '2026-08-30T08:30:00Z', timezone: 'America/Argentina/San_Juan',
  mode: 'SIMULATED', modelVersion: 'v0', scenarioVersion: 'v0',
  environmentSnapshotId: 'env-1', provenance: [],
};

describe('runtime contracts', () => {
  it('rejects non-V0 operational modes', () => {
    expect(() => parseOperationalRun({ ...validRun, mode: 'OBSERVED' })).toThrow();
  });

  it.each(['READY', 'STALE', 'PARTIAL', 'UNAVAILABLE'] as const)('accepts source state %s', (state) => {
    expect(parseSourceState(state)).toBe(state);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/domain/schemas.test.ts
```

Expected: FAIL because parse helpers do not exist.

- [ ] **Step 3: Implement core TypeScript contracts**

`src/domain/contracts.ts` must include these exact unions and shared records:

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

Also define the spec-approved `ProjectDefinition`, `CorridorDefinition`, `CorridorSegment`, `VehicleDefinition`, `EnvironmentSnapshot`, `EnvironmentNode`, `EnvironmentHour`, `OperationalRun`, `OperationalEvent`, `ContextEvent`, `VehicleSnapshot`, and `OperationalSnapshot` interfaces.

- [ ] **Step 4: Implement Zod parse helpers**

`src/domain/schemas.ts`:

```ts
import { z } from 'zod';
import type { OperationalRun, SourceState } from './contracts';

const sourceStateSchema = z.enum(['READY', 'STALE', 'PARTIAL', 'UNAVAILABLE']);
const runSchema = z.object({
  id: z.string().min(1),
  targetDate: z.string().min(1),
  issuedAt: z.string().min(1),
  dataAsOf: z.string().min(1),
  timezone: z.literal('America/Argentina/San_Juan'),
  mode: z.literal('SIMULATED'),
  modelVersion: z.string().min(1),
  scenarioVersion: z.string().min(1),
  environmentSnapshotId: z.string().min(1),
  provenance: z.array(z.string()),
});

export const parseSourceState = (input: unknown): SourceState => sourceStateSchema.parse(input);
export const parseOperationalRun = (input: unknown): OperationalRun => runSchema.parse(input) as OperationalRun;
```

Add Zod schemas for all critical operation/environment assets; corridor evidence refs must be non-empty and operational vehicles must have `synthetic: z.literal(true)`.

- [ ] **Step 5: Implement evidence-reference validation**

`src/domain/evidence.ts`:

```ts
import type { EvidenceRef } from './contracts';

export function assertEvidenceRefsExist(ids: string[], refs: EvidenceRef[]): void {
  const index = new Set(refs.map((ref) => ref.id));
  const missing = ids.filter((id) => !index.has(id));
  if (missing.length > 0) throw new Error(`Missing evidence refs: ${missing.join(', ')}`);
}
```

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- --run src/domain/schemas.test.ts
git add src/domain
git commit -m "feat: add validated operation contracts"
```

---

### Task 3: Implement deterministic clock and named RNG streams

**Files:**
- Create: `src/simulation/clock.ts`, `src/simulation/rng.ts`, `src/simulation/clock.test.ts`, `src/simulation/rng.test.ts`

**Interfaces:**
- Produces: `createClock`, `advanceClock`, `resetClock`, `createNamedRng`.

- [ ] **Step 1: Write failing clock tests**

```ts
import { describe, expect, it } from 'vitest';
import { advanceClock, createClock, resetClock } from './clock';

describe('operational clock', () => {
  it('starts paused at 06:00', () => expect(createClock()).toEqual({ minuteOfDay: 360, playing: false }));
  it('advances five sim minutes in one real second at 300x', () => {
    expect(advanceClock({ minuteOfDay: 360, playing: true }, 1000, 300).minuteOfDay).toBe(365);
  });
  it('clamps at 20:00', () => expect(advanceClock({ minuteOfDay: 1199, playing: true }, 1000, 600).minuteOfDay).toBe(1200));
  it('resets to 06:00 paused', () => expect(resetClock()).toEqual({ minuteOfDay: 360, playing: false }));
});
```

- [ ] **Step 2: Write failing RNG tests**

```ts
import { expect, it } from 'vitest';
import { createNamedRng } from './rng';

it('replays the same named stream', () => {
  const a = createNamedRng('20260830', 'departures');
  const b = createNamedRng('20260830', 'departures');
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});

it('separates named streams', () => {
  expect(createNamedRng('20260830', 'departures')()).not.toBe(createNamedRng('20260830', 'dwellTimes')());
});
```

- [ ] **Step 3: Run RED**

```bash
npm test -- --run src/simulation/clock.test.ts src/simulation/rng.test.ts
```

- [ ] **Step 4: Implement clock math**

```ts
export const START_MINUTE = 360;
export const END_MINUTE = 1200;
export type Playback = 60 | 120 | 300 | 600;
export interface OperationalClock { minuteOfDay: number; playing: boolean }

export const createClock = (): OperationalClock => ({ minuteOfDay: START_MINUTE, playing: false });
export const resetClock = createClock;
export function advanceClock(clock: OperationalClock, elapsedRealMs: number, playback: Playback): OperationalClock {
  if (!clock.playing) return clock;
  const simulatedMinutes = (elapsedRealMs / 1000) * (playback / 60);
  return { ...clock, minuteOfDay: Math.min(END_MINUTE, clock.minuteOfDay + simulatedMinutes) };
}
```

- [ ] **Step 5: Implement deterministic named RNG**

`src/simulation/rng.ts` must hash `${seed}:${name}` to uint32, then use a local Mulberry32 generator:

```ts
export function createNamedRng(seed: string | number, name: string): () => number {
  let h = 2166136261;
  for (const ch of `${seed}:${name}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

No scenario-generation code uses `Math.random()`.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- --run src/simulation/clock.test.ts src/simulation/rng.test.ts
git add src/simulation/clock* src/simulation/rng*
git commit -m "feat: add deterministic operational clock"
```

---

### Task 4: Add sourced projects and the three validated corridor bundles

**Files:**
- Create: `public/data/projects/projects.v1.json`
- Create per corridor: `corridor.v1.geojson`, `profile.v1.json`, `metadata.v1.json`, `route-samples.v1.json`
- Create: `scripts/build-route-samples.mjs`, `scripts/validate-data.mjs`
- Create: `src/simulation/routeMath.ts`, `src/simulation/routeMath.test.ts`
- Create: `src/data/loadOperation.ts`, `src/data/loadOperation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2 schemas/evidence helpers.
- Produces: validated 10-project registry, 3 active corridor bundles, `positionAtDistance`, `loadStaticOperationData`, `npm run validate:data`.

- [ ] **Step 1: Audit and record source evidence before adding corridor geometry**

For Hualilán, Veladero, and Los Azules, use public road/project sources only. Each metadata file records source URL, retrieval date, method, evidence role/class, and limitations. Unsupported operator access must be `RECONSTRUCTED_ACCESS`, `APPROXIMATE_APPROACH`, or omitted; never upgrade it to verified/operator route.

- [ ] **Step 2: Write failing route interpolation tests**

```ts
import { expect, it } from 'vitest';
import { positionAtDistance } from './routeMath';

it('interpolates route position and elevation', () => {
  const samples = [
    { distanceKm: 0, lon: -68, lat: -31, elevationM: 600, segmentId: 'low' },
    { distanceKm: 10, lon: -69, lat: -30, elevationM: 1600, segmentId: 'mountain' },
  ];
  expect(positionAtDistance(samples, 5)).toMatchObject({ lon: -68.5, lat: -30.5, elevationM: 1100 });
});
```

- [ ] **Step 3: Implement route interpolation**

```ts
import type { RouteSample } from '../domain/contracts';

export function positionAtDistance(samples: RouteSample[], distanceKm: number): RouteSample {
  if (distanceKm <= samples[0].distanceKm) return samples[0];
  if (distanceKm >= samples.at(-1)!.distanceKm) return samples.at(-1)!;
  const hi = samples.findIndex((sample) => sample.distanceKm >= distanceKm);
  const a = samples[hi - 1];
  const b = samples[hi];
  const t = (distanceKm - a.distanceKm) / (b.distanceKm - a.distanceKm);
  return {
    distanceKm,
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    elevationM: a.elevationM + (b.elevationM - a.elevationM) * t,
    segmentId: b.segmentId,
  };
}
```

- [ ] **Step 4: Create the exact project registry**

`projects.v1.json` contains exactly Filo del Sol, Josemaría, Veladero, Gualcamayo, El Pachón, Los Azules, Altar, Hualilán, Casposo, Filo Sur. Exactly Hualilán, Veladero, Los Azules have `activeOperationalDestination: true`. Every marker has sourced coordinates and evidence refs.

- [ ] **Step 5: Build route samples deterministically**

`scripts/build-route-samples.mjs` reads geometry/profile/segment boundaries and writes sorted samples. Core validation logic:

```js
if (samples[0].distanceKm !== 0) throw new Error('route samples must start at 0 km');
for (let i = 1; i < samples.length; i += 1) {
  if (samples[i].distanceKm <= samples[i - 1].distanceKm) throw new Error('route sample distances must increase');
  if (!samples[i].segmentId) throw new Error('route sample missing segmentId');
}
```

- [ ] **Step 6: Implement checked-in asset validation**

Add script:

```json
"validate:data": "node scripts/validate-data.mjs"
```

`validate-data.mjs` fails if project count/active count is wrong, a critical evidence ref is missing, corridor geometry has <2 coordinates, segment ranges have gaps/overlaps, route samples are non-monotonic, or evidence class is outside the approved enum.

- [ ] **Step 7: Implement loader and failing loader test**

Test:

```ts
const data = await loadStaticOperationData(fakeFetch);
expect(data.projects).toHaveLength(10);
expect(data.corridors.map((c) => c.id).sort()).toEqual(['hualilan', 'los-azules', 'veladero']);
```

Loader fetches only checked-in `/data/...` assets, parses them with Task 2 schemas, resolves evidence refs, and throws on invalid critical data.

- [ ] **Step 8: Run GREEN and commit**

```bash
npm test -- --run src/simulation/routeMath.test.ts src/data/loadOperation.test.ts
npm run validate:data
git add public/data/projects public/data/corridors scripts src/data src/simulation/routeMath* package.json
git commit -m "feat: add sourced San Juan corridors"
```

---

### Task 5: Implement the deterministic 24-unit schedule and vehicle state machine

**Files:**
- Create: `src/simulation/schedule.ts`, `src/simulation/schedule.test.ts`, `src/simulation/vehicle.ts`, `src/simulation/vehicle.test.ts`

**Interfaces:**
- Consumes: `RouteSample[]`, Task 3 RNG, corridor segments.
- Produces: `buildV0Schedule(seed)`, `snapshotVehicle(vehicle, corridor, simMinute)`.

- [ ] **Step 1: Write failing schedule tests**

```ts
const fleet = buildV0Schedule('20260830');
expect(fleet).toHaveLength(24);
expect(fleet.filter((v) => v.type === 'PERSONNEL')).toHaveLength(12);
expect(fleet.filter((v) => v.type === 'FIELD')).toHaveLength(6);
expect(fleet.filter((v) => v.type === 'LOGISTICS')).toHaveLength(6);
expect(new Set(fleet.map((v) => v.id)).size).toBe(24);
expect(buildV0Schedule('20260830')).toEqual(buildV0Schedule('20260830'));
```

- [ ] **Step 2: Write failing state tests**

```ts
expect(snapshotVehicle(vehicle, corridor, 350).state).toBe('AT_BASE');
expect(snapshotVehicle(vehicle, corridor, 370).state).toBe('EN_ROUTE');
expect(snapshotVehicle(vehicle, corridor, 900).state).toBe('RETURNING');
expect(snapshotVehicle(vehicle, corridor, 1200).state).toBe('DONE');
```

- [ ] **Step 3: Implement versioned synthetic speed profiles**

`src/simulation/schedule.ts`:

```ts
export const SPEED_PROFILES = {
  PERSONNEL: { pavedLowland: 70, mountainRoad: 45, highMountain: 30, approach: 25 },
  FIELD: { pavedLowland: 75, mountainRoad: 50, highMountain: 35, approach: 30 },
  LOGISTICS: { pavedLowland: 60, mountainRoad: 38, highMountain: 25, approach: 20 },
} as const;
```

These values are scenario assumptions and must be referenced by `SYNTHETIC_ASSUMPTION` evidence; they are not observed company speeds.

- [ ] **Step 4: Implement deterministic fleet generation**

Use named streams exactly `departures`, `vehicleAssignment`, `dwellTimes`, `returnOffsets`. Assign all 24 vehicles across the three corridors, stagger departures, include all three vehicle categories on each corridor, and schedule return legs within the operational day where travel duration permits.

- [ ] **Step 5: Implement `snapshotVehicle`**

Core shape:

```ts
export function snapshotVehicle(vehicle: VehicleDefinition, corridor: CorridorDefinition, simMinute: number): VehicleSnapshot {
  const phase = deriveTravelPhase(vehicle, corridor, simMinute);
  const route = phase.direction === 'TO_PROJECT' ? corridor.routeSamples : [...corridor.routeSamples].reverse();
  const point = positionAtDistance(route, phase.distanceKm);
  return {
    id: vehicle.id,
    type: vehicle.type,
    corridorId: corridor.id,
    state: phase.state,
    direction: phase.direction,
    position: { lon: point.lon, lat: point.lat },
    distanceKm: phase.distanceKm,
    elevationM: point.elevationM,
    segmentId: point.segmentId,
    etaMinute: phase.etaMinute,
  };
}
```

`deriveTravelPhase` walks segment durations and planned dwell times from the same speed table used for ETA.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- --run src/simulation/schedule.test.ts src/simulation/vehicle.test.ts
git add src/simulation/schedule* src/simulation/vehicle*
git commit -m "feat: add deterministic mining fleet schedule"
```

---

### Task 6: Implement operation snapshots and event logs

**Files:**
- Create: `src/simulation/events.ts`, `src/simulation/events.test.ts`, `src/simulation/engine.ts`, `src/simulation/engine.test.ts`

**Interfaces:**
- Consumes: operation spec, run fixture, `snapshotVehicle`.
- Produces: `deriveOperationalEvents`, `getOperationalSnapshot`.

- [ ] **Step 1: Write failing deterministic snapshot test**

```ts
const a = getOperationalSnapshot(spec, run, 582);
const b = getOperationalSnapshot(spec, run, 582);
expect(a).toEqual(b);
expect(a.vehicles).toHaveLength(24);
expect(a.vehicles.every((v) => Number.isFinite(v.position.lon) && Number.isFinite(v.position.lat))).toBe(true);
```

- [ ] **Step 2: Write failing event-order test**

```ts
const events = deriveOperationalEvents(vehicle, corridor);
expect(events.map((e) => e.event)).toEqual([
  'DEPART_BASE', 'ENTER_CORRIDOR', 'ARRIVE_PROJECT', 'DEPART_PROJECT', 'ENTER_RETURN', 'ARRIVE_BASE',
]);
```

Add `PASS_NODE` events when the corridor has versioned nodes, keeping global event sorting stable by `(t, vehicleId, event)`.

- [ ] **Step 3: Implement event derivation**

```ts
export function sortOperationalEvents(events: OperationalEvent[]): OperationalEvent[] {
  return [...events].sort((a, b) => a.t - b.t || a.vehicleId.localeCompare(b.vehicleId) || a.event.localeCompare(b.event));
}
```

Events are derived from the schedule, never accumulated as UI side effects.

- [ ] **Step 4: Implement snapshot engine**

```ts
export function getOperationalSnapshot(spec: SanJuanOperationSpec, run: OperationalRun, simMinute: number): OperationalSnapshot {
  const vehicles = spec.fleet.map((vehicle) => snapshotVehicle(vehicle, spec.corridorsById[vehicle.corridorId], simMinute));
  const operationalEvents = spec.operationalEvents.filter((event) => event.t <= simMinute);
  return {
    simTime: simMinute,
    vehicles,
    corridorStates: deriveCorridorStates(vehicles, spec.corridors),
    operationalEvents,
    contextEvents: [],
    metrics: deriveMetrics(vehicles),
  };
}
```

The production type may represent corridor lookup as a `Map`; keep the public function pure and do not fetch weather or mutate UI state here.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- --run src/simulation/events.test.ts src/simulation/engine.test.ts
git add src/simulation/events* src/simulation/engine*
git commit -m "feat: add deterministic operation engine"
```

---

### Task 7: Create the Cesium regional scene with persistent entities

**Files:**
- Create: `src/map/CesiumMap.tsx`, `src/map/cesiumAdapter.ts`, `src/map/cesiumAdapter.test.ts`
- Modify: `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: sourced territory and `OperationalSnapshot`.
- Produces: one Viewer, one primary `CustomDataSource`, persistent project/corridor/vehicle entities.

- [ ] **Step 1: Write failing adapter lifecycle test**

Use a small fake entity sink:

```ts
const adapter = createOperationalAdapter(fakeSink, fleetIds);
expect(fakeSink.size()).toBe(24);
adapter.apply(snapshotAt0800);
adapter.apply(snapshotAt0801);
expect(fakeSink.size()).toBe(24);
```

- [ ] **Step 2: Implement persistent adapter abstraction**

```ts
export interface VehicleEntitySink {
  ensure(id: string): void;
  setPosition(id: string, lon: number, lat: number, elevationM: number): void;
  setVisible(id: string, visible: boolean): void;
}

export function createOperationalAdapter(sink: VehicleEntitySink, vehicleIds: string[]) {
  vehicleIds.forEach((id) => sink.ensure(id));
  return {
    apply(snapshot: OperationalSnapshot) {
      for (const vehicle of snapshot.vehicles) {
        sink.setPosition(vehicle.id, vehicle.position.lon, vehicle.position.lat, vehicle.elevationM);
        sink.setVisible(vehicle.id, vehicle.state !== 'DONE');
      }
    },
  };
}
```

- [ ] **Step 3: Implement one Cesium Viewer lifecycle**

`CesiumMap.tsx` creates `Viewer` once in `useEffect`, creates one `CustomDataSource`, loads project/corridor entities once, and destroys the Viewer on unmount. Disable only irrelevant default widgets; retain required credit/attribution behavior.

- [ ] **Step 4: Implement operational vehicle sink over Cesium entities**

Use stable vehicle IDs, create each entity once, and update `position/show/orientation` properties only. Context-only projects use lower visual salience; active corridors use semantic but restrained colors.

- [ ] **Step 5: Keep the animation loop out of React renders**

Use refs/controller callbacks so `requestAnimationFrame` advances the clock and applies snapshots without a React `setState` on every frame. React state may update at coarse UI cadence for textual HUD values.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/map/cesiumAdapter.test.ts
npm run build
git add src/map src/app
git commit -m "feat: add Cesium operational scene"
```

---

### Task 8: Add intro, HUD, timeline, and vehicle selection

**Files:**
- Create: `src/ui/IntroOverlay.tsx`, `src/ui/CommandHud.tsx`, `src/ui/Timeline.tsx`, `src/ui/VehiclePanel.tsx`, `src/ui/ui.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`, `src/map/CesiumMap.tsx`

**Interfaces:**
- Consumes: clock controller, `OperationalSnapshot`, selected vehicle id.
- Produces: `START SHIFT`, play/pause/reset, speed selection, timeline seeking, vehicle inspection.

- [ ] **Step 1: Write failing UI smoke test**

```tsx
render(<App />);
expect(screen.getByRole('button', { name: /start shift/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /start shift/i }));
expect(screen.getByText('06:00')).toBeVisible();
await user.click(screen.getByRole('button', { name: /play/i }));
expect(screen.getByRole('button', { name: /pause/i })).toBeVisible();
```

Add a fixture selection callback and assert a vehicle panel shows ID, corridor, state, direction, distance, segment, elevation, ETA.

- [ ] **Step 2: Implement compact intro overlay**

It communicates the product boundary and uses `START SHIFT`. The Cesium scene remains mounted behind it. Exit animation uses WAAPI for ~200 ms only when reduced motion is false.

- [ ] **Step 3: Implement the command HUD**

Show experience name, simulated time, playback selector (`60×`, `120×`, `300×`, `600×`), play/pause, 24-unit active metric, three corridors, and source state. Use layout rules that wrap/reflow rather than clipping critical text.

- [ ] **Step 4: Implement thin 06:00–20:00 timeline**

```ts
const fraction = (minuteOfDay - 360) / (1200 - 360);
const seekMinute = 360 + fractionFromPointer * 840;
```

Show only selected significant operational/context events; do not build a Gantt chart.

- [ ] **Step 5: Implement vehicle selection panel**

Desktop width stays `320–380px`; internal content scrolls if needed. Cesium vehicle clicks set `selectedVehicleId`; terrain/corridor clicks do not open vehicle detail.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run src/ui/ui.test.tsx
npm run build
git add src/ui src/app src/map/CesiumMap.tsx
git commit -m "feat: add operational controls and inspection"
```

---

### Task 9: Build immutable weather snapshot, weather-at-passage, context signals, and the real run artifact

**Files:**
- Create: `scripts/build-environment.mjs`
- Create: `public/data/environment/environment-sj-<issued-stamp>.json` during execution
- Create: `public/data/runs/sanjuan-v0-run.v1.json`
- Create: `src/environment/lookup.ts`, `src/environment/lookup.test.ts`, `src/environment/contextRules.ts`, `src/environment/contextRules.test.ts`
- Modify: `scripts/validate-data.mjs`, `src/simulation/engine.ts`, `src/ui/VehiclePanel.tsx`

**Interfaces:**
- Consumes: versioned corridor environment nodes + modelled weather provider at build time only.
- Produces: immutable `EnvironmentSnapshot`, `environmentAtPassage`, `deriveContextEvents`, checked-in `OperationalRun`.

- [ ] **Step 1: Define corridor environment nodes and build script contract**

Each active corridor has start/intermediate/high-elevation/destination-adjacent nodes tied to route distance/elevation. `build-environment.mjs` accepts explicit `--target-date` and `--out`, fetches provider data before runtime, and writes source/provenance metadata plus normalized hourly values.

Example execution:

```bash
node scripts/build-environment.mjs --target-date 2026-08-30 --out public/data/environment/environment-sj-20260830.json
```

- [ ] **Step 2: Write failing environment lookup tests**

```ts
const ctx = environmentAtPassage(snapshot, 'veladero', 50, '2026-08-30T09:30:00-03:00');
expect(ctx.temperatureC).toBeCloseTo(expectedInterpolatedTemperature);
expect(ctx.sourceState).toBe('READY');
```

Add a missing-node/time case that returns `sourceState: 'UNAVAILABLE'` and null values. Precipitation uses provider model-step semantics rather than fabricated sub-hour accumulation.

- [ ] **Step 3: Implement runtime lookup with zero network IO**

```ts
export function environmentAtPassage(snapshot: EnvironmentSnapshot, corridorId: string, distanceKm: number, simIsoTime: string): EnvironmentContext {
  const nodes = snapshot.nodes.filter((node) => node.corridorId === corridorId).sort((a, b) => a.distanceKm - b.distanceKm);
  if (nodes.length === 0) return unavailableEnvironmentContext();
  const [a, b] = bracketByDistance(nodes, distanceKm);
  return interpolateEnvironment(a, b, distanceKm, simIsoTime, snapshot.sourceState);
}
```

- [ ] **Step 4: Write failing non-decisional context-rule test**

```ts
const before = snapshotVehicle(vehicle, corridor, 582);
const events = deriveContextEvents(before, environment, rules);
const after = snapshotVehicle(vehicle, corridor, 582);
expect(after).toEqual(before);
expect(events.every((e) => e.severity === 'INFO' || e.severity === 'ATTENTION')).toBe(true);
```

- [ ] **Step 5: Implement explicit display rules**

```ts
export interface ContextRule {
  id: string;
  type: ContextSignalType;
  metric: 'elevationM' | 'windGustKmh' | 'temperatureC' | 'precipitationMm' | 'travelMinutes';
  operator: '>=' | '>' | '<=' | '<';
  threshold: number;
  sourceKind: 'SCENARIO_DISPLAY_RULE';
  evidenceRefs: string[];
}
```

Rules emit only `INFO` or `ATTENTION`; never `SAFE`, `DANGER`, closure, or stop instructions.

- [ ] **Step 6: Generate snapshot and create the checked-in run artifact**

`sanjuan-v0-run.v1.json` references the exact generated environment snapshot id, target date, issue/data-as-of timestamps, `mode: "SIMULATED"`, scenario version, model version, and seed. There is no temporary environment id.

- [ ] **Step 7: Integrate environment after movement derivation**

Engine derives vehicle movement first, then enriches each vehicle with environment context and context events. Vehicle panel labels the block `MODELLED ENVIRONMENT` and shows source state.

- [ ] **Step 8: Validate, test, and commit**

```bash
npm test -- --run src/environment/lookup.test.ts src/environment/contextRules.test.ts src/simulation/engine.test.ts
npm run validate:data
git add scripts public/data/environment public/data/runs src/environment src/simulation/engine.ts src/ui/VehiclePanel.tsx
git commit -m "feat: add weather-at-passage context"
```

---

### Task 10: Add deterministic calibrated background territorial traffic

**Files:**
- Create: `public/data/calibration/traffic.v1.json`, `src/simulation/backgroundTraffic.ts`, `src/simulation/backgroundTraffic.test.ts`
- Modify: `src/map/cesiumAdapter.ts`, `src/simulation/engine.ts`

**Interfaces:**
- Consumes: DNV historical calibration, Andean analogue metadata, `backgroundTraffic` RNG stream.
- Produces: subdued deterministic civilian markers separate from operational metrics.

- [ ] **Step 1: Create calibration artifact with evidence roles**

Store relative intensity/time-of-day factors only. DNV TMDA entries use `CALIBRATION`; Chile PNCV uses `ANALOGUE`. Limitations explicitly state this is not live San Juan traffic.

- [ ] **Step 2: Write failing determinism/isolation test**

```ts
const a = backgroundTrafficAt('20260830', 600, calibration);
const b = backgroundTrafficAt('20260830', 600, calibration);
expect(a).toEqual(b);
expect(a.every((v) => v.id.startsWith('BG-'))).toBe(true);
expect(getOperationalSnapshot(spec, run, 600).vehicles).toHaveLength(24);
```

- [ ] **Step 3: Implement simple bounded background generation**

```ts
export function backgroundTrafficAt(seed: string, minuteOfDay: number, calibration: TrafficCalibration): BackgroundVehicle[] {
  const rng = createNamedRng(seed, 'backgroundTraffic');
  const band = calibration.timeBands.find((b) => minuteOfDay >= b.startMinute && minuteOfDay < b.endMinute)!;
  const count = Math.min(calibration.maxVisibleVehicles, Math.round(band.relativeIntensity * calibration.baseVisibleVehicles));
  return Array.from({ length: count }, (_, index) => buildBackgroundVehicle(`BG-${index + 1}`, rng, minuteOfDay, calibration));
}
```

No car-following, lane change, congestion engine, or route optimization.

- [ ] **Step 4: Render with lower salience**

Background entities use smaller/subdued markers, no default labels, and never open the operational vehicle panel.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run src/simulation/backgroundTraffic.test.ts
npm run validate:data
git add public/data/calibration src/simulation/backgroundTraffic* src/map/cesiumAdapter.ts src/simulation/engine.ts
git commit -m "feat: add calibrated background traffic"
```

---

### Task 11: Add cartographic instrumentation, analysis surfaces, and responsive no-clipping behavior

**Files:**
- Create: `docs/research/cesium-cartographic-controls.md`
- Create: `src/map/cartographicReadout.ts`, `src/map/cartographicReadout.test.ts`
- Create: `src/ui/MapInstrumentation.tsx`, `src/ui/AnalysisDrawer.tsx`, `src/ui/SourceState.tsx`, `src/ui/AnalysisDrawer.test.tsx`
- Modify: `src/map/CesiumMap.tsx`, `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: Cesium camera/scene/globe APIs and evidence/profile/environment data.
- Produces: north/heading, scale, cursor coordinates/elevation, attribution, home camera, progressive disclosure, desktop/tablet/mobile layouts.

- [ ] **Step 1: Audit proven Cesium/open-source control patterns before coding**

Document the exact APIs/patterns selected for compass heading, scale calculation, cursor pick/elevation, home camera, and attribution, including source links and licensing/credit implications. Prefer Cesium-native/community-established methods over decorative approximations.

- [ ] **Step 2: Write failing pure formatting/scale tests**

```ts
expect(formatCoordinates(-31.5376, -68.5364)).toBe('31.5376° S · 68.5364° W');
expect(formatElevation(1025.4)).toBe('1,025 m');
expect(selectScaleBarMeters(376)).toBe(200);
```

`selectScaleBarMeters` chooses a readable `1/2/5 × 10ⁿ` value not exceeding available ground distance.

- [ ] **Step 3: Implement pure cartographic helpers**

```ts
export function selectScaleBarMeters(available: number): number {
  const power = 10 ** Math.floor(Math.log10(available));
  for (const multiplier of [5, 2, 1]) {
    const candidate = multiplier * power;
    if (candidate <= available) return candidate;
  }
  return power / 2;
}
```

Coordinate/elevation formatters return `—` for absent picks instead of stale values.

- [ ] **Step 4: Implement Cesium-driven instrumentation**

Compass follows `camera.heading`; cursor readout uses scene/globe picking; scale derives from audited ground-distance screen picks and updates on camera change; home resets to the versioned San Juan regional extent. Do not hide imagery/terrain/Cesium credits.

- [ ] **Step 5: Write failing disclosure test**

```tsx
render(<AnalysisDrawer open tab="Sources" data={fixture} />);
expect(screen.getByText(/limitations/i)).toBeVisible();
expect(screen.getByText(/source/i)).toBeVisible();
```

Also verify `UNAVAILABLE` renders a calm source-state message.

- [ ] **Step 6: Implement analysis drawer and responsive rules**

Desktop vehicle panel width `320–380px`; analysis drawer maximum about `420px`; content scrolls internally. Breakpoints:

```text
>=1280px: map-first desktop + side detail
768–1279px: narrower/collapsible detail
<768px: map top + simplified HUD + bottom-sheet detail
```

Critical labels wrap/reflow; do not use uncontrolled ellipsis on evidence, source state, or operational state.

- [ ] **Step 7: Implement reduced-motion behavior**

Use `matchMedia('(prefers-reduced-motion: reduce)')`; intro/drawer state changes become immediate when true.

- [ ] **Step 8: Verify and commit**

```bash
npm test -- --run src/map/cartographicReadout.test.ts src/ui/AnalysisDrawer.test.ts src/ui/ui.test.tsx
npm run build
git add docs/research src/map src/ui src/app
git commit -m "feat: add cartographic and responsive analysis UI"
```

---

### Task 12: Final verification, visual QA, provenance audit, and README

**Files:**
- Modify: `README.md`
- Create: `docs/qa/v0-acceptance.md`, `docs/data-sources.md`
- Modify implementation files only to fix defects found by verification.

**Interfaces:**
- Consumes: complete V0.
- Produces: verified deterministic build, documented evidence boundary, acceptance record, user-facing README.

- [ ] **Step 1: Run the complete automated gate**

```bash
npm test -- --run
npm run validate:data
npm run build
```

Expected: all PASS. Any red gate blocks completion.

- [ ] **Step 2: Verify deterministic replay**

Serialize domain snapshots at `06:00`, `09:00`, `12:00`, `16:00`, `20:00` twice from the same checked-in run and compare them exactly. Record command/method and result in `docs/qa/v0-acceptance.md`.

- [ ] **Step 3: Perform manual visual QA at representative widths**

Record pass/fail for desktop `1440×900`, tablet `1024×768`, mobile `390×844`:

```text
no clipped text
no clipped chart axes/labels
no panel hides most of the map
HUD remains readable
vehicle/detail panel scrolls internally when needed
north/scale/coordinates/elevation/attribution are visible
regional labels remain legible
```

Fix every failure before continuing.

- [ ] **Step 4: Audit overclaim/provenance wording**

```bash
grep -RniE "safe|unsafe|road closed|real-time|live telemetry|operator route|verified route" src public README.md docs || true
```

Every occurrence is either explicit negative/explanatory wording or backed by primary evidence. Confirm synthetic speed/departure/stop assumptions use `SYNTHETIC_ASSUMPTION` and reconstructed routes remain visibly reconstructed.

- [ ] **Step 5: Write source documentation**

`docs/data-sources.md` lists project/corridor/elevation/weather/traffic references with role, source, retrieval date, method, license where known, and limitations. Community/Reddit evidence is explicitly qualitative and cannot define numeric thresholds.

- [ ] **Step 6: Rewrite README as product entry point**

Use these sections:

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

Lead with `Real territory · modelled environment · synthetic operation.` and state explicitly that the app is not live company telemetry or a safety/transitability system.

- [ ] **Step 7: Re-run complete gate**

```bash
npm test -- --run
npm run validate:data
npm run build
```

- [ ] **Step 8: Commit verified V0**

```bash
git add README.md docs src public scripts
git commit -m "docs: verify and document mining ops V0"
```

---

## Spec Coverage Gate

Before declaring V0 complete, every approved requirement maps to a completed task:

- Contracts/provenance: Tasks 2, 4, 9, 12.
- 10 projects / 3 corridors / versioned elevation: Task 4.
- Deterministic clock and named randomness: Task 3.
- 24-unit outbound/return operation: Tasks 5–6.
- Cesium map-first scene / persistent entities: Task 7.
- Intro/HUD/timeline/vehicle inspection: Task 8.
- Immutable environment snapshot / weather at passage / context-only signals / real run artifact: Task 9.
- Background territorial traffic: Task 10.
- North/scale/coordinates/elevation/attribution + source/details + responsive/no-clipping: Task 11.
- Automated/visual/provenance QA + README: Task 12.

Do not import mine-internal `minehaulsim` DES complexity. It remains a methodological reference only.