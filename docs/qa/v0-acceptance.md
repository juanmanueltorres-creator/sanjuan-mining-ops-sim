# V0 acceptance record

Date: 2026-08-30

Branch: `feat/v0-foundation`

Scope: San Juan Mining Ops Sim V0 as defined by `docs/superpowers/specs/2026-08-30-sanjuan-mining-ops-sim-design.md` and `docs/superpowers/plans/2026-08-30-sanjuan-mining-ops-sim.md`.

## Result

**PASS**, subject to the final branch HEAD re-running the complete gate below. One explicit visual-QA limitation remains documented: GitHub-hosted headless Chrome cannot initialize Cesium WebGL in this workflow, so CI validates the complete responsive UI/fallback path rather than visually validating a rendered 3D globe. The application fails closed at the Cesium boundary instead of crashing when WebGL initialization fails.

## Automated gate

The V0 acceptance gate runs, in order:

```bash
npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Current acceptance baseline on 2026-08-30:

- **19 test files**;
- **68 tests**;
- data validation covering territorial, traffic, run, environment, and environment-evidence artifacts;
- explicit provenance/overclaim audit;
- TypeScript + Vite production build;
- browser visual QA at all three approved viewport sizes.

The final merge candidate must show all five stages green on the same HEAD.

The Vite build currently reports a non-blocking bundle-size warning because Cesium is shipped in the primary client bundle. That is a performance/packaging optimization item, not a correctness failure for V0.

## Deterministic replay and provenance QA

Acceptance test: `src/qa/v0Acceptance.test.ts`.

Deterministic replay method:

1. Load the checked-in project/corridor assets, operational run, environment snapshot, environment evidence registry, and traffic calibration.
2. Build the V0 operation through the same canonical `buildV0OperationSpec()` used by the application.
3. Generate operational snapshots at:
   - 06:00 (`360` minutes),
   - 09:00 (`540`),
   - 12:00 (`720`),
   - 16:00 (`960`),
   - 20:00 (`1200`).
4. Repeat the same five evaluations independently from the same artifacts.
5. Serialize/compare the two replay sets and require exact equality.

Result: **PASS**. The checked-in V0 scenario is deterministic at all five acceptance checkpoints.

Provenance acceptance additionally requires:

- all scenario calibration refs to resolve;
- all fleet and planned-stop refs to resolve;
- all V0 context-display-rule refs to resolve;
- all environment snapshot refs to resolve through the companion environment evidence registry;
- all environment refs used by the run to appear in `OperationalRun.provenance`;
- every evidence ref emitted by context events to resolve across the appropriate operation/environment evidence registries;
- the canonical V0 scenario builder to throw if a scenario-level evidence ref is missing.

This split is intentional: operational/synthetic evidence belongs to `SanJuanOperationSpec`; provider evidence for modelled weather belongs to the versioned environment artifact. The acceptance graph resolves both without pretending they are the same evidence domain.

## Provenance defects found during pre-merge review

The review caught two real integrity issues before merge:

1. **Scenario evidence drift.**
   - Fleet/planned-stop refs used `synthetic-operating-plan-v1` and context rules used `scenario-display-rules-v1`, but the original acceptance construction did not guarantee those records existed in the same scenario provenance used by the app.
   - Fix: one canonical `buildV0OperationSpec()` now registers both `SYNTHETIC_ASSUMPTION` records, validates all scenario refs fail-closed, and is shared by production and acceptance replay.

2. **Environment refs had IDs but no structured runtime registry.**
   - `EnvironmentSnapshot` and `OperationalRun` referenced `open-meteo-forecast-20260830`, but the provider evidence record was not a separately loadable/versioned runtime artifact.
   - Fix: `public/data/environment/environment-sj-20260830.evidence.v1.json` now records provider, endpoint, retrieval time, method, and limitations. The loader validates snapshot ↔ registry ↔ run linkage fail-closed, the Sources drawer exposes that evidence, and `scripts/build-environment.mjs` emits the snapshot and registry together.

These findings are why the final acceptance count increased from the earlier 66-test checkpoint to 68 tests.

## Browser / responsive QA

Runner: production Vite preview + Chrome/Chromium through `puppeteer-core`.

Approved viewports:

| Viewport | Result |
| --- | --- |
| `1440 × 900` | PASS |
| `1024 × 768` | PASS |
| `390 × 844` | PASS |

The script verifies:

- intro card remains inside the viewport and has no horizontal clipping;
- map stage remains the primary surface;
- command HUD, map status, timeline, and cartographic instrumentation stay visible and within viewport bounds;
- no page-level horizontal overflow;
- Sources/Limitations drawer stays inside the viewport;
- drawer content uses internal vertical scrolling;
- drawer has no uncontrolled horizontal overflow;
- the mobile drawer remains constrained rather than covering the full viewport width;
- the scene exposes either provider attribution when Cesium renders or an explicit WebGL-unavailable fallback when it cannot;
- screenshots are uploaded as a CI artifact for all three accepted viewports.

### Defects discovered by browser QA

The browser gate found two issues that unit/JSDOM tests could not expose:

1. **Cesium WebGL initialization failure could blank the whole app.**
   - Root cause: checking only for `WebGLRenderingContext` does not guarantee Cesium can create a working WebGL context.
   - Fix: `new Viewer(...)` is guarded at the Cesium boundary. Initialization failure now keeps the intro/operational UI alive and exposes `3D MAP · WEBGL PREVIEW UNAVAILABLE`.

2. **Mobile Sources drawer was 374 px wide at a 390 px viewport.**
   - Acceptance limit: 370 px (`viewport - 20 px`).
   - Fix: mobile left/right drawer offsets changed to 10 px, producing the intended contained surface.

### WebGL limitation of the CI runner

GitHub-hosted headless Chrome exposes the WebGL API but fails Cesium context initialization in this workflow. Therefore CI screenshots exercise the explicit fallback path rather than a rendered 3D globe.

What CI still verifies about the map integration:

- Cesium adapter behavior is unit tested;
- persistent vehicle/background entity contracts are tested;
- one-Viewer/one-primary-`CustomDataSource` implementation builds successfully;
- cartographic formatting/control components are tested;
- provider credit is configured in the Cesium imagery provider;
- WebGL failure no longer takes down the application.

A WebGL-capable browser smoke check remains appropriate before a public/demo release when visual confirmation of the actual 3D globe, labels, terrain/picking, and provider credits is required. This limitation is not hidden or reinterpreted as a 3D-render PASS.

## Provenance and overclaim audit

Command: `npm run audit:claims`.

The audit intentionally lists every matching line in `src`, `public`, `docs`, and `README.md` for sensitive terms such as:

```text
safe | unsafe | road closed | real-time | live telemetry | operator route | verified route
```

The number of matches is not itself a pass/fail threshold and changes as explanatory documentation is added. Every final-HEAD match is reviewed as one of:

- explicit negative product boundaries such as “not live telemetry” or “no safety decision”;
- tests asserting that unsafe/closure language is absent from output;
- source limitations stating that public descriptions are not exact operator route traces;
- analytical-profile/weather warnings against navigation, engineering, safety, or transitability use;
- design/implementation-plan rules forbidding overclaim;
- README statements explaining what the product is not;
- non-operational uses of the word “safe” in UI/layout prose.

Acceptance criterion: **no reviewed match may positively assert** that a reconstructed corridor is an operator-verified route, traffic/telemetry is live, a road is open/closed/safe/unsafe, or V0 makes a safety/transitability decision.

## Source/evidence acceptance

`npm run validate:data` requires, among other invariants:

- exactly 10 project records;
- exactly Hualilán, Veladero, and Los Azules as active destinations;
- all critical territorial evidence refs resolvable;
- valid geometry evidence classes;
- contiguous corridor segment distance ranges;
- monotonically increasing route/profile samples;
- 12 route-tied environment nodes;
- a versioned environment evidence registry matching the checked-in snapshot;
- environment evidence refs resolvable to structured provider records;
- exact run ↔ environment snapshot id/date/timezone match;
- environment refs represented in run provenance;
- deterministic run seed;
- supported source/model states;
- traffic calibration coverage for 06:00–20:00 with no gaps/overlap;
- traffic evidence refs resolvable and corridor weights constrained to the three active corridors.

## Evidence boundary accepted for V0

The accepted product statement is:

> **Real territory · modelled environment · synthetic operation.**

This does not mean every line on the map is an observed/current road trace. In particular:

- project markers are sourced territorial references;
- active access corridors are explicitly reconstructed, with approximate approaches where evidence is insufficient;
- route/elevation samples are derived analytical assets;
- weather is modelled, versioned, and linked to a structured provider evidence record;
- highlighted vehicle schedules/speeds/stops/returns are synthetic;
- background traffic is synthetic, with DNV used as calibration context and northern Chile PNCV as an analogue;
- context signals are display/context rules, not operational or safety decisions.

Detailed source records: `docs/data-sources.md`.

## Final V0 acceptance

V0 satisfies the approved deterministic, reproducible, map-first, source-aware, fail-closed, no-overclaim, responsive/no-clipping contract at the level verified above once the final branch HEAD passes the complete automated gate without exceptions.
