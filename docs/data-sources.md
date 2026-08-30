# V0.1 data sources and evidence boundaries

Date: 2026-08-30

San Juan Mining Ops Sim follows one rule throughout the data model: every value must remain distinguishable as sourced, derived, modelled, calibrated, analogue, or synthetic. The checked-in JSON/GeoJSON artifacts and their `evidenceRefs` are the runtime source of truth; this document is a human-readable index.

## Evidence roles

- `PRIMARY` — published source used directly for territorial, project, or provider context.
- `DERIVED` — artifact reconstructed or interpolated from cited public anchors.
- `CALIBRATION` — real reference data used only to shape a synthetic display model.
- `ANALOGUE` — evidence from a comparable geography used as context, not transferred as an observation of San Juan.
- `QUALITATIVE` — non-numeric contextual evidence; not used as a threshold or measured value.
- `SYNTHETIC_ASSUMPTION` — scenario-only schedules, speeds, stops, weights, rules, or other authored simulation inputs.
- `METHOD_REFERENCE` — reference supporting a method rather than a territorial observation.

Geometry source records additionally use `PRIMARY`, `CORROBORATION`, and `FALLBACK` to describe their role in the physical road/access assembly.

## Project locations

The registry contains ten territorial project markers: Filo del Sol, Josemaría, Veladero, Gualcamayo, El Pachón, Los Azules, Altar, Hualilán, Casposo, and Filo Sur. Only Hualilán, Veladero, and Los Azules are active destinations in the synthetic operating day.

Primary project-location evidence is drawn principally from SEGEMAR SIGAM, with CONAE, the Government of San Juan mining map, and public operator pages used where applicable for corroborating context. These markers represent project/deposit context. They are not camp, gate, private-facility, cadastral, or access-authorization coordinates.

Runtime artifact: `public/data/projects/projects.v1.json`.

## Hualilán corridor — V1

Role split:

- Challenger Gold public Hualilán project/access description — `PRIMARY`.
- Versioned corridor reconstruction — `DERIVED`.
- Analytical elevation profile — `DERIVED`.

The corridor is 120 km on its deterministic distance axis and is classified `RECONSTRUCTED_ACCESS`; the final 0.5 km is `APPROXIMATE_APPROACH`. Public descriptions constrain the route story, but the geometry is not an operator-supplied turn-by-turn trace and is not suitable for navigation, engineering, authorization, or a statement of current road condition/transitability.

Runtime bundle: `public/data/corridors/hualilan/`.

## Veladero corridor — V0.1 / V2 geometry

Veladero V0.1 keeps the existing synthetic operational model unchanged while replacing the sparse V0 positional chords with a separate, dense, versioned physical geometry.

Operational axis remains exactly:

`San Juan 0 km → Tudcum 205 km → Veladero 360 km`

The six existing operational speed/timing segments remain `0–52`, `52–140`, `140–205`, `205–260`, `260–340`, and `340–360` km. Physical geometry chainage is a separate quantity and is piecewise calibrated onto that axis.

Canonical files:

- `public/data/corridors/veladero/sources.v2.json` — source manifest, anchors, selected feature IDs, derived connectors, acquisition record, and limitations;
- `public/data/corridors/veladero/segments.v2.geojson` — physical geometry segments with evidence classes;
- `public/data/corridors/veladero/corridor.v2.geojson` — assembled corridor line;
- `public/data/corridors/veladero/route-samples.v2.json` — dense positional samples calibrated back onto the operational km axis;
- `public/data/corridors/veladero/metadata.v2.json` — V2 corridor metadata;
- `public/data/corridors/veladero/profile.v1.json` — reused analytical elevation profile.

Frozen acquisition timestamp recorded by the V2 manifest: `2026-08-30T21:11:04.861Z`.

### DNV / national-road geometry

Geometry source id: `dnv-rutas-nacionales-20260830`.

- Provider: Dirección Nacional de Vialidad / Datos Argentina.
- Role: `PRIMARY`.
- Published acquisition transport: official IGN WFS layer `transporte:vial_nacional`, with DNV/Datos Argentina catalog provenance retained in the manifest.
- Catalog resource id: `d58b91ee-c46a-4260-8d89-69438417d73b`.
- Frozen snapshot: `public/data/corridors/veladero/source-snapshots/dnv-national-roads.v1.geojson`.
- Recorded license: `Otra (Abierta)`.
- Used physical sections: A014, RN 40, RN 149, and RN 150.
- Exact selected source feature IDs are frozen in `sources.v2.json`.

Limitations: this is a frozen reference geometry extract, not a live road-status or navigation feed. Publication cadence is eventual and the geometry may be stale relative to later road works.

### IGN / provincial-road geometry

Geometry source id: `ign-rutas-provinciales-2016-20260830`.

