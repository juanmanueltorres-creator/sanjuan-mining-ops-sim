# San Juan Mining Ops Sim — V0.1.1 Terrain + Road Context Design

Date: 2026-08-30
Status: Approved design
Repository: `juanmanueltorres-creator/sanjuan-mining-ops-sim`
Branch: `feat/v0.1.1-terrain-road-context`
Base: `main@27790b99827176d8a5d6d52d0b35ec9962934afc`

## 1. Purpose

V0.1 replaced Veladero's sparse schematic chords with versioned DNV/IGN/OSM-backed geometry while preserving the deterministic V0 operational model. The production WebGL smoke then exposed a separate rendering mismatch: route samples and vehicles carry analytical `elevationM`, but the Cesium scene still uses the default ellipsoidal terrain.

The result is visually misleading in high relief: the corridor and vehicles rise above a nearly flat base as the route approaches the Cordillera.

V0.1.1 fixes that rendering/context problem without changing the simulation.

Product question:

> Can the simulation read as an operation moving through real topography and a real regional road network while keeping analytical elevation, operational routing, and cartographic context explicitly separate?

Core rule:

> Terrain and road context may improve spatial reading, but they must not change operational behavior or create new routing/safety claims.

## 2. Scope

### V0.1.1 includes

- Real Cesium terrain in the WebGL scene.
- Fail-closed fallback to the existing ellipsoid when terrain configuration or loading fails.
- Visual placement of corridor geometry and vehicle markers against terrain rather than treating analytical `elevationM` as the rendered ground surface.
- Preservation of analytical `elevationM` for simulation/context semantics.
- A small, checked-in San Juan road-context artifact derived from the existing IGN road dataset used in GeoPlatform.
- Conservative road-context styling below the operational corridor.
- Explicit separation between cartographic road context and the corridor geometry that drives vehicle movement.
- Provenance and limitations for the road-context artifact.
- Tests proving operational outputs remain unchanged.
- Real-browser smoke checks at San Juan, Tudcum/Conconta context, and Veladero/high-Cordillera views.

### Explicitly out of scope

- Any change to `OperationalRun`, schedules, vehicle generation, speeds, ETA, stops, states, events, weather-at-passage, background-traffic behavior, or scenario timing.
- Any change to Veladero V2 operational distance calibration (`0 → 205 → 360 km`).
- Regenerating `route-samples.v2.json` or `profile.v1.json` from terrain.
- Engineering-grade road elevation or navigation-grade terrain claims.
- Using the IGN road-context network for routing, snapping, pathfinding, ETA, dispatch, or vehicle motion.
- Live road conditions, closures, authorization, transitability, or safety decisions.
- Replacing the audited Veladero V2 corridor with the contextual IGN network.
- Hualilán or Los Azules geometry upgrades.
- V0.2 Inline Execution / Scenario Engine work.

## 3. Existing Rendering Mismatch

`src/map/CesiumStage.tsx` currently creates a `Viewer` without a non-ellipsoidal terrain provider.

At the same time, rendering uses analytical sample elevation with small visual offsets:

```text
operational vehicles  → elevationM + 8 m
background traffic    → elevationM + 5 m
corridor line          → elevationM + 3 m
```

This is acceptable over low-relief areas but visually detaches the operation from the base surface in the Andes.

V0.1.1 treats this as a render-layer problem, not a route-data problem.

## 4. Architectural Boundary: Analytical Z vs Visual Z

V0.1.1 introduces an explicit separation.

### Analytical elevation

Source:

```text
routeSamples.elevationM
```

Used by:

- simulation snapshots;
- existing high-elevation/context semantics;
- analytical profile;
- operational evidence and regression tests.

It remains unchanged.

### Visual surface elevation

Source:

```text
Cesium terrain provider
```

Used only by:

- terrain mesh;
- rendered corridor placement;
- rendered operational vehicle placement;
- rendered background-traffic placement;
- visual project-marker placement where terrain sampling is available.

