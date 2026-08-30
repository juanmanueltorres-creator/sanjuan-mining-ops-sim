# San Juan Mining Ops Sim — V0 Design

Date: 2026-08-30
Status: Approved design, pre-implementation
Repository: `juanmanueltorres-creator/sanjuan-mining-ops-sim`

## 1. Purpose

`sanjuan-mining-ops-sim` is a map-first 3D simulation of synthetic mining mobilizations across real San Juan territory, real/reconstructed public corridors, derived elevation, and versioned modelled weather context.

The product question is:

> Where will each mobilization be throughout the operational day, and what territory and modelled environmental context will it encounter when it passes?

The V0 must be visually strong, deterministic, reproducible, source-aware, and explicit about the boundary between real territory, modelled environment, and synthetic operation.

Core statement:

> Real territory · modelled environment · synthetic operation.

This repository is a focused product lab, not a replacement for GeoPlatform and not a real fleet-management system.

## 2. Product Boundary

### V0 includes

- 10 sourced San Juan mining projects visible in the regional scene.
- 3 active operational corridors:
  - San Juan → Hualilán.
  - San Juan → Iglesia/Tudcum → Veladero.
  - San Juan → Calingasta → Los Azules.
- 24 synthetic operational vehicles:
  - 12 personnel vans/minibuses.
  - 6 field/supervision pickups.
  - 6 logistics trucks.
- Synthetic territorial background traffic calibrated/contrasted with public road datasets.
- Operational day from 06:00 to 20:00 in `America/Argentina/San_Juan`.
- Deterministic simulation with seeded synthetic assumptions.
- Cesium 3D terrain/map renderer from day one.
- Versioned elevation profiles.
- Versioned modelled-weather snapshot generated before the run.
- Weather-at-passage context.
- Context signals that describe conditions without making operational or safety decisions.
- Intro overlay, compact command HUD, timeline, vehicle inspection, source/provenance surfaces, and cartographic reference controls.

### Explicitly out of scope for V0

- Live GPS or real company telemetry.
- Real mine dispatch/FMS integration.
- Automatic road-safety prediction.
- Automatic closures or transitability claims.
- OEM vehicle physics, rimpull/retarder models, fuel optimization, tyre models, or productivity claims.
- Mine-internal haulage, shovel/crusher dispatch, blending, or underground mine simulation.
- Backend authentication, database, multi-user features, or AI agents.
- Automatic weather-driven speed changes or vehicle stops.
- Sensitive/private operator route disclosure.

## 3. Design Principles

1. **Map first.** The territory remains the protagonist; interface surfaces are compact and appear progressively.
2. **Observed/modelled/simulated are never conflated.** Every important number or geometry must know what kind of evidence it represents.
3. **Context is not a decision.** Weather and terrain may produce contextual signals, but V0 does not automatically declare a road safe, unsafe, open, closed, or authorized.
4. **Determinism by default.** The same scenario, environment snapshot, and seed must produce the same run.
5. **Fail closed.** Missing or invalid evidence becomes unavailable/invalid, never silently synthesized.
6. **Versioned evidence.** Geometry, profiles, environment snapshots, calibration assets, and run metadata are versioned and auditable.
7. **Small isolated units.** The simulation engine, environment lookup, provenance, Cesium adapter, and UI remain separately testable.
8. **No visual overclaim.** Strong visual design must not make synthetic data look like observed telemetry.
9. **No clipping.** Text, charts, labels, and cards must fit their surfaces. Oversized panels that hide the map are considered defects.
10. **Cartographic credibility.** Scale, north reference, coordinates, elevation, and attribution are first-class interface elements rather than decoration.

## 4. Architectural Overview

```text
SOURCED TERRITORY
projects · corridors · elevation · weather snapshot
                │
                ▼
        SanJuanOperationSpec
                │
      ┌─────────┴─────────┐
      │                   │
      ▼                   ▼
Synthetic Schedule   EnvironmentSnapshot
      │                   │
      ▼                   │
 Simulation Engine        │
      │                   │
      └─────────┬─────────┘
                ▼
      OperationalSnapshot
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
    Cesium      HUD      Event Log
```

