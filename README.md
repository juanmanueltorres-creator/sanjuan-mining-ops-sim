# San Juan Mining Ops Sim

> **Real territory · modelled environment · synthetic operation.**

San Juan Mining Ops Sim is a deterministic 3D browser simulation for exploring planned mining mobilizations across San Juan, Argentina. It combines sourced territorial context, versioned road/access geometry, analytical elevation, time, modelled weather-at-passage and explicit provenance in one map-first operational scene.

**Current published model on `main`: V0.1.**  
**Candidate in this branch: V0.1.1 — Terrain + Road Context.**

---

## What you can explore

The simulation answers a deliberately narrow question:

> **Where will each synthetic mobilization be during the day, and what territorial and modelled environmental context will it encounter when it passes?**

It includes:

- **10 sourced mining-project markers** across San Juan;
- **3 operational corridors**: Hualilán, Veladero and Los Azules;
- **24 deterministic synthetic units**: 12 personnel, 6 field and 6 logistics vehicles;
- a simulated operating day from **06:00 to 20:00** in `America/Argentina/San_Juan`;
- 60×, 120×, 300× and 600× playback;
- route position, analytical elevation, ETA/state and project context;
- versioned modelled weather-at-passage;
- deterministic synthetic background traffic;
- evidence-aware Veladero road geometry;
- optional Cesium terrain for visual topographic relief;
- a checked-in IGN road-context layer used only as subdued cartographic reference;
- a visible Sources / Limitations surface.

The same run, scenario and simulation time produce the same operational snapshot.

```text
AT_BASE
   ↓
EN_ROUTE / AT_STOP
   ↓
AT_PROJECT
   ↓
RETURNING
   ↓
DONE
```

Weather, terrain and cartographic context are added **after movement is derived**. They describe the scene; they do not change speed, ETA, access, route assignment or vehicle state.

---

## This is a simulation, not a mine digital twin

The visual scene can look operational, so the boundary is explicit:

```text
real territory != real operation
public road reference != operator route
modelled weather != station observation
synthetic traffic != measured traffic
Cesium terrain != analytical elevation
IGN road context != routing
scenario outcome != operational advice
```

This project is **not**:

- live GPS or vehicle telemetry;
- operator dispatch or fleet management;
- current road/access status;
- navigation or route authorization;
- a safety or transitability decision system;
- mine-internal haulage or production dispatch;
- OEM vehicle physics or fuel optimization;
- evidence that a reconstructed or publicly mapped access is currently used by an operator.

If required evidence cannot be resolved, the application fails closed or labels the value unavailable instead of inventing certainty.

---

## Veladero V0.1 — evidence-aware road geometry

V0.1 upgrades Veladero from sparse V1 chords to a denser **official-first hybrid reference geometry** while preserving the existing synthetic operational model.

The operational axis remains fixed:

```text
San Juan 0 km → Tudcum 205 km → Veladero 360 km
```

The physical line is built from frozen reference geometry:

- **DNV / Datos Argentina** national-road sections;
- **IGN / Datos Argentina** provincial-road sections;
- **OpenStreetMap / Overpass** for publicly mapped high-mountain access where official vector coverage is insufficient;
- explicit derived connectors where source chains do not meet or the project anchor must be connected.

Rendered sections keep their evidence class visible:

| Class | Meaning |
| --- | --- |
| `PUBLIC_ROAD` | sourced public-road reference geometry |
| `RECONSTRUCTED_ACCESS` | reconstructed or fallback access geometry |
| `APPROXIMATE_APPROACH` | approximate connection to the project reference |

The complete Veladero corridor remains conservatively classified as `RECONSTRUCTED_ACCESS`.

The V0.1 geometry contains 641 vertices and measures 365.904918 km physically, but **physical chainage does not redefine the synthetic 360 km operational axis**. Schedule, speeds, events, ETA and operational-state semantics remain unchanged.

See [`docs/qa/v0-1-road-geometry-acceptance.md`](docs/qa/v0-1-road-geometry-acceptance.md) for geometry QA and regression evidence.

