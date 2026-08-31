# San Juan Mining Ops Sim

> **Real territory · modelled environment · synthetic operation.**

A deterministic 3D browser simulation of mining mobilizations across sourced and reconstructed San Juan corridors. It combines project context, route position, elevation, time, modelled weather-at-passage, and explicit provenance in one map-first operational scene.

## What it is

San Juan Mining Ops Sim is a small open-source operational simulation lab built around a simple question:

**Where will each planned mobilization be during the day, and what territorial and modelled environmental context will it encounter when it passes?**

The current V0.1 includes:

- 10 sourced San Juan mining project markers;
- 3 active operational corridors: Hualilán, Veladero, and Los Azules;
- exactly 24 highlighted synthetic units: 12 personnel, 6 field, and 6 logistics vehicles;
- a deterministic operating day from 06:00 to 20:00 in `America/Argentina/San_Juan`;
- 60×, 120×, 300×, and 600× playback, with 300× as the default;
- versioned elevation/route samples;
- **Veladero V2 official-first hybrid road/access geometry**, built from frozen DNV/IGN road extracts, publicly mapped OSM high-mountain access where needed, and explicit derived connectors;
- Hualilán and Los Azules retained on their V1 reconstructed corridors;
- a checked-in Open-Meteo forecast snapshot with 12 route-tied environment nodes and a companion evidence registry;
- weather-at-passage context that does not change vehicle movement;
- subdued deterministic synthetic background traffic;
- north, local scale, coordinates/elevation readout, regional reset, and provider attribution;
- progressive source/limitation disclosure, including the geometry datasets actually used by Veladero V2.

## What it is not

This project is **not**:

- live vehicle telemetry or GPS tracking;
- operator dispatch or a fleet-management system;
- a current mine-access or road-status feed;
- a navigation product;
- a safety, transitability, authorization, or road-closure decision system;
- a model of mine-internal haulage, OEM vehicle physics, fuel optimization, or production dispatch;
- a claim that reconstructed or publicly mapped access is an operator-verified route.

If evidence is unavailable, the application fails closed or labels the value unavailable instead of inventing it.

## V0.1 experience

The app opens at 06:00 paused. `START SHIFT` reveals the compact operational UI while the map scene remains the main surface.

Vehicle schedules are generated from the checked-in run seed. The same run, scenario, and simulation time produce the same operational snapshot. Vehicles progress through a simple external-mobilization state machine:

`AT_BASE → EN_ROUTE / AT_STOP → AT_PROJECT → RETURNING → DONE`

The environment is added after movement is derived. A weather or context signal can describe what a vehicle encounters, but V0.1 does not use that signal to change speed, ETA, access, or movement state.

### Veladero V2 geometry

V0.1 changes **physical geometry, not the operational model**.

Veladero still uses the exact synthetic operational axis:

`San Juan 0 km → Tudcum 205 km → Veladero 360 km`

The existing six operational speed/timing segments remain unchanged. Separately, the physical V2 line is assembled from versioned source geometry:

- sourced DNV / Datos Argentina national-road sections;
- sourced IGN / Datos Argentina provincial-road sections;
- publicly mapped OpenStreetMap high-mountain access as fallback/completion geometry;
- explicit short derived connectors where the source chains do not meet exactly or where the project-location anchor must be connected.

Cesium renders those physical sections by evidence class:

- `PUBLIC_ROAD` — solid;
- `RECONSTRUCTED_ACCESS` — dashed;
- `APPROXIMATE_APPROACH` — lower-opacity dotted.

The complete Veladero corridor remains conservatively classified `RECONSTRUCTED_ACCESS`. Publicly mapped high-mountain geometry is not current operator navigation, access authorization, or evidence of present road condition.

## Data and evidence model

Every important artifact carries an evidence role or an explicit synthetic boundary:

- `PRIMARY` — published territorial/project/provider evidence;
- `DERIVED` — reconstructed/interpolated artifact;
- `CALIBRATION` — real reference used only to shape a synthetic display model;
- `ANALOGUE` — comparable external geography, not a San Juan observation;
- `QUALITATIVE` — non-numeric context;
- `SYNTHETIC_ASSUMPTION` — authored scenario inputs;
- `METHOD_REFERENCE` — method support rather than territorial observation.

Corridor geometry is explicitly classified per physical section where V2 geometry exists. Hualilán and Los Azules remain V1 reconstructed corridors. Veladero V2 combines sourced public-road sections with reconstructed/access fallback and one approximate final approach while keeping the corridor-level classification conservative.

Operational/synthetic provenance and environment/provider provenance remain separate. The canonical `buildV0OperationSpec()` registers and validates scenario evidence; the versioned environment evidence registry resolves the weather refs carried by the `EnvironmentSnapshot` and `OperationalRun`. Both paths fail closed on unresolved references.