Terrain height does not feed back into the simulation engine.

Required invariant:

> Changing, losing, or failing the terrain provider must never change deterministic operational snapshots.

## 5. Terrain Provider Strategy

V0.1.1 uses Cesium World Terrain as the preferred production terrain provider through the supported CesiumJS async terrain API.

Security and deployment rules:

- use a dedicated Cesium ion token for this application;
- token scope must be public/read-only only (`assets:read` as required);
- do not use private scopes such as asset write, token management, profile access, or asset listing;
- do not use the account default token in production;
- restrict the token to the deployed application URL(s), including the GitHub Pages origin/path as appropriate;
- keep the token in deployment configuration rather than committed source;
- acknowledge that a browser-side public-scope token is observable by clients, so security comes from least privilege, URL restrictions, and asset restrictions rather than pretending it is a secret.

Runtime behavior:

```text
configured valid terrain
        ↓
Cesium terrain provider
        ↓
3D terrain scene

missing / invalid / failed terrain
        ↓
EllipsoidTerrainProvider
        ↓
existing usable map + explicit terrain-unavailable state
```

Terrain failure must not make the operational app unavailable.

## 6. Terrain-Aware Rendering

The map renderer must not continue to use analytical `elevationM + offset` as if it were terrain height when real terrain is active.

Preferred behavior:

- corridor geometry follows/clamps to terrain where Cesium supports it reliably;
- operational vehicles are positioned from their existing lon/lat and visually placed at terrain height plus a small display offset;
- background traffic follows the same visual rule;
- project markers may use terrain height when available but remain non-blocking if sampling is unavailable;
- analytical `elevationM` remains available for information surfaces but is not silently substituted for terrain height.

The implementation may use Cesium clamping/height-reference primitives or explicit terrain sampling, but the chosen mechanism must preserve the existing single-Viewer architecture and avoid per-frame network sampling.

No terrain request may be made once per animation frame or once per vehicle per tick.

## 7. Road Context Source

GeoPlatform already contains an IGN-derived road dataset at:

```text
Geo_Platform/web/public/data/san_juan_rutas.geojson
```

The source contains road classes including `Huella` and IGN provenance fields.

V0.1.1 may use this file as the authoring source for a new checked-in contextual artifact, but the public Mining Ops repository must not depend on the private GeoPlatform repository at runtime or CI time.

Target artifact:

```text
public/data/context/roads-context.v1.geojson
public/data/context/roads-context.v1.json
```

The JSON sidecar records:

- artifact id/version;
- upstream provider;
- source dataset/file identity;
- retrieval/build date;
- source/license/attribution information when verified;
- transformation method;
- bounding/corridor buffer used;
- feature count;
- geometry simplification parameters if any;
- limitations.

Fail-closed publication rule:

> If upstream licensing/attribution cannot be verified from the source metadata or an official upstream record, the road-context artifact is not committed to the public application. Terrain integration may still ship independently.

No license is guessed.

## 8. Road Context Preprocessing

The full GeoPlatform road file must not be copied wholesale merely for visual decoration.

A deterministic preprocessing script creates a small contextual network around the operational area.

Conceptual flow:

```text
GeoPlatform IGN road source
        ↓
validate source structure
        ↓
select San Juan / operational-area features
        ↓
clip to bounded regional context around active corridors
        ↓
conservative simplification only if needed
        ↓
normalize minimal display properties
        ↓
roads-context.v1.geojson + metadata
```

The derived artifact should retain only attributes required for display/provenance, for example:

```text
id
objectType / objeto
roadRef when present
jurisdiction/class when present
source = IGN
```

The preprocessing must not infer road access, mine use, or route membership from proximity.

## 9. Operational Corridor vs Context Network

These datasets have different responsibilities.

### `roads-context.v1.geojson`

Purpose:

- cartographic reference;
- visual road-network density;
- regional orientation.

It must never:

- move a vehicle;
- define ETA;
- define route distance;
- snap Veladero V2;
- become a fallback routing network at runtime.

