# San Juan Mining Ops Sim

> **Real territory · modelled environment · synthetic operation.**

A deterministic 3D browser simulation of mining mobilizations across sourced and reconstructed San Juan corridors. It combines project context, route position, elevation, time, modelled weather-at-passage, and explicit provenance in one map-first operational scene.

## What it is

San Juan Mining Ops Sim is a small open-source operational simulation lab built around a simple question:

**Where will each planned mobilization be during the day, and what territorial and modelled environmental context will it encounter when it passes?**

V0 includes:

- 10 sourced San Juan mining project markers;
- 3 active operational corridors: Hualilán, Veladero, and Los Azules;
- exactly 24 highlighted synthetic units: 12 personnel, 6 field, and 6 logistics vehicles;
- a deterministic operating day from 06:00 to 20:00 in `America/Argentina/San_Juan`;
- 60×, 120×, 300×, and 600× playback, with 300× as the default;
- versioned elevation/route samples;
- a checked-in Open-Meteo forecast snapshot with 12 route-tied environment nodes and a companion evidence registry;
- weather-at-passage context that does not change vehicle movement;
- subdued deterministic synthetic background traffic;
- north, local scale, coordinates/elevation readout, regional reset, and provider attribution;
- progressive source/limitation disclosure.

## What it is not

This project is **not**:

- live vehicle telemetry or GPS tracking;
- operator dispatch or a fleet-management system;
- a current mine-access or road-status feed;
- a navigation product;
- a safety, transitability, authorization, or road-closure decision system;
- a model of mine-internal haulage, OEM vehicle physics, fuel optimization, or production dispatch;
- a claim that reconstructed corridors are operator-verified routes.

If evidence is unavailable, V0 fails closed or labels the value unavailable instead of inventing it.

## V0 experience

The app opens at 06:00 paused. `START SHIFT` reveals the compact operational UI while the map scene remains the main surface.

Vehicle schedules are generated from the checked-in run seed. The same run, scenario, and simulation time produce the same operational snapshot. Vehicles progress through a simple external-mobilization state machine:

`AT_BASE → EN_ROUTE / AT_STOP → AT_PROJECT → RETURNING → DONE`

The environment is added after movement is derived. A weather or context signal can describe what a vehicle encounters, but V0 does not use that signal to change speed, ETA, access, or movement state.

## Data and evidence model

Every important artifact carries an evidence role or an explicit synthetic boundary:

- `PRIMARY` — published territorial/project/provider evidence;
- `DERIVED` — reconstructed/interpolated artifact;
- `CALIBRATION` — real reference used only to shape a synthetic display model;
- `ANALOGUE` — comparable external geography, not a San Juan observation;
- `QUALITATIVE` — non-numeric context;
- `SYNTHETIC_ASSUMPTION` — authored scenario inputs;
- `METHOD_REFERENCE` — method support rather than territorial observation.

Corridor geometry is explicitly classified. Hualilán, Veladero, and Los Azules are currently represented as `RECONSTRUCTED_ACCESS`, with `APPROXIMATE_APPROACH` used where the final approach is intentionally schematic.

Operational/synthetic provenance and environment/provider provenance remain separate. The canonical `buildV0OperationSpec()` registers and validates scenario evidence; the versioned environment evidence registry resolves the weather refs carried by the `EnvironmentSnapshot` and `OperationalRun`. Both paths fail closed on unresolved references.

See [`docs/data-sources.md`](docs/data-sources.md) for the complete source and limitation index.

## Architecture

```text
checked-in territorial assets
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
Cesium adapter + compact React UI
```

The simulation engine is renderer-agnostic. Cesium consumes snapshots through persistent entities; the app uses one `Viewer` and one primary `CustomDataSource` rather than recreating map entities every frame.

Runtime does not call a weather provider per vehicle or per simulation tick. `scripts/build-environment.mjs` emits the weather snapshot and its companion evidence registry together.

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
npm run audit:claims
npm run build
npm run qa:visual
```

`validate:data` verifies the checked-in territorial, traffic, run, environment, and environment-evidence artifacts. `qa:visual` runs after a production build, launches the Vite preview, and checks the approved desktop/tablet/mobile layouts in Chrome/Chromium. It requires a local Chrome/Chromium executable.

`audit:claims` lists sensitive provenance/operational language for explicit human review instead of silently suppressing matches.

The acceptance suite also replays the checked-in V0 run twice at 06:00, 09:00, 12:00, 16:00, and 20:00 and requires exact snapshot equality. It additionally requires scenario, run, environment, context-rule, and emitted-context evidence references to resolve, and tests that the canonical scenario builder rejects evidence drift.

See [`docs/qa/v0-acceptance.md`](docs/qa/v0-acceptance.md) for the recorded V0 acceptance result.

## Sources and limitations

Key source families include SEGEMAR/official Argentine territorial references, public operator project/access context where appropriate, Open-Meteo modelled weather, DNV historical TMDA calibration context, and a northern Chile road-census analogue for background-traffic research.

Important boundaries:

- project markers are territorial references, not private gates/facilities;
- reconstructed corridor geometry is not suitable for navigation or access authorization;
- elevation profiles are analytical context, not engineering surveys;
- modelled weather is not a station observation or road-condition measurement;
- background traffic is synthetic and not a live San Juan count;
- schedules, speeds, stops, returns, and display rules are synthetic scenario assumptions.

Third-party source terms continue to apply. The repository's MIT License does not re-license upstream datasets, maps, reports, imagery, or APIs.

## Roadmap

Possible next increments include:

- new immutable dated run/environment artifacts;
- stronger public-source corridor geometry where verifiable data becomes available;
- a WebGL-capable visual smoke check as part of release QA;
- richer corridor/elevation/environment inspection without increasing map obstruction;
- an adapter path for reuse of stable simulation contracts inside a larger territorial platform;
- future `WHAT_IF` scenarios that remain clearly separated from observations and operational advice.

V0 deliberately does not expand into mine-internal dispatch or real-company telemetry.

## License

Repository-authored software is released under the [MIT License](LICENSE), copyright © 2026 Juan Manuel Torres.