See [`docs/data-sources.md`](docs/data-sources.md) for the complete source and limitation index.

## Architecture

```text
frozen territorial + road geometry assets
        +
versioned OperationalRun
        +
versioned EnvironmentSnapshot
        +
versioned environment evidence registry
        ↓
runtime validation / provenance checks
        ↓
canonical SanJuanOperationSpec builder
        ↓
pure deterministic simulation engine
        ↓
OperationalSnapshot
        ↓
environment/context enrichment
        ↓
Cesium adapter + evidence-aware geometry renderer + compact React UI
```

The simulation engine is renderer-agnostic. Cesium consumes snapshots through persistent entities; the app uses one `Viewer` and one primary `CustomDataSource` rather than recreating map entities every frame.

Veladero road providers are **acquisition-time only**. Runtime does not call DNV, IGN, UNIDE, or Overpass. The browser also does not call a weather provider per vehicle or per simulation tick. `scripts/build-environment.mjs` emits the weather snapshot and its companion evidence registry together.

## Run locally

Requirements: Node.js 22+ and a browser with WebGL for the 3D scene.

```bash
npm install
npm run dev
```

The app also degrades explicitly if Cesium cannot initialize WebGL: the operational UI remains available and the map surface reports `3D MAP · WEBGL PREVIEW UNAVAILABLE` instead of crashing the whole application.

## Tests and data validation

```bash
npm test -- --run
npm run validate:data
npm run validate:road-geometry -- veladero
npm run audit:claims
npm run build
npm run qa:visual
```

`validate:data` verifies the checked-in territorial, traffic, run, environment, environment-evidence, and mixed V1/V2 corridor assets. For Veladero it also executes the dedicated road-geometry validator. `qa:visual` runs after a production build, launches the Vite preview, and checks the approved desktop/tablet/mobile layouts in Chrome/Chromium. It requires a local Chrome/Chromium executable.

`audit:claims` lists sensitive provenance/operational language for explicit human review instead of silently suppressing matches.

The V0 replay acceptance still checks the immutable run at 06:00, 09:00, 12:00, 16:00, and 20:00. V0.1 adds an explicit V1↔V2 Veladero regression at the same checkpoints: state, ETA, operational distance, segment IDs, events, context, and metrics must remain equivalent while spatial positions move onto the denser V2 geometry.

See:

- [`docs/qa/v0-acceptance.md`](docs/qa/v0-acceptance.md) — original V0 acceptance;
- [`docs/qa/v0-1-road-geometry-acceptance.md`](docs/qa/v0-1-road-geometry-acceptance.md) — V0.1 geometry metrics, provenance, regression, and QA record.

## Sources and limitations

Key source families include SEGEMAR/official Argentine territorial references, public operator project/access context where appropriate, Open-Meteo modelled weather, DNV historical TMDA calibration context, and a northern Chile road-census analogue for background-traffic research.

Veladero V2 additionally uses frozen road/access geometry from:

- Dirección Nacional de Vialidad / Datos Argentina national-road reference geometry;
- Instituto Geográfico Nacional / Datos Argentina provincial-road reference geometry;
- OpenStreetMap via a frozen Overpass acquisition for publicly mapped high-mountain access, with ODbL attribution;
- UNIDE San Juan WMS only as corroborating provincial context, not as vector geometry provenance.

Important boundaries:

- project markers are territorial references, not private gates/facilities;
- sourced public-road geometry is a frozen reference, not a current road-status feed;
- OSM access geometry is publicly mapped fallback geometry, not operator evidence;
- reconstructed/approximate geometry is not suitable for navigation or access authorization;
- elevation profiles are analytical context, not engineering surveys;
- the immutable 2026-08-30 modelled-weather artifact is reused against the unchanged operational distance axis and was not regenerated against V2 physical chainage;
- modelled weather is not a station observation or road-condition measurement;
- background traffic is synthetic and not a live San Juan count;
- schedules, speeds, stops, returns, and display rules are synthetic scenario assumptions.

Third-party source terms continue to apply. The repository's MIT License does not re-license upstream datasets, maps, reports, imagery, or APIs.

## Roadmap

Possible next increments include:

- a real WebGL-capable production smoke for the merged V0.1 release;
- new immutable dated run/environment artifacts;
- extending the V2 source/geometry pipeline to another corridor only when the same provenance gates can be satisfied;
- richer corridor/elevation/environment inspection without increasing map obstruction;
- client-bundle/code-splitting work around the large Cesium payload;
- an adapter path for reuse of stable simulation contracts inside a larger territorial platform;
- future `WHAT_IF` scenarios that remain clearly separated from observations and operational advice.

V0.1 deliberately does not expand into mine-internal dispatch or real-company telemetry.

## License

Repository-authored software is released under the [MIT License](LICENSE), copyright © 2026 Juan Manuel Torres.