The pure simulation engine must not import React, Cesium, browser fetch logic, or provider-specific weather code. It consumes already-resolved domain inputs and returns snapshots/events.

Recommended logical structure:

```text
src/
  domain/
  simulation/
  environment/
  map/
  components/
  provenance/

public/data/
  projects/
  corridors/
  environment/
  calibration/
  runs/
```

The exact file layout may change during implementation, but the dependency direction must remain: domain/data → pure simulation/environment lookup → presentation adapters/UI.

## 5. Core Contracts

### 5.1 SanJuanOperationSpec

Conceptual contract:

```ts
interface SanJuanOperationSpec {
  schemaVersion: string;
  scenarioId: string;
  timezone: 'America/Argentina/San_Juan';
  seed: string | number;
  territory: TerritoryDefinition;
  corridors: CorridorDefinition[];
  fleet: VehicleDefinition[];
  schedule: ScheduleDefinition;
  calibration: CalibrationDefinition;
  provenance: EvidenceRef[];
}
```

The spec is an immutable scenario description. It should be serializable and reproducible.

### 5.2 OperationalRun

```ts
interface OperationalRun {
  id: string;
  targetDate: string;
  issuedAt: string;
  dataAsOf: string;
  timezone: 'America/Argentina/San_Juan';
  mode: 'SIMULATED' | 'WHAT_IF' | 'OBSERVED';
  modelVersion: string;
  scenarioVersion: string;
  environmentSnapshotId: string;
  provenance: EvidenceRef[];
}
```

V0 uses `mode = 'SIMULATED'` only. `WHAT_IF` and `OBSERVED` are reserved for later explicit modes. Environmental forecast/historical semantics live in `EnvironmentSnapshot.modelKind`, not in the operational mode.

A run references one immutable environment snapshot. Refreshing environmental data creates a new snapshot and therefore a new run; it never mutates a previous run.

### 5.3 OperationalSnapshot

```ts
interface OperationalSnapshot {
  simTime: string;
  vehicles: VehicleSnapshot[];
  corridorStates: CorridorState[];
  operationalEvents: OperationalEvent[];
  contextEvents: ContextEvent[];
  metrics: OperationalMetrics;
}
```

This is the presentation boundary consumed by Cesium and UI components.

## 6. Territory and Corridor Model

### 6.1 Mining projects

The regional scene contains these 10 San Juan mining projects:

- Filo del Sol
- Josemaría
- Veladero
- Gualcamayo
- El Pachón
- Los Azules
- Altar
- Hualilán
- Casposo
- Filo Sur

Only Hualilán, Veladero, and Los Azules are active operational destinations in V0. The remaining projects provide territorial context and should have lower visual salience.

### 6.2 CorridorDefinition

```ts
interface CorridorDefinition {
  id: string;
  name: string;
  origin: LocationRef;
  destination: LocationRef;
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  geometryClass: GeometryEvidenceClass;
  segments: CorridorSegment[];
  nodes: CorridorNode[];
  elevationProfile: ElevationProfile;
  evidenceRefs: string[];
  retrievedAt: string;
  limitations: string[];
}
```

Geometry evidence classes:

```text
PUBLIC_ROAD
RECONSTRUCTED_ACCESS
APPROXIMATE_APPROACH
PROJECT_LOCATION
```

A reconstructed or approximate route must never be labelled as an operator-verified route. Exact route geometry is validated before implementation; if evidence is insufficient, the geometry must be clearly labelled schematic/approximate or excluded.

Agua Negra is a reference implementation for source handling, route/profile/weather-node patterns, and map-first corridor UX. It is not a fourth active V0 operational corridor.

### 6.3 Corridor segments

Each active corridor is decomposed into operationally useful segments. Example for Veladero:

```text
San Juan → Albardón
Albardón → Talacasto
Talacasto → Iglesia
Iglesia → Tudcum
Tudcum → high mountain
High mountain → project approach
```

Contract:

```ts
interface CorridorSegment {
  id: string;
  corridorId: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  elevationMinM: number;
  elevationMaxM: number;
  gradeProxy?: number;
  roadClass: string;
  geometryConfidence: GeometryEvidenceClass;
  environmentNodeIds: string[];
}
```

Segment boundaries must be versioned with the corridor asset rather than inferred ad hoc in the UI.

## 7. Operational Day and Fleet

### 7.1 Clock

- Start: `06:00`
- End: `20:00`
- Timezone: `America/Argentina/San_Juan`
- Default playback: `300×`
- User-selectable playback: `60×`, `120×`, `300×`, `600×`
- 14 simulated hours at `300×` ≈ 2 minutes 48 seconds real time.
- Initial state is paused at 06:00.
- Primary CTA: `START SHIFT`.
- No autoplay.

### 7.2 Vehicle types

```text
PERSONNEL  → 12 units
FIELD      → 6 units
LOGISTICS  → 6 units
```

No real brands, operator identities, or company-specific fleet claims.

```ts
interface VehicleDefinition {
  id: string;
  type: 'PERSONNEL' | 'FIELD' | 'LOGISTICS';
  corridorId: string;
  direction: 'TO_PROJECT' | 'RETURN_TO_BASE';
  departureTime: string;
  speedProfileId: string;
  plannedStops: PlannedStop[];
  synthetic: true;
}
```

### 7.3 Vehicle runtime states

```text
AT_BASE
EN_ROUTE
AT_STOP
AT_PROJECT
RETURNING
DONE
```

Returns are essential. Vehicles do not simply disappear at the destination; staggered return movements create crossing traffic and make the day behave like an operational network rather than a race toward the mountains.

### 7.4 Synthetic speed profiles

Speed is not a single constant and not an OEM physics model. Each vehicle class uses a synthetic scenario profile by segment class, for example:

```text
pavedLowland
mountainRoad
highMountain
approach
```

Every speed assumption is labelled `SYNTHETIC_ASSUMPTION`. Exact values are part of the versioned scenario and are not presented as observed company speeds.

### 7.5 Planned stops

V0 supports only a few generic planned-stop types:

```text
CHECKPOINT
REST
TRANSFER
PROJECT
```

Stops must either be sourced territorial nodes or clearly labelled synthetic planned stops. The app must not invent real private-company checkpoints.

## 8. Deterministic Simulation

The movement engine derives vehicle state and position from:

```text
departure time
+ corridor geometry
+ segment speed profile
+ planned stops
= state/position at simTime
```

It must not require thousands of precomputed positions.

Seeded randomness is separated into named concerns so that changes in one concern do not perturb unrelated parts of the simulation:

```text
departures
vehicleAssignment
dwellTimes
backgroundTraffic
returnOffsets
```

Weather is never an RNG stream. Environmental evidence comes from the immutable environment snapshot.

The deterministic requirement is strict:

> Same operation spec + same environment snapshot + same seed ⇒ same operational events and same snapshots for the same simulation times.

## 9. Event Model

Operational events and environmental/context events are separate domains.

### 9.1 OperationalEvent

```text
DEPART_BASE
ENTER_CORRIDOR
PASS_NODE
ARRIVE_PROJECT
DEPART_PROJECT
ENTER_RETURN
ARRIVE_BASE
```

Conceptual fields:

```ts
interface OperationalEvent {
  t: number;
  vehicleId: string;
  corridorId: string;
  event: string;
  locationId?: string;
  distanceKm?: number;
  elevationM?: number;
}
```

### 9.2 ContextEvent

Context events describe the environment around a mobilization. They do not change vehicle state in V0.

```text
HIGH_ELEVATION
STRONG_GUST
FREEZING_TEMPERATURE
PRECIPITATION_SIGNAL
LONG_TRAVEL_WINDOW
HIGH_BACKGROUND_TRAFFIC
```

