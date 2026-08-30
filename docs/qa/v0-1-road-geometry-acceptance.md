# V0.1 road geometry acceptance record

Date: 2026-08-30

Branch: `feat/v0.1-road-geometry`

Scope: Veladero road-geometry V0.1 as defined by `docs/superpowers/specs/2026-08-30-v0-1-road-geometry-design.md` and `docs/superpowers/plans/2026-08-30-v0-1-road-geometry.md`.

## Result

**AUTOMATED GATE PASS** on the code-complete pre-documentation HEAD `9c81cb4255b146fcefd28c78e3e329cdd0fcc3f2` in CI run **#241**.

This record does not claim a rendered-Cesium production smoke. GitHub-hosted headless Chrome ran the approved responsive layouts through the explicit WebGL fallback path. A WebGL-capable production smoke remains a post-merge release check.

## Automated gate

The same CI job ran, in order:

```bash
npm test -- --run
npm run validate:data
npm run validate:road-geometry -- veladero
npm run audit:claims
npm run build
npm run qa:visual
```

Observed results from CI #241:

- **30 test files passed**;
- **117 tests passed**;
- mixed corridor asset map validated as `hualilan=v1, veladero=v2, los-azules=v1`;
- data validation passed for 10 projects, 3 corridors, 12 environment nodes, one immutable run, traffic calibration, and 33 territorial evidence records;
- Veladero V2 geometry validation passed;
- provenance/claim audit completed with 48 matches for human review; reviewed matches are negative boundaries, limitations, tests, or documented source language rather than positive operational/safety claims;
- TypeScript + Vite production build passed;
- visual-layout QA passed at 1440×900, 1024×768, and 390×844 through the WebGL fallback path.

The Vite build still reports the existing non-blocking large-bundle warning because Cesium remains in the primary client bundle. That is a packaging/performance item, not a V0.1 geometry correctness failure.

## Quantitative geometry acceptance

Values below are the exact validator output from CI #241.

| Metric | Result |
| --- | ---: |
| Measured geometry chainage | **365.904918 km** |
| Geometry vertices | **641** |
| Route samples | **1,482** |
| Geometry segments | **11** |
| Operational start | **0 km** |
| Tudcum operational calibration | **205 km exact** |
| Tudcum geometry chainage | **200.773906075 km** |
| Operational end | **360 km exact** |
| Maximum explicit source gap | **0.045 m** |
| Maximum derived chord | **1.566006 km** |
| `PUBLIC_ROAD` segments | **7** |
| `RECONSTRUCTED_ACCESS` segments | **3** |
| `APPROXIMATE_APPROACH` segments | **1** |

Required anchor distance to assembled route:

| Anchor | Distance |
| --- | ---: |
| San Juan | **0 km** |
| Tudcum | **0.484937 km** |
| Conconta | **0.112674 km** |
| Despoblados | **0.083912 km** |
| Veladero | **0 km** |

All five anchors are in the required San Juan → Tudcum → Conconta → Despoblados → Veladero order and remain inside the configured 2 km default anchor tolerance.

## Frozen geometry provenance

Canonical manifest: `public/data/corridors/veladero/sources.v2.json`.

Acquisition timestamp recorded by the manifest: **2026-08-30T21:11:04.861Z**.

Geometry datasets actually used by the 11 physical geometry segments:

1. `dnv-rutas-nacionales-20260830`
   - provider: Dirección Nacional de Vialidad / Datos Argentina;
   - frozen snapshot: `source-snapshots/dnv-national-roads.v1.geojson`;
   - role: `PRIMARY`;
   - license recorded by the catalog: `Otra (Abierta)`;
   - used for sourced national-road sections including A014, RN 40, RN 149 and RN 150.

2. `ign-rutas-provinciales-2016-20260830`
   - provider: Instituto Geográfico Nacional / Datos Argentina;
   - frozen snapshot: `source-snapshots/ign-provincial-roads.v1.geojson`;
   - role: `PRIMARY`;
   - license recorded by the catalog: `Otra (Abierta)`;
   - published layer is an older reference and may not reflect later road changes;
   - used for sourced provincial-road sections RP 436, RP 432 and RP 418.