---

## V0.1.1 — terrain + road context

V0.1.1 adds spatial reading without changing the simulation contract. Three concepts remain deliberately separate:

```text
Analytical elevation → checked-in profile/route samples; simulation/context semantics.
Cesium terrain       → visual topographic surface only; external render provider.
IGN road context     → checked-in cartographic reference only; never routing/movement.
```

### Terrain

The Cesium viewer starts on the ellipsoid immediately. When a valid `VITE_CESIUM_ION_TOKEN` is available, the runtime installs Cesium World Terrain asynchronously. If the token is missing or terrain initialization fails, the scene stays usable on the ellipsoid and reports that state explicitly.

Corridors, vehicles, background traffic and project markers use terrain-relative visual placement. Their rendered height is a presentation concern only; checked-in analytical elevation remains the data used by the existing simulation/context model.

### IGN road context

The optional layer is frozen at:

- `public/data/context/roads-context.v1.geojson`;
- `public/data/context/roads-context.v1.json`.

The artifact contains **5,012 features** selected by feature-bbox intersection around the active-corridor route-sample bounding box expanded by exactly **0.25°**. Selected source coordinates are preserved rather than simplified for V0.1.1.

Provider attribution is kept explicit:

> `FUENTE: Instituto Geográfico Nacional de la República Argentina`

The layer is loaded independently from operational data. A missing or invalid road-context artifact removes only that visual layer; it must not turn the application into `Operational data unavailable`. In Cesium it is clamped to ground and rendered beneath the stronger operational corridor hierarchy.

See [`docs/data-sources.md`](docs/data-sources.md) and [`docs/qa/v0-1-1-terrain-road-context-acceptance.md`](docs/qa/v0-1-1-terrain-road-context-acceptance.md).

---

## Evidence model

Important artifacts carry an explicit evidence role instead of being presented as equally authoritative:

- `PRIMARY` — published territorial/project/provider evidence;
- `DERIVED` — reconstructed or interpolated artifact;
- `CALIBRATION` — real reference used only to shape a synthetic model;
- `ANALOGUE` — external comparable geography, not a San Juan observation;
- `QUALITATIVE` — non-numeric context;
- `SYNTHETIC_ASSUMPTION` — authored scenario inputs;
- `METHOD_REFERENCE` — methodological support rather than territorial evidence.

Operational provenance and environment/provider provenance remain separate and are validated independently. A source can support **where something is**, another can support **how a scenario is generated**, and neither automatically becomes evidence that the simulated operation actually occurred.

---

## How it works

```text
territorial/project references
        +
versioned road/elevation artifacts
        +
immutable OperationalRun
        +
modelled EnvironmentSnapshot
        +
evidence registries
        ↓
runtime validation + provenance checks
        ↓
canonical operation specification
        ↓
pure deterministic simulation engine
        ↓
OperationalSnapshot
        ↓
environment/context enrichment
        ↓
Cesium 3D scene + compact React UI
        +
optional visual terrain + IGN road context
```

The simulation engine is renderer-agnostic. Cesium is an adapter over deterministic snapshots rather than the source of operational state.

Road providers are **acquisition-time dependencies**, not runtime routing services. The browser does not call DNV, IGN or Overpass to move vehicles, and it does not request weather per vehicle or simulation tick. Cesium terrain is a runtime visual provider only.

---

## Stack

`React 19` · `TypeScript` · `CesiumJS` · `Vite` · `Zod` · `Vitest` · `Puppeteer`

The application uses a single Cesium `Viewer` and persistent entities/data sources rather than rebuilding the scene every frame.

A browser with WebGL is required for the 3D globe. If Cesium cannot initialize WebGL, the operational UI remains available and the application reports that the 3D preview is unavailable instead of crashing the whole experience.

---

## Run locally

Requires **Node.js 22+**.

```bash
npm install
npm run dev
```

Terrain is optional. To exercise Cesium World Terrain locally, expose a dedicated public/read-only Cesium ion token through the environment rather than committing it:

```bash
VITE_CESIUM_ION_TOKEN=... npm run dev
```

On PowerShell:

```powershell
$env:VITE_CESIUM_ION_TOKEN="..."
npm run dev
```

Without that variable the application intentionally uses the ellipsoid fallback. The production Pages workflow consumes the repository secret `CESIUM_ION_PUBLIC_TOKEN`. Browser-side Cesium tokens are observable after build, so the token must remain least-privilege and URL/asset restricted; the secret prevents literal source-code disclosure, not browser visibility.

Production build:

```bash
npm run build
```

---

## Verification

The repository treats checked-in data, visual-context artifacts and provenance contracts as part of the software surface.

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run validate:road-geometry -- veladero
npm run audit:claims
npm run build
npm run qa:visual
```

Normal pull-request CI intentionally runs **without** a terrain token so the ellipsoid fallback stays continuously verified. Real WebGL terrain acceptance is recorded separately in the V0.1.1 acceptance record.

The suite checks, among other things:

- territorial and corridor artifacts;
- immutable run/environment linkage;
- evidence references;
- Veladero V2 geometry continuity and provenance;
- V1 ↔ V2 behavioral equivalence at acceptance checkpoints;
- terrain runtime/fallback behavior and analytical-vs-visual height separation;
- road-context schema/provenance pairing and optional failure behavior;
- contextual-road visual hierarchy beneath the operational corridor;
- sensitive wording that could overstate safety, telemetry or route authority;
- desktop, tablet and mobile UI layouts.

`audit:claims` intentionally surfaces sensitive language for human review rather than silently hiding it.

---

## Source families

Current reference families include:

- SEGEMAR and other official Argentine territorial/project references;
- Dirección Nacional de Vialidad / Datos Argentina;
- Instituto Geográfico Nacional de la República Argentina;
- OpenStreetMap / Overpass where explicitly used as fallback reference geometry;
- Cesium World Terrain for optional visual topographic rendering;
- Open-Meteo for modelled environmental context;
- public traffic references and external analogues used only for synthetic calibration/context.

Important limitations remain visible:

- project markers are territorial references, not private gates or facilities;
- frozen public-road geometry is not a live road-status feed;
- OSM geometry is not operator verification;
- reconstructed access is not navigation-grade data;
- analytical elevation is not an engineering survey;
- Cesium terrain is not substituted into simulation semantics;
- IGN road context is cartographic reference only;
- modelled weather is not an on-road measurement;
- synthetic schedules, speeds, stops, traffic and vehicle identities do not represent a real operator.

Third-party source terms continue to apply. The repository's MIT license does not re-license upstream datasets, maps, reports, imagery or APIs.

---

## Current status

### Published on `main`

**V0.1** — deterministic external-mobilization simulation with evidence-aware Veladero road geometry.

### Candidate PR

**V0.1.1 — Terrain + Road Context** is implemented on `feat/v0.1.1-terrain-road-context` and remains unmerged.

Pre-merge automated acceptance has passed, including the tokenless fallback gate and a separate real-WebGL terrain smoke. The final GitHub Pages production-browser smoke remains a **post-merge/deploy check** and is not claimed by the branch acceptance record.

V0.2 remains out of scope for this release.

---

## Documentation

- [`docs/data-sources.md`](docs/data-sources.md) — source and limitation registry
- [`docs/qa/v0-acceptance.md`](docs/qa/v0-acceptance.md) — deterministic V0 acceptance
- [`docs/qa/v0-1-road-geometry-acceptance.md`](docs/qa/v0-1-road-geometry-acceptance.md) — V0.1 road-geometry QA
- [`docs/qa/v0-1-1-terrain-road-context-acceptance.md`](docs/qa/v0-1-1-terrain-road-context-acceptance.md) — V0.1.1 terrain/context pre-merge acceptance
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — approved design documents
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — implementation plans

---

## License

Repository-authored software is released under the [MIT License](LICENSE), copyright © 2026 Juan Manuel Torres.