```ts
interface ContextEvent {
  id: string;
  vehicleId: string;
  corridorId: string;
  segmentId: string;
  time: string;
  type: ContextSignalType;
  value?: number;
  unit?: string;
  ruleId: string;
  severity: 'INFO' | 'ATTENTION';
  evidenceRefs: string[];
}
```

`SAFE`, `DANGER`, and `CRITICAL` are intentionally excluded because they imply safety evaluation.

## 10. Environment Snapshot

V0 does not fetch weather continuously while the simulation runs. A pre-run/offline build step creates a versioned `EnvironmentSnapshot` from a modelled-weather provider. The browser consumes the artifact.

```ts
interface EnvironmentSnapshot {
  schemaVersion: string;
  id: string;
  issuedAt: string;
  dataAsOf: string;
  targetDate: string;
  timezone: 'America/Argentina/San_Juan';
  provider: string;
  modelKind: 'FORECAST' | 'HISTORICAL_REFERENCE';
  nodes: EnvironmentNode[];
  sourceState: 'READY' | 'STALE' | 'PARTIAL' | 'UNAVAILABLE';
  evidenceRefs: string[];
  limitations: string[];
}
```

### 10.1 EnvironmentNode

```ts
interface EnvironmentNode {
  id: string;
  corridorId: string;
  lat: number;
  lon: number;
  distanceKm: number;
  elevationM: number;
  hourly: EnvironmentHour[];
}
```

### 10.2 EnvironmentHour

V0 should keep only variables that support the use case:

```ts
interface EnvironmentHour {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  visibilityM?: number | null;
  cloudCoverPct?: number | null;
}
```

Provider availability does not justify adding unused variables.

## 11. Weather at Passage

The key environmental question is not simply current weather at a destination, but the modelled context when a vehicle reaches a position.

Flow:

```text
vehicle + simTime
→ distance along corridor
→ bracketing environment node(s)
→ model time step(s)
→ environment context at passage
```

Continuous variables such as temperature and wind may use simple spatial/temporal interpolation where justified. Discrete/accumulation variables such as precipitation must avoid false precision and should use the provider's model step semantics.

Missing data stays missing. No indefinite carry-forward and no synthetic weather values.

## 12. Elevation

Elevation is a separate derived evidence layer and is precomputed against the route.

```ts
interface ElevationProfile {
  source: string;
  resolution: string;
  method: string;
  samples: ElevationSample[];
  limitations: string[];
}

interface ElevationSample {
  distanceKm: number;
  elevationM: number;
}
```

A vehicle obtains elevation from its route position, not by making a provider request every animation frame.

## 13. Context Rules

Context signals are produced only through explicit scenario-display rules.

Example conceptual rule:

```ts
interface ContextRule {
  id: string;
  type: ContextSignalType;
  sourceKind: 'SCENARIO_DISPLAY_RULE';
  metric: string;
  operator: '>=' | '>' | '<=' | '<';
  threshold: number;
}
```

Every such threshold must be documented as a visualization/scenario rule, not an occupational-health, transitability, or safety threshold.

In V0:

```text
environment → context only
```

Not:

```text
environment → speed change / stop / closure
```

A later explicit `WHAT_IF` mode may simulate operational responses, but those responses must be labelled synthetic.

## 14. Provenance and Evidence Roles

Every important source is represented through a common evidence reference.

```ts
interface EvidenceRef {
  id: string;
  role:
    | 'PRIMARY'
    | 'DERIVED'
    | 'CALIBRATION'
    | 'ANALOGUE'
    | 'QUALITATIVE'
    | 'SYNTHETIC_ASSUMPTION'
    | 'METHOD_REFERENCE';
  sourceName: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceTimestamp?: string;
  method?: string;
  license?: string;
  limitations: string[];
}
```

Source-role examples:

| Source | Role | V0 use |
|---|---|---|
| IGN / DNV route data | PRIMARY | Public road geometry/reference |
| Derived DEM profile | DERIVED | Elevation along corridor |
| Modelled weather provider | PRIMARY / modelled evidence | Versioned environment snapshot |
| DNV TMDA | CALIBRATION | Historical road-intensity calibration |
| RedTulum public route/schedule information | CALIBRATION | Temporal/passenger-transport pattern reference |
| Chile PNCV | ANALOGUE | Andean road-traffic analogue |
| Peru national freight fleet dataset | ANALOGUE | Heavy road-vehicle class/payload reference |
| minehaulsim / CAOS_MINEHAUL | METHOD_REFERENCE | Determinism, contracts, event-log and provenance inspiration |
| Reddit/community reports | QUALITATIVE | Question/event taxonomy only, never numeric thresholds |
| Vehicle departures/speed profiles | SYNTHETIC_ASSUMPTION | Scenario operation |

Reddit and other anecdotal sources must never define safety thresholds or operational truth.

## 15. Background Territorial Traffic

Background traffic exists to prevent the map from implying that mining vehicles are the only traffic in the province.

Conceptual flow:

```text
public/historical traffic reference
→ calibration profile
→ deterministic synthetic civilian traffic
```

The V0 background layer is intentionally simple:

- synthetic, not observed live traffic;
- deterministic;
- lower visual salience than operational vehicles;
- calibrated/contrasted using public historical road datasets and Andean analogues;
- no microsimulation, lane-change, car-following, congestion engine, or route optimization.

The implementation order deliberately places background traffic after the primary 24-vehicle operation works correctly.

## 16. Visual Experience

### 16.1 Intro overlay

The application and Cesium scene load behind a compact editorial overlay inspired by the Rally experience. Closing the intro reveals the already-prepared map; it does not navigate or reload.

The intro must communicate:

- San Juan mining operations context;
- territory is real/sourced;
- operation is synthetic;
- climate is modelled;
- simulation is deterministic/reproducible.

Primary CTA: `START SHIFT`.

The intro must fit standard desktop viewports without scrolling and avoid long paragraphs.

### 16.2 Map-first layout

Target hierarchy:

```text
1. Cesium territory
2. compact top command HUD
3. thin operational timeline
4. context detail on demand
5. provenance/methodology at second level
```

Desktop should keep roughly 70–80% of the useful surface visually available to the map. Panels must not imprison the map inside a dashboard shell.

### 16.3 Command HUD

A compact top surface contains only high-frequency information:

- experience name;
- simulated time;
- play/pause;
- playback speed;
- active operational vehicle count;
- active corridor count;
- environment/source state.

Prefer one line on desktop. Overflow must collapse gracefully rather than clip text.

### 16.4 Timeline

The timeline runs from 06:00 to 20:00 and shows:

- current playhead;
- departures;
- arrivals;
- returns;
- a small subset of significant context events.

It remains thin and does not become a full Gantt chart in V0.

### 16.5 Vehicle panel

Selecting an operational unit reveals a compact panel containing:

- ID and vehicle type;
- active corridor;
- runtime state and direction;
- distance/progress;
- active segment;
- elevation;
- ETA;
- environment at passage time;
- up to a few active context signals;
- source state.

Desktop target width: approximately 320–380 px. The panel should scroll internally if needed rather than expand indefinitely.

### 16.6 Analytical drawer

Profile, climate, events, and sources may open in an analytical drawer or secondary surface. Width depends on content, but desktop maximum should remain around 420 px unless a chart genuinely requires more. No chart may be clipped because of an arbitrarily small container.

### 16.7 Progressive disclosure

Always visible:

- territory/map;
- active corridors;
- operational vehicles;
- time/playback;
- high-level source state.

On demand:

- vehicle detail;
- timeline details;
- environmental context;
- profile/chart.

Second level:

- full sources;
- limitations;
- methodology;
- calibration/provenance.

## 17. Cartographic Instrumentation

