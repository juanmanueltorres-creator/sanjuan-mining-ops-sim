# V0 data sources and evidence boundaries

Date: 2026-08-30

San Juan Mining Ops Sim follows one rule throughout the V0 data model: every value must remain distinguishable as sourced, derived, modelled, calibrated, analogue, or synthetic. The checked-in JSON/GeoJSON artifacts and their `evidenceRefs` are the runtime source of truth; this document is a human-readable index.

## Evidence roles

- `PRIMARY` — published source used directly for territorial or project context.
- `DERIVED` — artifact reconstructed or interpolated from cited public anchors.
- `CALIBRATION` — real reference data used only to shape a synthetic display model.
- `ANALOGUE` — evidence from a comparable geography used as context, not transferred as an observation of San Juan.
- `QUALITATIVE` — non-numeric contextual evidence; not used as a threshold or measured value.
- `SYNTHETIC_ASSUMPTION` — scenario-only schedules, speeds, stops, weights, rules, or other authored simulation inputs.
- `METHOD_REFERENCE` — reference supporting a method rather than a territorial observation.

## Project locations

The V0 registry contains ten territorial project markers: Filo del Sol, Josemaría, Veladero, Gualcamayo, El Pachón, Los Azules, Altar, Hualilán, Casposo, and Filo Sur. Only Hualilán, Veladero, and Los Azules are active destinations in the synthetic operating day.

Primary project-location evidence is drawn principally from SEGEMAR SIGAM, with CONAE, the Government of San Juan mining map, and public operator pages used where applicable for corroborating context. These markers represent project/deposit context. They are not camp, gate, private-facility, cadastral, or access-authorization coordinates.

Runtime artifact: `public/data/projects/projects.v1.json`.

## Hualilán corridor

Role split:

- Challenger Gold public Hualilán project/access description — `PRIMARY`.
- Versioned corridor reconstruction — `DERIVED`.
- Analytical elevation profile — `DERIVED`.

The V0 corridor is 120 km on its deterministic distance axis and is classified `RECONSTRUCTED_ACCESS`; the final 0.5 km is `APPROXIMATE_APPROACH`. Public descriptions constrain the route story, but the geometry is not an operator-supplied turn-by-turn trace and is not suitable for navigation, engineering, authorization, or a statement of current road condition/transitability.

Runtime bundle: `public/data/corridors/hualilan/`.

## Veladero corridor

Role split:

- Barrick public technical-report access narrative — `PRIMARY`.
- Barrick public operation/elevation context — `PRIMARY`.
- Tudcum public locality coordinate — `PRIMARY`.
- Versioned corridor reconstruction — `DERIVED`.
- Analytical elevation profile — `DERIVED`.

The V0 distance axis is 360 km. The corridor is `RECONSTRUCTED_ACCESS`; unsupported intermediate high-mountain positions are schematic between public anchors. No current road condition, access authorization, closure, or transitability is inferred.

Runtime bundle: `public/data/corridors/veladero/`.

## Los Azules corridor

Role split:

- Argentina.gob.ar regional road-chain description — `PRIMARY`.
- Calingasta public locality coordinate — `PRIMARY`.
- McEwen public Los Azules technical-report/access narrative — `PRIMARY`.
- McEwen public project-location/elevation context — `PRIMARY`.
- Versioned corridor reconstruction — `DERIVED`.
- Analytical elevation profile — `DERIVED`.

The V0 deterministic distance axis is 276 km. The corridor is `RECONSTRUCTED_ACCESS`; the final 5 km is `APPROXIMATE_APPROACH`. The distance axis and intermediate geometry are simulation artifacts constrained by public context, not a surveyed/current driving route or navigation product.

Runtime bundle: `public/data/corridors/los-azules/`.

## Elevation

Route elevation is carried in the versioned route/profile artifacts and derived from the documented public anchors/ranges used by each corridor bundle. V0 profiles are analytical context, not an engineering-grade DEM survey or road survey.

Vehicle elevation is resolved from vehicle distance along those versioned route samples. It is not fetched from a provider on each simulation frame.

## Modelled environment

Provider: **Open-Meteo Forecast API · Best Match**.

Runtime artifact: `public/data/environment/environment-sj-20260830.json`.

The checked-in V0 snapshot:

- has `modelKind = FORECAST`;
- targets `2026-08-30` in `America/Argentina/San_Juan`;
- contains 12 route-tied environment nodes, four per active corridor;
- is immutable for the checked-in run;
- is queried by corridor position and passage time;
- is modelled weather, not a station observation or road-condition measurement.

The browser does not call Open-Meteo per vehicle or per simulation tick. A new provider refresh should create a new versioned environment/run artifact instead of mutating an old run.

Upstream licensing/usage rights are not asserted by this repository beyond what is explicitly documented in the source artifact. Consult the provider's current terms for redistribution or downstream use.

## Background road traffic

Runtime artifact: `public/data/calibration/traffic.v1.json`.

Evidence split:

- Dirección Nacional de Vialidad TMDA historical traffic — `CALIBRATION`.
- Chile Dirección de Vialidad, Plan Nacional de Censo Vial Zona Norte 2025 — `ANALOGUE`.
- V0 time bands and near-even corridor weights — `SYNTHETIC_ASSUMPTION`.

The simulator does **not** transfer an Argentine or Chilean absolute vehicle count onto the three mining corridors. Background `BG-*` vehicles are deterministic synthetic territorial context only. They do not represent live San Juan traffic and do not model lanes, congestion, signals, overtaking, closures, or traffic-control decisions.

## Synthetic operating plan

Exactly 24 highlighted units are generated from the checked-in run seed: 12 `PERSONNEL`, 6 `FIELD`, and 6 `LOGISTICS` vehicles. Departure times, assignments, planned dwell, speed profiles, return timing, and context display rules are `SYNTHETIC_ASSUMPTION` inputs.

The operating plan is not operator dispatch and is not based on live company telemetry.

## Community / qualitative material

Community discussions and Reddit-style qualitative research may inform future question taxonomies or research directions, but V0 runtime thresholds, route geometry, speeds, weather values, and traffic counts do not use community posts as numeric calibration or authoritative evidence.

## Basemap and attribution

The Cesium V0 scene uses OpenStreetMap tiles and keeps the provider credit visible through Cesium's credit display. The configured credit links to OpenStreetMap copyright and identifies the ODbL attribution. The public `tile.openstreetmap.org` service is a basemap dependency, not an operational data source or service-level guarantee for this product.

## Repository license vs upstream data

Repository-authored software is released under the repository's MIT License. That license does not re-license third-party source material or imply ownership of upstream datasets, maps, reports, APIs, or imagery. Source-specific terms continue to apply.