3. `osm-high-mountain-access-20260830`
   - provider: OpenStreetMap via Overpass API;
   - frozen snapshot: `source-snapshots/osm-high-mountain-access.v1.geojson`;
   - role: `FALLBACK`;
   - license: `ODbL 1.0`;
   - attribution: `© OpenStreetMap contributors`;
   - exact selected OSM way IDs remain frozen in `sources.v2.json`;
   - used only as publicly mapped high-mountain access geometry, not as operator evidence.

4. `veladero-derived-geometry-v2`
   - repository-authored explicit connector geometries;
   - role: `FALLBACK`;
   - three explicitly declared derived pieces: origin connector, Tudcum source handoff, and final project-location approach;
   - these are not source road features.

`unide-san-juan-road-context-20260830` is retained as official provincial `CORROBORATION` through WMS context only. It is not converted into vector provenance and is not presented as a rendered physical source segment.

## Operational compatibility

Acceptance test: `src/qa/v01RoadGeometryAcceptance.test.ts`.

The test loads Veladero V1 explicitly and Veladero V2 through the production default loader, then compares deterministic snapshots at:

- 06:00 (`360` minutes),
- 09:00 (`540`),
- 12:00 (`720`),
- 16:00 (`960`),
- 20:00 (`1200`).

V1 and V2 must remain exactly equal for operational state, direction, operational `distanceKm`, `segmentId`, ETA, corridor state, operational events, context-event identity, environment context, and metrics. The test also requires Veladero V2 positions to differ spatially from V1, proving that the new geometry is actually being used.

One continuous spatial value is handled separately: `HIGH_ELEVATION` event values may differ by at most **0.001 m** because V2 interpolates the same V1 analytical elevation profile through a denser route-sample mesh. Event IDs and every categorical/operational field remain exact.

Result in CI #241: **PASS**.

During RED→GREEN work this regression caught a real compatibility issue: historical V1 `segmentId` semantics were encoded by the next V1 route sample, including the intermediate km 300 sample. The V2 builder now consumes `route-samples.v1.json` explicitly as the compatibility source instead of reconstructing those labels from metadata boundaries.

## Rendering and provenance UI

Automated tests require:

- Veladero V2 to render one line per physical `geometrySegment`;
- V1 corridors to retain their single route-sample fallback polyline;
- `PUBLIC_ROAD` to use a solid visual pattern;
- `RECONSTRUCTED_ACCESS` to use a dashed pattern;
- `APPROXIMATE_APPROACH` to use a lower-opacity dotted pattern;
- vehicle and background positions to continue resolving from operational route samples;
- the Sources drawer to list only geometry datasets referenced by rendered V2 segments;
- OSM attribution/licensing to appear when OSM geometry is used and not be fabricated when it is not used.

The corridor-level Veladero classification remains conservatively `RECONSTRUCTED_ACCESS` even though individual public-road sections have sourced `PUBLIC_ROAD` geometry.

## Environment reuse boundary

The immutable `public/data/environment/environment-sj-20260830.json` artifact is reused unchanged in V0.1. It is still queried by corridor + **operational distance** + passage time. It was not regenerated against the new physical chainage.

This is deliberate: V0.1 changes positional geometry while preserving the checked-in run and all operational/weather-at-passage semantics.

## Claims review

The claims audit is intentionally a review list rather than a suppression filter. The CI #241 run produced 48 matches. Reviewed matches fall into these acceptable categories:

- explicit negative product boundaries such as “not operator dispatch” or “not a safety recommendation”;
- source limitations saying a public description/snapshot is not live navigation, access authorization, closure, or current road status;
- tests requiring unsafe/closure language to remain absent;
- design/plan text documenting prohibited claims.

No reviewed positive claim states that Veladero V2 is operator-verified navigation, that mine access is current/live, that a road is open/closed/safe/unsafe, or that modelled weather/elevation constitutes navigation or safety data.

## Remaining release check

After explicit approval and merge, GitHub Pages must be checked in a real WebGL-capable browser. Required smoke items:

- no `Operational data unavailable` message;
- Veladero follows the curved V2 road/access geometry instead of the V0 giant chords;
- highlighted synthetic units still move and return;
- Veladero units remain on the V2 spatial line;
- Sources exposes geometry provenance and limitations;
- desktop/mobile UI remains unclipped and map-dominant;
- required OSM attribution remains visible.

That production smoke is intentionally **not** claimed by this pre-merge acceptance record.