The map must include usable geographic references:

- north reference/compass;
- scale bar;
- coordinate readout;
- elevation readout;
- terrain/imagery attribution;
- home/reset camera control;
- standard zoom/camera controls appropriate for Cesium.

These controls should follow proven Cesium/cartographic patterns rather than custom decorative imitations. Before implementing them, audit existing Cesium/open-source mapping patterns and reuse/adapt established approaches where practical.

Suggested placement:

- north/camera controls: upper-right;
- scale: lower-left;
- coordinates/elevation: lower-right;
- attribution: lower edge, visually subdued but readable.

## 18. Responsive Behavior

### Desktop

Primary experience and acceptance target.

- map remains dominant;
- compact HUD;
- optional side panel;
- thin timeline;
- drawers constrained to useful width/height.

### Tablet

- same information hierarchy;
- narrower panels;
- more aggressive progressive disclosure.

### Mobile

Do not shrink the desktop dashboard into a miniature.

- map at top;
- simplified HUD;
- bottom-sheet vehicle/detail pattern;
- compact timeline;
- collapsible secondary information.

If a surface cannot fit safely, simplify it rather than clipping or forcing impossible density.

## 19. Motion

Motion explains state changes, not decoration.

Allowed V0 motion:

- intro exit;
- panel/drawer appearance;
- selection feedback;
- small HUD/timeline transitions.

Target UI durations: roughly 160–220 ms. Respect `prefers-reduced-motion` as a first-class behavior.

Do not animate Cesium DOM overlays decoratively, add looping glows, bouncing counters, or cinematic camera motion that impairs reading.

## 20. Error Handling and Source State

Source states:

```text
READY
STALE
PARTIAL
UNAVAILABLE
```

Secondary evidence failures degrade gracefully. Example: missing weather does not stop the movement simulation.

Structural failures stop the run before it starts. Examples:

- invalid operation spec;
- invalid active-corridor geometry;
- inconsistent segment bounds;
- missing required provenance for critical assets.

Errors should be visible and calm, not modal-heavy. Example:

```text
WEATHER · UNAVAILABLE
No modelled data available for this node/time.
```

## 21. Performance Constraints

V0 should not require unusual optimization.

Target architecture:

```text
one Cesium Viewer
one primary active CustomDataSource for the experience
no React re-render on every animation frame
no provider request per vehicle
no network request per simulation tick
no recreation of all Cesium entities every frame
```

The simulation produces snapshots; a Cesium adapter mutates the minimum necessary entity properties.

## 22. Testing Strategy

The test suite should remain focused on contractual risk rather than UI implementation details.

### Unit/domain tests

- Same spec + environment + seed produces deterministic results.
- Operational clock stays inside 06:00–20:00 and pause/resume/reset do not drift semantically.
- State transitions follow `AT_BASE → EN_ROUTE → AT_STOP/AT_PROJECT → RETURNING → DONE`.
- Vehicle position remains on the assigned corridor.
- Segment transitions occur at correct route distances.
- ETA accounts for speed profile and planned stops.
- Weather-at-passage selects/interpolates the correct node/time data.
- Missing environment values fail closed.
- Invalid or incomplete provenance fails validation where required.
- Geometry evidence class is preserved through adapters/UI contracts.
- Context-display rules emit context events but do not alter V0 vehicle movement.
- Operational runs are immutable/reproducible.

### UI smoke tests

Keep these few and high-value:

- intro closes correctly;
- `START SHIFT` starts the clock;
- play/pause/reset work;
- vehicle selection opens correct detail.

### Build verification

- TypeScript passes.
- Vite production build passes.
- Vitest suite passes.

Do not unit-test Cesium internals. Test adapters/contracts and verify the integrated scene manually/visually.

## 23. Visual QA Acceptance

A V0 release must have no known cases of:

- clipped text;
- clipped chart axes/labels;
- cards expanding beyond safe viewport bounds;
- giant panels hiding the majority of the map;
- unreadable source-state labels;
- overlapping permanent labels that make the regional map illegible;
- missing north/scale/coordinate/elevation/attribution references in the main experience.

