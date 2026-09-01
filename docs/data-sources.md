# V0.1 / V0.1.1 data sources and evidence boundaries

Date: 2026-09-01

San Juan Mining Ops Sim follows one rule throughout the data model: every value must remain distinguishable as sourced, derived, modelled, calibrated, analogue, synthetic, or visual-only context. Checked-in JSON/GeoJSON artifacts and their provenance metadata are the runtime source of truth; this document is the human-readable index.

## Evidence roles

- `PRIMARY` — published source used directly for territorial, project, provider, or geometry context.
- `DERIVED` — artifact reconstructed or interpolated from cited public anchors.
- `CALIBRATION` — real reference data used only to shape a synthetic display model.
- `ANALOGUE` — evidence from a comparable geography used as context, not transferred as an observation of San Juan.
- `QUALITATIVE` — non-numeric contextual evidence; not used as a threshold or measured value.
- `SYNTHETIC_ASSUMPTION` — scenario-only schedules, speeds, stops, weights, rules, or other authored simulation inputs.
- `METHOD_REFERENCE` — reference supporting a method rather than a territorial observation.

Geometry source records additionally use `PRIMARY`, `CORROBORATION`, and `FALLBACK` to describe their role in the physical road/access assembly.

V0.1.1 introduces a separate **visual-only context** boundary for Cesium terrain and the IGN contextual-road layer. Neither becomes evidence for routing, movement, ETA, road status, access authorization, transitability, or safety.

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
- Used physical sections include A014, RN 40, RN 149, and RN 150.
- Exact selected source feature IDs remain frozen in `sources.v2.json`.

Limitation: this is a frozen reference geometry extract, not a live road-status or navigation feed. Publication cadence is eventual and geometry may be stale relative to later road works.

### IGN / provincial-road geometry

Geometry source id: `ign-rutas-provinciales-2016-20260830`.

- Provider: Instituto Geográfico Nacional / Datos Argentina.
- Role: `PRIMARY`.
- Published acquisition transport: official IGN WFS layer `transporte:vial_provincial`.
- Catalog resource id: `903edc8b-da5b-4f3e-b555-eef41b89c3f3`.
- Frozen snapshot: `public/data/corridors/veladero/source-snapshots/ign-provincial-roads.v1.geojson`.
- Recorded license: `Otra (Abierta)`.
- Used physical sections include RP 436, RP 432, and RP 418.
- Exact selected source feature IDs remain frozen in `sources.v2.json`.

Limitation: the published provincial-road dataset is an older reference (2016 vintage in the catalog context) and may not reflect later changes. It is not a current road-status or navigation feed.

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
- Exact selected OSM way IDs remain frozen in `sources.v2.json`.
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

Measured validator values are recorded in `docs/qa/v0-1-road-geometry-acceptance.md`. The checked-in V2 measures 365.904918 km of physical chainage, with 641 geometry vertices and 1,482 operationally calibrated route samples. Maximum explicit source gap is 0.045 m and maximum derived chord is 1.566006 km.

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

## Elevation and terrain — three separate concepts

V0.1.1 intentionally prevents visual topography from silently redefining simulation data.

### 1. Analytical elevation

**Analytical elevation → checked-in profile/route samples; simulation/context semantics.**

Route elevation is carried in versioned route/profile artifacts and derived from the documented public anchors/ranges used by each corridor bundle. Profiles are analytical context, not an engineering-grade DEM survey or road survey.

Veladero V0.1 deliberately reuses `profile.v1.json`. V2 route samples interpolate that same analytical profile on the unchanged operational km axis; the release does not reinterpret the profile against measured physical chainage.

Vehicle analytical elevation is resolved from vehicle distance along versioned route samples. It is not fetched from a terrain provider on each simulation frame.

### 2. Cesium terrain

**Cesium terrain → visual topographic surface only; external render provider.**

V0.1.1 can install Cesium World Terrain when a dedicated browser token is supplied. Terrain affects only rendered placement and topographic reading. It does not regenerate profiles, change route samples, alter speeds, move the operational distance axis, modify ETA, trigger events, redefine modelled weather-at-passage, or make a navigation/safety assertion.

The viewer boots on the Cesium ellipsoid first. Missing/invalid terrain configuration keeps the application usable on that fallback. Normal PR CI intentionally runs without a terrain token to keep this fallback path continuously tested.

The Pages workflow injects `CESIUM_ION_PUBLIC_TOKEN` only at build time. Because browser-side tokens are observable after compilation, deployment security relies on least-privilege public access plus asset/URL restrictions rather than secrecy in the browser.

### 3. IGN road context

**IGN road context → checked-in cartographic reference only; never routing/movement.**

Canonical artifacts:

- `public/data/context/roads-context.v1.geojson` — selected contextual road features;
- `public/data/context/roads-context.v1.json` — provenance and limitations sidecar.

Recorded provenance:

- provider: `Instituto Geográfico Nacional de la República Argentina`;
- authoring source: `Geo_Platform/web/public/data/san_juan_rutas.geojson`;
- source commit: `a4812d053f4f381b9d3e1d5ff30abb9fed7d6772`;
- source blob SHA: `1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70`;
- official IGN layer portal: `https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG`;
- official terms URL: `https://www.ign.gob.ar/descargas/tyc1.html`;
- required attribution: `FUENTE: Instituto Geográfico Nacional de la República Argentina`.

Selection method: feature-bbox intersection around the active-corridor route-sample bounding box expanded by exactly **0.25 degrees** on every side. V0.1.1 does not simplify or alter selected source coordinates for this visual layer. The generated artifact contains **5,012 features**.

Git blob hashes of the checked-in V0.1.1 candidate artifacts:

- `roads-context.v1.geojson`: `2c7d671951fa0da456587f3d2b92b3311164073f`;
- `roads-context.v1.json`: `2eb92a4a55c182d588eb03ff3f2799a020050fb8`.

Limitations from the sidecar:

- cartographic reference only; not an operational route, access authorization, road-status or navigation dataset;
- the exact historical IGN download endpoint used when the GeoPlatform authoring file was added was not recorded; provider identity is retained in source attributes and official IGN reuse terms are cited separately.

The contextual layer is loaded independently from the operational data bundle. A 404, invalid sidecar, invalid GeoJSON, provider mismatch, count mismatch, or provenance mismatch causes the layer to fail closed without changing the operational simulation. The Sources drawer labels this material separately as `ROAD CONTEXT`; it is not merged with `ROAD GEOMETRY` provenance.

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

V0.1 and V0.1.1 do not regenerate this weather artifact against Veladero V2 physical geometry or Cesium terrain. The same immutable snapshot is intentionally reused so spatial rendering changes do not change weather-at-passage, ETA, movement, events, or other operational semantics.

The browser does not call Open-Meteo per vehicle or per simulation tick. A provider refresh should create a new versioned environment/run artifact instead of mutating an old run.

## Background road traffic

Runtime artifact: `public/data/calibration/traffic.v1.json`.

Evidence split:

- Dirección Nacional de Vialidad TMDA historical traffic — `CALIBRATION`;
- Chile Dirección de Vialidad, Plan Nacional de Censo Vial Zona Norte 2025 — `ANALOGUE`;
- V0 time bands and near-even corridor weights — `SYNTHETIC_ASSUMPTION`.

The simulator does **not** transfer an Argentine or Chilean absolute vehicle count onto the three mining corridors. Background `BG-*` vehicles are deterministic synthetic territorial context only. They do not represent live San Juan traffic and do not model lanes, congestion, signals, overtaking, closures, or traffic-control decisions.

## Synthetic operating plan and display rules

Exactly 24 highlighted units are generated from the checked-in run seed: 12 `PERSONNEL`, 6 `FIELD`, and 6 `LOGISTICS` vehicles. Departure times, assignments, planned dwell, speed profiles, return timing, and context display rules are `SYNTHETIC_ASSUMPTION` inputs.

The operating plan is not operator dispatch and is not based on live company telemetry. Display-rule thresholds are not safety, transitability, occupational-health, or operational decision thresholds.

## Runtime source boundary

Operational road/network providers are acquisition-time dependencies only. Runtime does not call DNV, IGN, UNIDE, or Overpass to construct corridor geometry or move vehicles. V2 reads frozen checked-in manifests/snapshots and generated assets.

The V0.1.1 IGN road-context layer is also checked in. Runtime fetches the local artifact from the deployed application; it does not call the IGN portal to refresh, route, snap, or infer status.

Cesium World Terrain is the exception only in the narrow sense that it is an external **visual render provider**. It remains outside the operational model and can disappear without changing the synthetic run.

## Community / qualitative material

Community discussions and Reddit-style qualitative research may inform future question taxonomies or research directions, but runtime thresholds, route geometry, speeds, weather values, and traffic counts do not use community posts as numeric calibration or authoritative evidence.

## Basemap and attribution

The Cesium scene uses OpenStreetMap tiles and keeps the provider credit visible through Cesium's credit display. The configured credit links to OpenStreetMap copyright and identifies the ODbL attribution. The public `tile.openstreetmap.org` service is a basemap dependency, not an operational data source or service-level guarantee for this product.

Separately, when Veladero V2 uses the frozen OSM high-mountain geometry source, the Sources drawer exposes that geometry source's ODbL license and `© OpenStreetMap contributors` attribution. The V0.1.1 IGN contextual layer exposes its own provider, official portal/terms links, source commit/blob and required IGN attribution string.

## Repository license vs upstream data

Repository-authored software is released under the repository's MIT License. That license does not re-license third-party source material or imply ownership of upstream datasets, maps, reports, APIs, terrain, or imagery. Source-specific terms continue to apply.