### Veladero V2 corridor bundle

Purpose:

- canonical simulation path;
- operational distance mapping;
- segment evidence classes;
- vehicle spatial interpolation.

The V0.1 V2 provenance graph remains authoritative and unchanged.

## 10. Visual Hierarchy

Map-first rule:

```text
terrain / imagery
        ↓
IGN road context (subtle)
        ↓
operational corridors (stronger)
        ↓
vehicles / selected state
```

Road context must use lower contrast, lower width, and lower opacity than operational corridor geometry.

At regional scale it should communicate network structure; at close scale it should not compete with vehicle markers or the selected corridor.

No large permanent legend/card is added. Provenance and limitations remain progressive disclosure through the existing Sources surface or a compact equivalent.

## 11. Loading and Failure Behavior

Terrain and road context are optional visual enrichments.

### Terrain failure

- log a concise non-sensitive warning;
- retain the ellipsoid map;
- retain simulation playback;
- expose an unobtrusive `TERRAIN UNAVAILABLE`/equivalent state if needed;
- do not report terrain elevation in the cursor readout when no terrain is active.

### Road-context failure

- operational corridors still render;
- simulation playback continues;
- no retry loop that floods requests;
- source/limitations UI must not claim road context was loaded when it was not.

### WebGL failure

The existing explicit non-map operational fallback remains unchanged.

## 12. Testing Strategy

### Pure/unit tests

- terrain configuration selection: configured provider vs ellipsoid fallback;
- terrain state detection used by the cartographic readout;
- visual height-resolution policy does not mutate analytical values;
- road-context metadata validation;
- road-context property normalization;
- road-context style remains visually subordinate to operational corridor style;
- no road-context feature enters route interpolation contracts.

### Regression tests

For the fixed V0/V0.1 run, before/after V0.1.1 must remain exactly equal for:

- vehicle operational state;
- direction;
- operational `distanceKm`;
- `segmentId`;
- ETA;
- corridor state;
- event identity/order;
- environment context;
- metrics.

No operational artifact is regenerated to make tests pass.

### Build/data checks

- `npm test -- --run`;
- existing `npm run validate:data`;
- existing Veladero V2 geometry validator;
- existing claims audit;
- production build;
- responsive visual QA/fallback path;
- deterministic road-context build/validation if the artifact is included.

### Real-browser acceptance

Verify at minimum:

1. San Juan / low-relief regional view;
2. Tudcum–Conconta transition;
3. Veladero/high-Cordillera view.

Acceptance conditions:

- terrain relief is visibly present when configured;
- corridor no longer reads as a high-elevation line floating above a flat ellipsoid;
- vehicles visually stay on/near the terrain-following corridor;
- road context reads as background reference rather than an operational route;
- Veladero V2 evidence-class styling remains legible;
- Sources/limitations remain accurate;
- simulation outputs remain unchanged;
- GitHub Pages base-path behavior remains correct.

## 13. Delivery Order

Implementation should proceed in this order:

1. terrain configuration contract + fallback tests;
2. terrain bootstrap in the existing Cesium Viewer;
3. terrain-aware corridor/vehicle visual placement;
4. real-browser terrain smoke before adding road context;
5. road-context preprocessing + provenance validation;
6. road-context loader/rendering;
7. full regression/build/claims/visual QA;
8. production smoke after merge.

This ordering intentionally makes terrain independently shippable if road-context provenance/licensing fails closed.

## 14. Definition of Done

V0.1.1 is complete only when:

- real terrain works in a WebGL-capable production browser;
- ellipsoid fallback remains usable when terrain is unavailable;
- analytical elevation and simulation outputs are unchanged;
- corridor and vehicles visually integrate with terrain;
- contextual roads, if published, have verified provenance/licensing and remain non-operational;
- V0.1 Veladero provenance remains untouched;
- automated regression/build/data/claims gates pass;
- GitHub Pages deployment is smoke-tested;
- V0.2 Inline Execution remains a separate future scope.