Responsive QA must include at least representative desktop, tablet, and mobile widths.

## 24. Functional Acceptance Criteria

A first-time user should be able to understand without external explanation:

- what territory is shown;
- which mining projects are present;
- which three corridors are operationally active;
- which units are moving and in what direction;
- the current operational time;
- vehicle ETA/progress/elevation;
- the modelled environment encountered at passage time;
- whether a value is sourced, derived, modelled, calibrated, analogous, qualitative, or synthetic;
- that this is not real mine telemetry.

The full 06:00–20:00 run must be replayable and deterministic.

## 25. Implementation Sequence

The implementation plan should preserve this incremental order:

```text
01 contracts + validation
02 clock + deterministic engine
03 projects + provenance
04 first corridor
05 remaining two corridors
06 vehicle movement
07 operational run
08 Cesium regional scene
09 24-unit synthetic schedule
10 intro + HUD + timeline
11 elevation
12 environment snapshot pipeline
13 weather at passage
14 context signals
15 background traffic
16 cartographic controls
17 provenance/detail surfaces
18 responsive + clipping QA
19 final verification + README
```

Background traffic is deliberately late. The core 24-vehicle operation must work correctly before adding territorial ambient movement.

## 26. External Technical References

### FleetFlow

Reuse conceptually:

- pure deterministic movement engine;
- snapshot boundary between engine and renderer;
- operational-run immutability and provenance;
- browser UI consuming snapshots rather than owning simulation logic.

Do not create a repository/package dependency.

### Rally Stage Sim

Reuse conceptually:

- editorial intro over a loaded application;
- map-first hierarchy;
- compact command surfaces;
- progressive disclosure;
- explicit `planned ≠ simulated ≠ observed` semantics;
- restrained/reduced-motion-aware UI transitions.

Do not create a repository/package dependency.

### GeoPlatform Agua Negra

Reuse/adapt conceptually:

- Cesium Viewer + CustomDataSource pattern;
- source-state degradation;
- versioned route/profile/marker assets;
- weather nodes and provenance language;
- map/profile selection linkage;
- compact panel/drawer pattern;
- source/date/limitations surfaces;
- cartographic/terrain-oriented map-first experience.

Do not copy the entire feature or introduce GeoPlatform runtime coupling.

### minehaulsim / CAOS_MINEHAUL

Use as a method reference for:

- deterministic run semantics;
- immutable scenario/spec documents;
- separated RNG streams;
- event-log contracts;
- explicit provenance and anti-overclaim language;
- road-network segmentation.

Do not import its mine-internal DES complexity, dispatch policies, rimpull/retarder physics, shovel/dump cycle model, underground model, or planning subsystem into V0.

## 27. Future Extensions

These are intentionally not V0 commitments:

### V0.1

- refresh environment action that creates a new immutable snapshot/run;
- improved traffic calibration;
- richer profile/weather visualization.

### V0.2 / explicit WHAT_IF

- synthetic operational-response rules;
- weather-driven scenario delays/speed reductions clearly labelled `SIMULATED OPERATIONAL RESPONSE`;
- compare multiple departure windows/runs.

### Later

- import external haulage event artifacts through adapters;
- connect a mature version into GeoPlatform as an operational-intelligence module;
- calibrated company data only with explicit authorization and evidence contracts.

## 28. Definition of Done

V0 is complete only when it is simultaneously:

```text
DETERMINISTIC
REPRODUCIBLE
MAP-FIRST
SOURCE-AWARE
NO OVERCLAIM
NO CLIPPING
CARTOGRAPHICALLY LEGIBLE
RESPONSIVE ENOUGH
TESTS GREEN
TYPECHECK GREEN
BUILD GREEN
```

The final product should feel like a small mining operational-intelligence/digital-twin lab, not a vehicle-animation toy and not a fake live fleet dashboard.
