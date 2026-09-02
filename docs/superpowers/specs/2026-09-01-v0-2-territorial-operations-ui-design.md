# V0.2 — Territorial Operations UI

**Status:** draft for user review; implementation not started  
**Date:** 2026-09-01  
**Product:** San Juan Mining Ops Sim

## 1. Product thesis

V0.2 should make the map read as **an operation happening inside a territory**, not as a street map with operational overlays.

The governing visual rule is:

> **The territory should remain legible; the operation should remain dominant; context must never silently become a decision.**

This release does not change the simulation engine, operational state machine, ETA semantics, terrain provider, route-calibration model, environment model, or evidence rules. It changes how the existing and newly added context is presented.

## 2. Why this release exists

V0.1.1 established three critical foundations:

1. Cesium World Terrain is the visual terrain source while analytical elevation remains separate.
2. IGN road context is cartographic-only and cannot drive routing or operational behavior.
3. The UI exposes evidence and terrain state explicitly.

With those foundations in place, the current interface now has enough information to become visually noisy. The OSM raster basemap competes with terrain, project markers are visually coarse, and the selected-vehicle panel is useful only after interaction. V0.2 should improve situational reading without introducing opaque automation.

## 3. Research signals

### 3.1 San Juan operational context

The product should optimize for high-mountain territorial logistics rather than generic consumer-map discovery.

Official San Juan sources show that the spatial context users may need includes:

- fuel availability and long gaps between stations;
- workshops and tyre repair;
- health, police and Gendarmería;
- known connectivity/service nodes;
- road closures and road-condition context;
- weather at key corridor nodes.

Examples:

- Agua Negra's official travel guidance warns of **230 km without fuel stations**, identifies YPF ACA Las Flores as the last safe fuel stop, recommends offline maps, and states that there is no signal in high mountain: https://aguanegra.sanjuan.gob.ar/antes-de-cruzar
- San Juan's integrated territorial/tourism map includes fuel, mechanical workshop, tyre repair, hospital/health post, police/Gendarmería, internet/Wi-Fi, telephone and cellular-signal symbols: https://contenido.sanjuan.gob.ar/media/k2/attachments/folleto-integrador.pdf
- San Juan publishes an active street-closure map: https://cortesdecalles.sanjuan.gob.ar/
- Veladero publishes road status plus weather at Veladero, Conconta and Tudcum: https://veladero.com/

These sources do **not** imply that the simulator can infer road safety, access authorization or transitability from generic POIs or weather. They justify the relevance of those categories as contextual layers.

### 3.2 Map-app failure modes to avoid

Recent community complaints around consumer navigation apps repeatedly describe:

- automatic rerouting that overrides a route explicitly chosen by the user;
- stale or incorrect road-status information;
- routing through implausible secondary streets;
- excessive labels and POIs competing with the route;
- poor offline behavior.

These reports are anecdotal community evidence, not San Juan-specific validation. Their product lesson for San Juan Ops is narrow:

> **Do not convert context into routing or recommendations without an explicit, versioned evidence contract.**

V0.2 therefore adds richer map context while keeping corridors authoritative and versioned.

## 4. Design direction: Mineral Terrain

V0.2 adopts **Mineral Terrain** as the default map language.

### 4.1 Intent

The basemap should behave like a quiet territorial substrate. Relief, drainage, major roads and place context should remain readable, while saturated color is reserved for operational information.

Visual order:

1. Cesium World Terrain
2. desaturated mineral basemap
3. subtle IGN road context
4. operational-context POIs
5. operational corridors
6. projects and vehicles
7. selection, attention and evidence UI

### 4.2 Basemap treatment

The first implementation should keep the current OSM source and tune its Cesium imagery layer instead of replacing the provider immediately.

Target treatment:

- strongly reduced saturation;
- slightly reduced brightness;
- modestly increased contrast;
- warm-neutral stone/grey overall appearance;
- water remains distinguishable but subdued;
- text and road labels remain readable at close scale but should not visually dominate at regional scale;
- terrain lighting may be enabled/tuned to improve slope and relief perception;
- no vertical exaggeration in V0.2: one metre remains one metre.

A provider swap or custom vector style is explicitly deferred until the mineral treatment is evaluated in production.

## 5. Persistent vehicle microcards

### 5.1 Purpose

Operational vehicles should be readable without requiring a click, while avoiding the clutter of full cards for every unit.

### 5.2 Card anatomy