- Provider: Instituto Geográfico Nacional / Datos Argentina.
- Role: `PRIMARY`.
- Published acquisition transport: official IGN WFS layer `transporte:vial_provincial`.
- Catalog resource id: `903edc8b-da5b-4f3e-b555-eef41b89c3f3`.
- Frozen snapshot: `public/data/corridors/veladero/source-snapshots/ign-provincial-roads.v1.geojson`.
- Recorded license: `Otra (Abierta)`.
- Used physical sections: RP 436, RP 432, and RP 418.
- Exact selected source feature IDs are frozen in `sources.v2.json`.

Limitations: the published provincial-road dataset is an older reference (2016 vintage in the catalog context) and may not reflect later changes. It is not a current road-status or navigation feed.

### UNIDE San Juan corroboration

Geometry source id: `unide-san-juan-road-context-20260830`.

- Provider: UNIDE San Juan.
- Role: `CORROBORATION`.
- Endpoint: official provincial GeoServer WMS context.
- Format: `WMS`.
- Vector feature IDs: none.

UNIDE is retained only as official provincial context in V0.1. No WMS image is converted into vector provenance, and no rendered physical geometry segment claims UNIDE as its source.

### OpenStreetMap high-mountain access fallback

Geometry source id: `osm-high-mountain-access-20260830`.

- Provider: OpenStreetMap via Overpass API.
- Role: `FALLBACK`.
- Frozen snapshot: `public/data/corridors/veladero/source-snapshots/osm-high-mountain-access.v1.geojson`.
- License: `ODbL 1.0`.
- Attribution: `© OpenStreetMap contributors`.
- Exact selected OSM way IDs are frozen in `sources.v2.json`.
- Use: publicly mapped Tudcum-to-Veladero high-mountain road/access geometry where the official road layers do not provide the complete physical chain needed by the V0.1 representation.

OSM geometry is publicly mapped fallback/completion geometry. It is not operator-supplied evidence and does not establish current road condition, closure, safety, transitability, or access authorization.

### Explicit derived connectors

Geometry source id: `veladero-derived-geometry-v2`.

Three short repository-authored geometries are declared explicitly in the manifest:

- `veladero-origin-connector-v2` — reconstructed connection from the scenario San Juan origin anchor to the selected sourced-road chain;
- `veladero-tudcum-handoff-v2` — reconstructed 42.7 m source handoff between the selected official-road endpoint and the selected OSM access chain;
- `veladero-project-approach-v2` — approximate final connection from the selected mapped access endpoint to the sourced Veladero project-location anchor.

These connectors are never labelled as `PUBLIC_ROAD`. They exist to make small documented gaps explicit rather than hiding them inside an automatic router.

### V2 evidence classes and QA

The assembled V2 geometry contains:

- 7 `PUBLIC_ROAD` segments;
- 3 `RECONSTRUCTED_ACCESS` segments;
- 1 `APPROXIMATE_APPROACH` segment.

The complete corridor still carries conservative corridor-level `RECONSTRUCTED_ACCESS` classification.

Measured validator values are recorded in `docs/qa/v0-1-road-geometry-acceptance.md`. The checked-in V2 currently measures 365.904918 km of physical chainage, with 641 geometry vertices and 1,482 operationally calibrated route samples. Maximum explicit source gap is 0.045 m and maximum derived chord is 1.566006 km.

Required build/QA anchors occur in this order: San Juan → Tudcum → Conconta → Despoblados → Veladero. Conconta and Despoblados are not runtime operational nodes and therefore do not create new passage events.

## Los Azules corridor — V1

Role split:

- Argentina.gob.ar regional road-chain description — `PRIMARY`.
- Calingasta public locality coordinate — `PRIMARY`.
- McEwen public Los Azules technical-report/access narrative — `PRIMARY`.
- McEwen public project-location/elevation context — `PRIMARY`.
- Versioned corridor reconstruction — `DERIVED`.
- Analytical elevation profile — `DERIVED`.

The deterministic distance axis is 276 km. The corridor is `RECONSTRUCTED_ACCESS`; the final 5 km is `APPROXIMATE_APPROACH`. The distance axis and intermediate geometry are simulation artifacts constrained by public context, not a surveyed/current driving route or navigation product.

Runtime bundle: `public/data/corridors/los-azules/`.

## Elevation

Route elevation is carried in the versioned route/profile artifacts and derived from the documented public anchors/ranges used by each corridor bundle. Profiles are analytical context, not an engineering-grade DEM survey or road survey.

Veladero V0.1 deliberately reuses `profile.v1.json`. V2 route samples interpolate that same analytical profile on the unchanged operational km axis; the release does not reinterpret the profile against measured physical chainage.

Vehicle elevation is resolved from vehicle distance along versioned route samples. It is not fetched from a provider on each simulation frame.

## Modelled environment

Provider: **Open-Meteo Forecast API · Best Match**.

Runtime artifacts:

- `public/data/environment/environment-sj-20260830.json` — immutable weather values and route-tied nodes;
- `public/data/environment/environment-sj-20260830.evidence.v1.json` — structured provider evidence referenced by the snapshot and run.

The checked-in snapshot:

- has `modelKind = FORECAST`;
- targets `2026-08-30` in `America/Argentina/San_Juan`;
- contains 12 route-tied environment nodes, four per active corridor;
- is immutable for the checked-in run;
- is queried by corridor position on the **operational distance axis** and passage time;
- is modelled weather, not a station observation or road-condition measurement.

**V0.1 does not regenerate this weather artifact against Veladero V2 physical geometry.** The same immutable snapshot is intentionally reused so the road-geometry release changes spatial position without changing weather-at-passage, ETA, movement, events, or other operational semantics.

The environment evidence registry records provider name, provider endpoint, retrieval time, build method, and limitations separately from the operational scenario. This keeps the architecture explicit: operational/synthetic evidence lives with `OperationSpec`, while provider evidence for modelled weather lives with the versioned environment artifact. `OperationalRun.provenance` references the weather evidence ID without duplicating the provider record into the operational spec.

The loader and acceptance tests fail closed if the snapshot references missing environment evidence, if the evidence registry belongs to another snapshot, or if the run omits the environment evidence reference from its provenance. The Sources drawer renders the structured weather evidence alongside model/source state and limitations.

The browser does not call Open-Meteo per vehicle or per simulation tick. `scripts/build-environment.mjs` writes both the snapshot and its companion evidence registry. A new provider refresh should create a new versioned environment/run artifact instead of mutating an old run.

Upstream licensing/usage rights are not asserted by this repository beyond what is explicitly documented in the source artifact. Consult the provider's current terms for redistribution or downstream use.

## Background road traffic

Runtime artifact: `public/data/calibration/traffic.v1.json`.

Evidence split:

- Dirección Nacional de Vialidad TMDA historical traffic — `CALIBRATION`.
- Chile Dirección de Vialidad, Plan Nacional de Censo Vial Zona Norte 2025 — `ANALOGUE`.
- V0 time bands and near-even corridor weights — `SYNTHETIC_ASSUMPTION`.

The simulator does **not** transfer an Argentine or Chilean absolute vehicle count onto the three mining corridors. Background `BG-*` vehicles are deterministic synthetic territorial context only. They do not represent live San Juan traffic and do not model lanes, congestion, signals, overtaking, closures, or traffic-control decisions.

## Synthetic operating plan and display rules

Exactly 24 highlighted units are generated from the checked-in run seed: 12 `PERSONNEL`, 6 `FIELD`, and 6 `LOGISTICS` vehicles. Departure times, assignments, planned dwell, speed profiles, return timing, and context display rules are `SYNTHETIC_ASSUMPTION` inputs.

Two scenario-level evidence records make that authorship explicit:

- `synthetic-operating-plan-v1` — deterministic movement/schedule assumptions;
- `scenario-display-rules-v1` — thresholds used only to surface contextual signals.

The canonical `buildV0OperationSpec()` registers these records and fails closed if any project, corridor, fleet, planned-stop, calibration, or context-rule evidence reference is missing. The same builder is used by both the application and deterministic acceptance replay so production and QA cannot silently construct different provenance graphs.

The operating plan is not operator dispatch and is not based on live company telemetry. Display-rule thresholds are not safety, transitability, occupational-health, or operational decision thresholds.

## Runtime source boundary

Road/network providers are acquisition-time dependencies only. Runtime does not call DNV, IGN, UNIDE, or Overpass for corridor geometry. V2 reads the frozen checked-in manifest/snapshots and generated assets.

The separate manual `.github/workflows/road-geometry-acquisition.yml` can reproduce a source-acquisition artifact without mutating runtime data automatically. Source selection and freezing remain an explicit audited step.

## Community / qualitative material

Community discussions and Reddit-style qualitative research may inform future question taxonomies or research directions, but runtime thresholds, route geometry, speeds, weather values, and traffic counts do not use community posts as numeric calibration or authoritative evidence.

## Basemap and attribution

The Cesium scene uses OpenStreetMap tiles and keeps the provider credit visible through Cesium's credit display. The configured credit links to OpenStreetMap copyright and identifies the ODbL attribution. The public `tile.openstreetmap.org` service is a basemap dependency, not an operational data source or service-level guarantee for this product.

Separately, when Veladero V2 uses the frozen OSM high-mountain geometry source, the Sources drawer exposes that geometry source's ODbL license and `© OpenStreetMap contributors` attribution. Unused geometry sources are not presented as if they contributed to the rendered route.

## Repository license vs upstream data

Repository-authored software is released under the repository's MIT License. That license does not re-license third-party source material or imply ownership of upstream datasets, maps, reports, APIs, or imagery. Source-specific terms continue to apply.
