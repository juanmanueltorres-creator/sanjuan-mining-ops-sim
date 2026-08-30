# San Juan Mining Ops Sim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, map-first Cesium simulation of 24 synthetic mining mobilizations across three sourced/reconstructed San Juan corridors, with versioned elevation/weather context, provenance, calibrated background traffic, and compact responsive operational UI.

**Architecture:** Static sourced/versioned assets feed pure domain/simulation modules. `SanJuanOperationSpec + OperationalRun + simTime` produces an `OperationalSnapshot`; environment enrichment happens after movement derivation; Cesium and React only consume snapshots. Runtime provider calls, simulation truth in UI state, and weather-driven movement are excluded from V0.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, CesiumJS direct Viewer integration, Zod runtime validation, Web Animations API for restrained UI transitions, static JSON/GeoJSON, Node scripts for data validation/building.

**Spec:** `docs/superpowers/specs/2026-08-30-sanjuan-mining-ops-sim-design.md`

## Global Constraints

- Day: `06:00–20:00`, timezone `America/Argentina/San_Juan`.
- Playback: `60× | 120× | 300× | 600×`; default `300×`; initial paused.
- Fleet: exactly 24 highlighted synthetic units: 12 `PERSONNEL`, 6 `FIELD`, 6 `LOGISTICS`.
- Active destinations: Hualilán, Veladero, Los Azules; seven other sourced projects remain context only.
- V0 `OperationalRun.mode = SIMULATED`; weather semantics live in `EnvironmentSnapshot.modelKind`.
- Weather/environment never changes movement, speed, closures, transitability, or authorization in V0.
- Evidence roles: `PRIMARY | DERIVED | CALIBRATION | ANALOGUE | QUALITATIVE | SYNTHETIC_ASSUMPTION | METHOD_REFERENCE`.
- Geometry classes: `PUBLIC_ROAD | RECONSTRUCTED_ACCESS | APPROXIMATE_APPROACH | PROJECT_LOCATION`.
- Source states: `READY | STALE | PARTIAL | UNAVAILABLE`; critical invalid evidence fails closed.
- One Cesium `Viewer`, one primary `CustomDataSource`; persistent entities, no recreate-per-frame.
- No React `setState` every animation frame and no network request per vehicle/tick.
- No clipped text/charts, oversized panels, or decorative cartographic controls.
- Main map exposes north, scale, coordinates, elevation, attribution.
- Out of scope: live GPS/company telemetry, FMS, safety prediction, automatic closures, OEM physics, mine-internal haulage, auth/database/AI agent, sensitive private routes.

## File Map

```text
src/
  app/App.tsx
  app/app.css
  domain/{contracts,schemas,evidence}.ts
  simulation/{clock,rng,routeMath,schedule,vehicle,events,engine,backgroundTraffic}.ts
  environment/{lookup,contextRules}.ts
  data/loadOperation.ts
  map/{CesiumMap,cesiumAdapter,cartographicReadout}.ts(x)
  ui/{IntroOverlay,CommandHud,Timeline,VehiclePanel,AnalysisDrawer,SourceState,MapInstrumentation}.tsx
  test/setup.ts
scripts/{validate-data,build-route-samples,build-environment}.mjs
public/data/{projects,corridors,environment,calibration,runs}/
```

---

### Task 1: Scaffold tested React/Cesium shell

**Files:** `package.json`, `vite.config.ts`, `src/main.tsx`, `src/app/App.tsx`, `src/app/app.css`, `src/test/setup.ts`, `src/app/App.test.tsx`

**Produces:** green Vite/Vitest app shell.