Maximum two lines. Example:

```text
LOG-03        34m
EN ROUTE
```

Allowed persistent fields:

- short vehicle identifier;
- operational state;
- ETA or equivalent compact temporal value when meaningful.

Do not persistently show weather, elevation, full corridor name, evidence, or four-stat grids on the map.

### 5.3 Interaction

- Microcards are always associated with operational vehicles, never synthetic background traffic.
- Clicking the marker or microcard selects the vehicle.
- Selection keeps the existing detailed side-panel pattern for full information and evidence.
- A selected card may gain stronger outline/contrast but must not move or reflow the map.

### 5.4 Decluttering by scale

**Regional view**
- selected vehicles;
- attention states;
- project arrivals/departures where useful.

**Corridor view**
- all active operational vehicles;
- compact ID + state/ETA.

**Close view**
- all operational cards may show the full two-line form.

Collision handling must prefer selected/attention vehicles and project cards over ordinary vehicle labels.

## 6. Project / mine cards

### 6.1 Purpose

Projects should become stable territorial anchors rather than large Cesium labels.

### 6.2 Data discipline

The current project contract only guarantees name, location, active-operational-destination status and evidence references. V0.2 must not invent mine lifecycle states such as production, construction or exploration unless a versioned source is added later.

### 6.3 Compact card

Active operational destination example:

```text
VELADERO
3 inbound
```

Inactive project example:

```text
ALCAPARROSA
PROJECT
```

Possible values derived from the existing runtime:

- project name;
- active destination state;
- number of operational vehicles inbound / at project / returning where deterministically available.

Terrain elevation may be shown only when explicitly labelled as terrain elevation. It must not be presented as an official project elevation unless sourced separately.

### 6.4 Interaction

Project cards remain compact by default. Selection may open a future project-detail panel, but such a panel is out of scope for the first V0.2 slice unless required by implementation ergonomics.

## 7. Operational-context POIs

### 7.1 Purpose

POIs should answer a San Juan logistics question:

> **What useful infrastructure exists around this corridor or operational node?**

They are not a generic business-discovery layer.

### 7.2 Initial categories

Priority 1:

- `FUEL`
- `MECHANICAL_REPAIR`
- `TYRE_REPAIR`
- `HEALTH`
- `POLICE_GENDARMERIA`

Priority 2:

- `SUPPLIES`
- `LODGING`
- `CONNECTIVITY_NODE` only when supported by evidence

Restaurants and broad retail are intentionally not first-priority operational POIs.

### 7.3 Data architecture

Follow the successful IGN context pattern:

```text
versioned authoring source
        ↓
AOI / corridor-context selection
        ↓
normalisation + provenance
        ↓
checked-in context artifact
        ↓
optional Cesium context layer
```

Preferred first authoring source: OpenStreetMap snapshot, with explicit OSM/ODbL attribution and retrieval/version metadata.

The runtime must not depend on a live Overpass query for ordinary map navigation.

### 7.4 Behavioral boundary

POIs must never:

- modify corridor geometry;
- snap vehicles;
- change ETA;
- reroute vehicles;
- imply fuel availability in real time;
- imply that a workshop is open;
- imply safety, access authorization or transitability.

A POI card should distinguish static/source context from live status.

Example:

```text
YPF ACA · LAS FLORES
FUEL
OSM / official corroboration · context only
```

If future live/official status is incorporated, it requires its own evidence/state contract.

## 8. Route refinement dependency

Hualilán and Los Azules geometry refinement should precede any POI feature that calculates or communicates proximity to a corridor.

V0.2 must not use an approximate corridor to make a precise statement such as "workshop 2.1 km from route".

Recommended sequence:

1. Hualilán geometry refinement
2. Los Azules geometry refinement
3. Mineral Terrain visual hierarchy
4. persistent vehicle/project cards
5. operational-context POIs

Route refinement remains a separate data/evidence slice and must preserve the existing operational state-machine contract unless explicitly redesigned in a different spec.

## 9. UI hierarchy and states

### 9.1 Color ownership

Saturated colors belong primarily to operations:

- operational corridors retain their current differentiated hues;
- active projects and selected entities may use warm amber;
- background traffic remains subdued;
- IGN roads remain neutral/subtle;
- POIs use small category icons with restrained color;
- terrain/basemap remains mostly neutral.

### 9.2 Selection hierarchy

Highest visual priority:

1. selected entity
2. attention/context-event state
3. active operational corridor
4. active vehicles/projects
5. POIs
6. IGN context
7. basemap

### 9.3 Existing detailed panels

The selected-vehicle panel remains the source of detailed operational/context information in the first release. Persistent microcards complement it; they do not duplicate it.

## 10. Performance and rendering constraints

V0.2 must preserve smooth temporal playback and camera interaction.

Requirements:

- background traffic receives no HTML-style persistent labels;
- card visibility is scale-dependent;
- card collision/priority logic must be deterministic;
- POIs are filtered by AOI and zoom/scale;
- POIs should be loaded from a bounded checked-in artifact rather than an unbounded live request;
- visual additions must not mutate the simulation clock or snapshot generation;
- WebGL/terrain fallback behavior remains unchanged.

The implementation plan should benchmark representative regional, corridor and close views before choosing DOM overlays versus Cesium labels/billboards for microcards.

## 11. Accessibility and usability

- State must not be communicated by color alone.
- Compact cards require readable contrast over both light and dark terrain/imagery regions.
- Selected state requires a non-color cue such as outline, scale or shape.
- Card text must remain legible at desktop and tablet widths.
- Mobile may collapse persistent cards more aggressively to icon + selected detail.
- Existing `prefers-reduced-motion` handling remains respected.

## 12. Non-goals

V0.2 does not introduce:

- automatic routing;
- route recommendations;
- inferred road safety;
- inferred road condition from weather;
- live business availability;
- turn-by-turn navigation;
- a generic consumer POI catalogue;
- vertical terrain exaggeration;
- new mine lifecycle claims without sources;
- changes to analytical elevation or operational calibration.

## 13. Acceptance criteria

### Mineral Terrain

- Relief is visually more legible than with the current untreated OSM raster.
- At regional scale, operational corridors dominate the visual hierarchy.
- World Terrain remains the actual terrain provider when available.
- No analytical elevation or simulation output changes.

### Vehicle microcards

- Operational vehicles can be identified without selection at corridor/close scale.
- Background traffic remains visually subordinate and unlabeled.
- Selected vehicle opens/retains the detailed panel.
- Card collisions do not hide the selected entity.

### Project cards

- Active project destinations are readable as stable anchors.
- Cards contain only data supported by current contracts/sources.
- Project markers no longer require large all-caps labels to be discoverable.

### POIs

- Initial artifact contains only approved operational categories.
- Provenance and attribution are versioned.
- Layer failure cannot make the simulator unavailable.
- POIs do not change routing, ETA, vehicle state or corridor membership.
- POIs are visually suppressed at scales where they would create clutter.

### Regression

- Existing operational snapshots/events remain unchanged for the same time and scenario.
- Existing environment semantics remain unchanged.
- Existing terrain READY/fallback behavior remains unchanged.
- Sources/evidence disclosure remains accessible.

## 14. Implementation slices

This design should be executed as separate reviewable slices, not one large UI rewrite:

### Slice A — Route refinement

Hualilán and Los Azules geometry/evidence refinement.

### Slice B — Mineral Terrain

Imagery treatment, terrain lighting evaluation and visual-regression screenshots.

### Slice C — Persistent entity cards

Vehicle microcards, project cards, collision/scale rules and selected-state integration.

### Slice D — Operational POIs

Versioned POI artifact, loader, styling, provenance disclosure and zoom filtering.

Each slice requires its own RED/GREEN regression cycle and can ship independently after the prerequisite relationship above is respected.

## 15. Design references

Reference patterns, not dependencies:

- CesiumJS terrain/digital-twin ecosystem: keep terrain, cartographic context and semantic entities as separate concerns.
- MapLibre ecosystem: basemap style should remain independent from tracking/operational semantics.
- deck.gl trip/fleet visualisations: lightweight moving-object representation, selection and time playback scale better than full cards for every object.
- User-provided Fenn realtime trip reference: persistent compact identity/state near the moving object, with larger detail available on selection.

The product should borrow the interaction pattern, not copy a consumer-map visual language.

## 16. Decision record

Chosen direction: **Mineral Terrain — light/desaturated**.

Rejected as default for V0.2:

- full dark-ops basemap: strong dashboard mood but weaker terrain/context reading;
- satellite-first basemap: compelling terrain appearance but too much visual texture for continuous operational monitoring.

Dark and satellite variants may be evaluated later as optional modes, after the default hierarchy is proven.