- [ ] **Step 1: Scaffold/install**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install cesium zod
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-plugin-static-copy
```

Preserve existing `README.md`, `LICENSE`, `.gitignore`, `docs/`.

- [ ] **Step 2: Configure test/Cesium assets**

```ts
// vite.config.ts
export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
  plugins: [react(), viteStaticCopy({ targets: [
    { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
    { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
    { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
    { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
  ] })],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```

- [ ] **Step 3: Write RED test**

```tsx
render(<App />);
expect(screen.getByText('SAN JUAN MINING OPS SIM')).toBeInTheDocument();
expect(screen.getByText('Real territory · modelled environment · synthetic operation.')).toBeInTheDocument();
```

Run:

```bash
npm test -- --run src/app/App.test.tsx
```

- [ ] **Step 4: Minimal implementation**

```tsx
export function App() {
  return <main><h1>SAN JUAN MINING OPS SIM</h1><p>Real territory · modelled environment · synthetic operation.</p></main>;
}
```

`src/main.tsx` imports `cesium/Build/Cesium/Widgets/widgets.css`.

- [ ] **Step 5: GREEN/build/commit**

```bash
npm test -- --run
npm run build
git add .
git commit -m "chore: scaffold tested Cesium app shell"
```

---

### Task 2: Domain contracts + runtime validation

**Files:** `src/domain/contracts.ts`, `schemas.ts`, `evidence.ts`, `schemas.test.ts`

**Produces:** `parseOperationSpec`, `parseEnvironmentSnapshot`, `parseOperationalRun`, shared exact types.

- [ ] **Step 1: RED tests**

```ts
expect(() => parseOperationalRun({ ...validRun, mode: 'OBSERVED' })).toThrow();
for (const state of ['READY','STALE','PARTIAL','UNAVAILABLE'] as const) expect(parseSourceState(state)).toBe(state);
expect(() => parseCorridor({ ...validCorridor, evidenceRefs: [] })).toThrow();
```

- [ ] **Step 2: Define exact unions/contracts**

```ts
export type SourceState = 'READY'|'STALE'|'PARTIAL'|'UNAVAILABLE';
export type EvidenceRole = 'PRIMARY'|'DERIVED'|'CALIBRATION'|'ANALOGUE'|'QUALITATIVE'|'SYNTHETIC_ASSUMPTION'|'METHOD_REFERENCE';
export type GeometryEvidenceClass = 'PUBLIC_ROAD'|'RECONSTRUCTED_ACCESS'|'APPROXIMATE_APPROACH'|'PROJECT_LOCATION';
export type VehicleType = 'PERSONNEL'|'FIELD'|'LOGISTICS';
export type VehicleState = 'AT_BASE'|'EN_ROUTE'|'AT_STOP'|'AT_PROJECT'|'RETURNING'|'DONE';
export interface RouteSample { distanceKm:number; lon:number; lat:number; elevationM:number; segmentId:string }
```

Also define `EvidenceRef`, `ProjectDefinition`, `CorridorSegment`, `CorridorDefinition`, `VehicleDefinition`, `VehicleSnapshot`, `EnvironmentHour`, `EnvironmentNode`, `EnvironmentSnapshot`, `OperationalRun`, `OperationalEvent`, `ContextEvent`, `OperationalSnapshot`, `SanJuanOperationSpec` exactly once here.

- [ ] **Step 3: Implement Zod parsers**

```ts
const runSchema = z.object({
  id:z.string().min(1), targetDate:z.string().min(1), issuedAt:z.string().min(1), dataAsOf:z.string().min(1),
  timezone:z.literal('America/Argentina/San_Juan'), mode:z.literal('SIMULATED'),
  modelVersion:z.string().min(1), scenarioVersion:z.string().min(1), environmentSnapshotId:z.string().min(1),
  provenance:z.array(z.string()),
});
export const parseOperationalRun = (x:unknown) => runSchema.parse(x) as OperationalRun;
```

Corridor schema requires non-empty evidence refs; vehicle schema requires `synthetic: z.literal(true)`.

- [ ] **Step 4: Evidence resolver**

```ts
export function assertEvidenceRefsExist(ids:string[], refs:EvidenceRef[]) {
  const known = new Set(refs.map(r => r.id));
  const missing = ids.filter(id => !known.has(id));
  if (missing.length) throw new Error(`Missing evidence refs: ${missing.join(', ')}`);
}
```

- [ ] **Step 5: GREEN/commit**

```bash
npm test -- --run src/domain/schemas.test.ts
git add src/domain
git commit -m "feat: add validated operation contracts"
```

---

### Task 3: Deterministic clock + named RNG

**Files:** `src/simulation/clock.ts`, `rng.ts`, matching tests.

**Produces:** `createClock`, `advanceClock`, `resetClock`, `createNamedRng`.

- [ ] **Step 1: RED clock/RNG tests**

```ts
expect(createClock()).toEqual({ minuteOfDay:360, playing:false });
expect(advanceClock({minuteOfDay:360,playing:true},1000,300).minuteOfDay).toBe(365);
expect(advanceClock({minuteOfDay:1199,playing:true},1000,600).minuteOfDay).toBe(1200);
const a=createNamedRng('20260830','departures'), b=createNamedRng('20260830','departures');
expect([a(),a(),a()]).toEqual([b(),b(),b()]);
```

- [ ] **Step 2: Implement clock**

```ts
export const START_MINUTE=360, END_MINUTE=1200;
export type Playback=60|120|300|600;
export const createClock=()=>({minuteOfDay:START_MINUTE,playing:false});
export const resetClock=createClock;
export function advanceClock(c:OperationalClock, ms:number, speed:Playback):OperationalClock {
  if(!c.playing) return c;
  return {...c,minuteOfDay:Math.min(END_MINUTE,c.minuteOfDay+(ms/1000)*(speed/60))};
}
```

- [ ] **Step 3: Implement named Mulberry32 stream**

```ts
export function createNamedRng(seed:string|number,name:string):()=>number {
  let h=2166136261; for(const ch of `${seed}:${name}`) h=Math.imul(h^ch.charCodeAt(0),16777619);
  let a=h>>>0; return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
```

No scenario code uses `Math.random()`.

- [ ] **Step 4: GREEN/commit**

```bash
npm test -- --run src/simulation/clock.test.ts src/simulation/rng.test.ts
git add src/simulation/clock* src/simulation/rng*
git commit -m "feat: add deterministic operational clock"
```

---

### Task 4: Sourced projects + corridor asset pipeline + elevation

**Files:** `public/data/projects/projects.v1.json`; per-corridor `corridor.v1.geojson`, `profile.v1.json`, `metadata.v1.json`, `route-samples.v1.json`; `scripts/build-route-samples.mjs`, `validate-data.mjs`; `src/simulation/routeMath.ts`; `src/data/loadOperation.ts`; tests; `package.json`.

**Produces:** 10 validated projects, 3 active corridor bundles, versioned elevation samples, static loader.

- [ ] **Step 1: Source audit before geometry**

Record source URL/date/method/limitations for Hualilán, Veladero, Los Azules. Public road geometry may be `PUBLIC_ROAD`; unsupported mine access is `RECONSTRUCTED_ACCESS`/`APPROXIMATE_APPROACH` or omitted. Never label a reconstructed route operator-verified.

- [ ] **Step 2: RED route math test**

```ts
const s=[{distanceKm:0,lon:-68,lat:-31,elevationM:600,segmentId:'a'},{distanceKm:10,lon:-69,lat:-30,elevationM:1600,segmentId:'b'}];
expect(positionAtDistance(s,5)).toMatchObject({lon:-68.5,lat:-30.5,elevationM:1100});
```

- [ ] **Step 3: Implement interpolation**

```ts
export function positionAtDistance(samples:RouteSample[],d:number):RouteSample {
  if(d<=samples[0].distanceKm) return samples[0];
  if(d>=samples.at(-1)!.distanceKm) return samples.at(-1)!;
  const hi=samples.findIndex(s=>s.distanceKm>=d), a=samples[hi-1], b=samples[hi];
  const t=(d-a.distanceKm)/(b.distanceKm-a.distanceKm);
  return {distanceKm:d,lon:a.lon+(b.lon-a.lon)*t,lat:a.lat+(b.lat-a.lat)*t,elevationM:a.elevationM+(b.elevationM-a.elevationM)*t,segmentId:b.segmentId};
}
```

- [ ] **Step 4: Create exact project registry**

Exactly: Filo del Sol, Josemaría, Veladero, Gualcamayo, El Pachón, Los Azules, Altar, Hualilán, Casposo, Filo Sur. Exactly Hualilán/Veladero/Los Azules are active destinations. All have sourced project-location evidence refs.

- [ ] **Step 5: Build/validate route samples**

```js
if(samples[0].distanceKm!==0) throw new Error('route must start at 0 km');
for(let i=1;i<samples.length;i++) if(samples[i].distanceKm<=samples[i-1].distanceKm) throw new Error('route distances must increase');
```

`validate-data.mjs` additionally rejects segment gaps/overlap, missing critical evidence, bad geometry classes, missing elevation/profile samples. Add `"validate:data":"node scripts/validate-data.mjs"`.

- [ ] **Step 6: RED static loader test + implementation**

```ts
const data=await loadStaticOperationData(fakeFetch);
expect(data.projects).toHaveLength(10);
expect(data.corridors.map(c=>c.id).sort()).toEqual(['hualilan','los-azules','veladero']);
```

Loader fetches only checked-in `/data/...` assets and runs Task 2 parsers/evidence checks.

- [ ] **Step 7: GREEN/commit**

```bash
npm test -- --run src/simulation/routeMath.test.ts src/data/loadOperation.test.ts
npm run validate:data
git add public/data/projects public/data/corridors scripts src/data src/simulation/routeMath* package.json
git commit -m "feat: add sourced San Juan corridors"
```

---

### Task 5: 24-unit schedule + vehicle state machine

**Files:** `src/simulation/schedule.ts`, `vehicle.ts`, matching tests.

**Produces:** `buildV0Schedule(seed)`, `snapshotVehicle(vehicle,corridor,simMinute)`.

- [ ] **Step 1: RED fleet/state tests**

```ts
const f=buildV0Schedule('20260830');
expect(f).toHaveLength(24);
expect(f.filter(v=>v.type==='PERSONNEL')).toHaveLength(12);
expect(f.filter(v=>v.type==='FIELD')).toHaveLength(6);
expect(f.filter(v=>v.type==='LOGISTICS')).toHaveLength(6);
expect(buildV0Schedule('20260830')).toEqual(buildV0Schedule('20260830'));
expect(snapshotVehicle(vehicle,corridor,350).state).toBe('AT_BASE');
expect(snapshotVehicle(vehicle,corridor,900).state).toBe('RETURNING');
```

- [ ] **Step 2: Synthetic speed profiles**

```ts
export const SPEED_PROFILES={
 PERSONNEL:{pavedLowland:70,mountainRoad:45,highMountain:30,approach:25},
 FIELD:{pavedLowland:75,mountainRoad:50,highMountain:35,approach:30},
 LOGISTICS:{pavedLowland:60,mountainRoad:38,highMountain:25,approach:20},
} as const;
```

Every table/value is `SYNTHETIC_ASSUMPTION`, never observed company speed.

- [ ] **Step 3: Deterministic schedule generation**

Use named streams `departures`, `vehicleAssignment`, `dwellTimes`, `returnOffsets`; stagger departures; all three corridors receive all vehicle categories; returns are scheduled where the day permits.

- [ ] **Step 4: Implement state/position without reversing distance order**

```ts
export function snapshotVehicle(v:VehicleDefinition,c:CorridorDefinition,m:number):VehicleSnapshot {
  const p=deriveTravelPhase(v,c,m);
  const total=c.routeSamples.at(-1)!.distanceKm;
  const routeDistance=p.direction==='TO_PROJECT' ? p.legDistanceKm : total-p.legDistanceKm;
  const point=positionAtDistance(c.routeSamples,routeDistance);
  return {id:v.id,type:v.type,corridorId:c.id,state:p.state,direction:p.direction,position:{lon:point.lon,lat:point.lat},distanceKm:routeDistance,elevationM:point.elevationM,segmentId:point.segmentId,etaMinute:p.etaMinute};
}
```

`deriveTravelPhase` uses the same segment durations/planned dwell model as ETA.

- [ ] **Step 5: GREEN/commit**

```bash
npm test -- --run src/simulation/schedule.test.ts src/simulation/vehicle.test.ts
git add src/simulation/schedule* src/simulation/vehicle*
git commit -m "feat: add deterministic mining fleet schedule"
```

---

### Task 6: Operational snapshots + event log

**Files:** `src/simulation/events.ts`, `engine.ts`, matching tests.

**Produces:** `deriveOperationalEvents`, `getOperationalSnapshot`.

- [ ] **Step 1: RED determinism/event tests**

```ts
expect(getOperationalSnapshot(spec,run,582)).toEqual(getOperationalSnapshot(spec,run,582));
expect(deriveOperationalEvents(vehicle,corridor).map(e=>e.event)).toEqual(['DEPART_BASE','ENTER_CORRIDOR','ARRIVE_PROJECT','DEPART_PROJECT','ENTER_RETURN','ARRIVE_BASE']);
```

Add `PASS_NODE` for versioned nodes and stable `(t,vehicleId,event)` sorting.

- [ ] **Step 2: Implement event sorting**

```ts
export const sortOperationalEvents=(e:OperationalEvent[])=>[...e].sort((a,b)=>a.t-b.t||a.vehicleId.localeCompare(b.vehicleId)||a.event.localeCompare(b.event));
```

- [ ] **Step 3: Implement snapshot engine using only declared spec fields**

```ts
export function getOperationalSnapshot(spec:SanJuanOperationSpec,run:OperationalRun,simMinute:number):OperationalSnapshot {
  const corridorById=new Map(spec.corridors.map(c=>[c.id,c]));
  const vehicles=spec.fleet.map(v=>snapshotVehicle(v,corridorById.get(v.corridorId)!,simMinute));
  const allEvents=sortOperationalEvents(spec.fleet.flatMap(v=>deriveOperationalEvents(v,corridorById.get(v.corridorId)!)));
  return {simTime:simMinute,vehicles,corridorStates:deriveCorridorStates(vehicles,spec.corridors),operationalEvents:allEvents.filter(e=>e.t<=simMinute),contextEvents:[],metrics:deriveMetrics(vehicles)};
}
```

No weather fetch/mutation here.

- [ ] **Step 4: GREEN/commit**

```bash
npm test -- --run src/simulation/events.test.ts src/simulation/engine.test.ts
git add src/simulation/events* src/simulation/engine*
git commit -m "feat: add deterministic operation engine"
```

---

### Task 7: Cesium scene + intro/HUD/timeline/selection

**Files:** `src/map/CesiumMap.tsx`, `cesiumAdapter.ts`, test; `src/ui/IntroOverlay.tsx`, `CommandHud.tsx`, `Timeline.tsx`, `VehiclePanel.tsx`, `ui.test.tsx`; `src/app/*`.

**Produces:** one persistent scene and compact operational controls.

- [ ] **Step 1: RED adapter persistence test**

```ts
const a=createOperationalAdapter(fakeSink,fleetIds);
expect(fakeSink.size()).toBe(24);
a.apply(snapshot0800); a.apply(snapshot0801);
expect(fakeSink.size()).toBe(24);
```

- [ ] **Step 2: Implement adapter boundary**

```ts
export interface VehicleEntitySink { ensure(id:string):void; setPosition(id:string,lon:number,lat:number,elevationM:number):void; setVisible(id:string,v:boolean):void }
export function createOperationalAdapter(s:VehicleEntitySink,ids:string[]){ ids.forEach(id=>s.ensure(id)); return {apply(x:OperationalSnapshot){x.vehicles.forEach(v=>{s.setPosition(v.id,v.position.lon,v.position.lat,v.elevationM);s.setVisible(v.id,v.state!=='DONE');});}}; }
```

- [ ] **Step 3: Implement one Viewer lifecycle**

Create Viewer once in `useEffect`; create one `CustomDataSource`; render 10 projects/3 corridors once; create 24 vehicle entities once; destroy Viewer on unmount. React does not recreate entities per snapshot.

- [ ] **Step 4: RED UI smoke test**

```tsx
render(<App/>);
expect(screen.getByRole('button',{name:/start shift/i})).toBeVisible();
await user.click(screen.getByRole('button',{name:/start shift/i}));
expect(screen.getByText('06:00')).toBeVisible();
```

Also test play/pause/reset/playback and selected vehicle detail.

- [ ] **Step 5: Implement intro/HUD/timeline/panel**

Intro leaves Viewer mounted behind it. HUD is compact. Timeline maps `06:00–20:00` using:

```ts
const fraction=(minute-360)/840;
const minuteFromPointer=360+pointerFraction*840;
```

Vehicle panel desktop width `320–380px`, internal scroll, no giant card.

- [ ] **Step 6: Animation loop outside React render loop**

Use refs/controller + `requestAnimationFrame`; React textual state may update at coarse cadence, but Cesium adapter receives every visual snapshot directly.

- [ ] **Step 7: GREEN/build/commit**

```bash
npm test -- --run src/map/cesiumAdapter.test.ts src/ui/ui.test.tsx
npm run build
git add src/map src/ui src/app
git commit -m "feat: add map-first operational experience"
```

---

### Task 8: Immutable environment + weather-at-passage + context rules + real run artifact

**Files:** `scripts/build-environment.mjs`; generated `public/data/environment/environment-sj-<stamp>.json`; `public/data/runs/sanjuan-v0-run.v1.json`; `src/environment/{lookup,contextRules}.ts` + tests; modify engine/panel/validator.

**Produces:** versioned weather snapshot, runtime lookup, non-decisional signals, exact checked-in V0 run.

- [ ] **Step 1: Environment build contract**

Define route-tied environment nodes. Build command:

```bash
node scripts/build-environment.mjs --target-date 2026-08-30 --out public/data/environment/environment-sj-20260830.json
```

Script normalizes provider hourly temperature/precipitation/snowfall/wind/gust/direction and source metadata. Runtime never calls provider.

- [ ] **Step 2: RED lookup tests**

```ts
const c=environmentAtPassage(snapshot,'veladero',50,'2026-08-30T09:30:00-03:00');
expect(c.sourceState).toBe('READY');
expect(Number.isFinite(c.temperatureC!)).toBe(true);
expect(environmentAtPassage(empty,'veladero',50,time).sourceState).toBe('UNAVAILABLE');
```

- [ ] **Step 3: Implement lookup**

```ts
export function environmentAtPassage(s:EnvironmentSnapshot,corridorId:string,d:number,time:string):EnvironmentContext {
  const nodes=s.nodes.filter(n=>n.corridorId===corridorId).sort((a,b)=>a.distanceKm-b.distanceKm);
  if(!nodes.length) return unavailableEnvironmentContext();
  const [a,b]=bracketByDistance(nodes,d);
  return interpolateEnvironment(a,b,d,time,s.sourceState);
}
```

Continuous variables may interpolate; precipitation follows model-step semantics.

- [ ] **Step 4: RED non-decision rule test**

```ts
const before=snapshotVehicle(vehicle,corridor,582);
const events=deriveContextEvents(before,environment,rules);
expect(snapshotVehicle(vehicle,corridor,582)).toEqual(before);
expect(events.every(e=>['INFO','ATTENTION'].includes(e.severity))).toBe(true);
```

- [ ] **Step 5: Implement explicit display rules**

```ts
export interface ContextRule { id:string; type:ContextSignalType; metric:'elevationM'|'windGustKmh'|'temperatureC'|'precipitationMm'|'travelMinutes'; operator:'>='|'>'|'<='|'<'; threshold:number; sourceKind:'SCENARIO_DISPLAY_RULE'; evidenceRefs:string[] }
```

No `SAFE`, `DANGER`, closure, stop advice.

- [ ] **Step 6: Create exact real run artifact after snapshot generation**

`sanjuan-v0-run.v1.json` references the exact snapshot id, target/issue/data-as-of, seed, scenario/model versions, and `mode:"SIMULATED"`. No temporary environment id.

- [ ] **Step 7: Integrate after movement**

Engine derives movement first, then environment context/context events; VehiclePanel labels block `MODELLED ENVIRONMENT` with source state.

- [ ] **Step 8: GREEN/validate/commit**

```bash
npm test -- --run src/environment/lookup.test.ts src/environment/contextRules.test.ts src/simulation/engine.test.ts
npm run validate:data
git add scripts public/data/environment public/data/runs src/environment src/simulation/engine.ts src/ui/VehiclePanel.tsx
git commit -m "feat: add weather-at-passage context"
```

---

### Task 9: Calibrated background traffic + cartographic instrumentation + responsive detail

**Files:** `public/data/calibration/traffic.v1.json`; `src/simulation/backgroundTraffic.ts` + test; `docs/research/cesium-cartographic-controls.md`; `src/map/cartographicReadout.ts` + test; `src/ui/{MapInstrumentation,AnalysisDrawer,SourceState}.tsx` + tests; modify map/app CSS.

**Produces:** subdued synthetic civilian movement, north/scale/coords/elevation/attribution, progressive disclosure, no-clipping responsive UI.

- [ ] **Step 1: Background calibration artifact**

DNV historical traffic = `CALIBRATION`; Chile PNCV = `ANALOGUE`; store relative/time-band factors only and state explicitly “not live San Juan traffic”.

- [ ] **Step 2: RED background determinism test + implementation**

```ts
expect(backgroundTrafficAt('20260830',600,cal)).toEqual(backgroundTrafficAt('20260830',600,cal));
expect(backgroundTrafficAt('20260830',600,cal).every(v=>v.id.startsWith('BG-'))).toBe(true);
```

```ts
export function backgroundTrafficAt(seed:string,m:number,c:TrafficCalibration){ const rng=createNamedRng(seed,'backgroundTraffic'); const band=c.timeBands.find(b=>m>=b.startMinute&&m<b.endMinute)!; const n=Math.min(c.maxVisibleVehicles,Math.round(band.relativeIntensity*c.baseVisibleVehicles)); return Array.from({length:n},(_,i)=>buildBackgroundVehicle(`BG-${i+1}`,rng,m,c)); }
```

No microsimulation/congestion/lane changes.

- [ ] **Step 3: Audit Cesium/open-source cartographic patterns before coding**

Document chosen heading/compass, scale, cursor terrain pick, home camera, credits APIs/patterns with source links/license implications.

- [ ] **Step 4: RED helper tests + implementation**

```ts
expect(formatCoordinates(-31.5376,-68.5364)).toBe('31.5376° S · 68.5364° W');
expect(formatElevation(1025.4)).toBe('1,025 m');
expect(selectScaleBarMeters(376)).toBe(200);
```

```ts
export function selectScaleBarMeters(x:number){ const p=10**Math.floor(Math.log10(x)); for(const m of [5,2,1]) if(m*p<=x) return m*p; return p/2; }
```

- [ ] **Step 5: Implement map instrumentation**

North follows camera heading; scale derives from audited screen/ground picks; cursor coordinate/elevation uses Cesium globe/terrain pick and returns `—` when absent; home resets to San Juan regional extent; credits remain readable.

- [ ] **Step 6: RED detail/source test + responsive implementation**

```tsx
render(<AnalysisDrawer open tab="Sources" data={fixture}/>);
expect(screen.getByText(/limitations/i)).toBeVisible();
```

CSS acceptance: desktop map dominant, panel `320–380px`, analysis drawer ~`420px` max, tablet more collapse, mobile map-top + bottom sheet. Critical evidence/status text wraps; charts reserve label/axis space. Honor `prefers-reduced-motion`.

- [ ] **Step 7: GREEN/build/commit**

```bash
npm test -- --run src/simulation/backgroundTraffic.test.ts src/map/cartographicReadout.test.ts src/ui/AnalysisDrawer.test.tsx
npm run validate:data
npm run build
git add public/data/calibration docs/research src/simulation/backgroundTraffic* src/map src/ui src/app
git commit -m "feat: add territorial context and cartographic UI"
```

---

### Task 10: Final verification + data/source docs + README

**Files:** `README.md`, `docs/qa/v0-acceptance.md`, `docs/data-sources.md`; fix implementation only for discovered defects.

**Produces:** verified V0 with explicit evidence boundary.

- [ ] **Step 1: Automated gate**

```bash
npm test -- --run
npm run validate:data
npm run build
```

All must pass.

- [ ] **Step 2: Deterministic replay QA**

Serialize snapshots at 06:00, 09:00, 12:00, 16:00, 20:00 twice from the same checked-in run; require exact equality; document method/result in `docs/qa/v0-acceptance.md`.

- [ ] **Step 3: Visual QA**

Test `1440×900`, `1024×768`, `390×844`: no clipped text/chart labels, no giant panel hiding most map, readable HUD, internal detail scrolling, visible north/scale/coords/elevation/attribution, legible regional labels. Fix every fail before continuing.

- [ ] **Step 4: Overclaim/provenance audit**

```bash
grep -RniE "safe|unsafe|road closed|real-time|live telemetry|operator route|verified route" src public README.md docs || true
```

Every match is negative/explanatory or backed by primary evidence. Synthetic speed/departure/stop = `SYNTHETIC_ASSUMPTION`; reconstructed routes remain visibly reconstructed.

- [ ] **Step 5: Source documentation**

`docs/data-sources.md` lists source, role, retrieval date, method, license where known, limitations for projects/corridors/elevation/weather/traffic. Reddit/community evidence is explicitly qualitative only and never numeric threshold input.

- [ ] **Step 6: README**

Sections: `What it is`, `What it is not`, `V0 experience`, `Data/evidence model`, `Architecture`, `Run locally`, `Tests/data validation`, `Sources and limitations`, `Roadmap`, `License`. Lead with `Real territory · modelled environment · synthetic operation.` and say it is not live telemetry or a safety/transitability system.

- [ ] **Step 7: Re-run gate + commit**

```bash
npm test -- --run
npm run validate:data
npm run build
git add README.md docs src public scripts
git commit -m "docs: verify and document mining ops V0"
```

## Spec Coverage Gate

- Contracts/provenance: Tasks 2, 4, 8, 10.
- 10 projects / 3 corridors / elevation: Task 4.
- Deterministic clock/RNG: Task 3.
- 24 vehicles/outbound-return: Tasks 5–6.
- Cesium map-first + controls: Task 7.
- Immutable environment/weather-at-passage/context-only signals/run artifact: Task 8.
- Background traffic/cartographic references/responsive/no-clipping/source surfaces: Task 9.
- Full tests/visual QA/provenance audit/README: Task 10.

Do not import mine-internal `minehaulsim` DES complexity; it remains a methodological reference only.