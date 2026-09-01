# V0.1.1 terrain + road context acceptance record

Date: 2026-09-01

Branch: `feat/v0.1.1-terrain-road-context`

Scope: V0.1.1 terrain + contextual roads as defined by:

- `docs/superpowers/specs/2026-08-30-v0-1-1-terrain-road-context-design.md`;
- `docs/superpowers/plans/2026-08-30-v0-1-1-terrain-road-context.md`.

## Result

**PRE-MERGE AUTOMATED GATE PASS** on implementation HEAD `7bcd6941bd79960b29da234d2916654067f9e17e` in CI run **#290** (`33549838656`).

**REAL WEBGL TERRAIN GATE PASS** on implementation HEAD `bd7f684867395363fe834196643a48053557aff1` in CI run **#289** (`33549221521`).

**POST-MERGE GITHUB PAGES PRODUCTION SMOKE: PENDING.**

This record intentionally separates those claims. The branch has automated and virtual-display WebGL evidence, but it has not been merged/deployed yet, so it does not claim the final production-browser smoke required after deployment.

## Release invariant

> Terrain and road context may improve spatial reading, but they must not change operational behavior or create new routing/safety claims.

V0.1.1 therefore keeps three concepts separate:

```text
Analytical elevation → checked-in profile/route samples; simulation/context semantics.
Cesium terrain       → visual topographic surface only; external render provider.
IGN road context     → checked-in cartographic reference only; never routing/movement.
```

## Tokenless automated gate — CI #290

The finalized PR workflow intentionally runs without a Cesium terrain token. The same CI job executed:

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run validate:road-geometry -- veladero
npm run audit:claims
npm run build
npm run qa:visual
```

Observed results from CI #290:

- **40 test files passed**;
- **166 tests passed**;
- data validation passed for 10 projects, 3 corridors, 12 environment nodes, one environment evidence record, one immutable run, traffic calibration `traffic-calibration-v1`, and 33 territorial evidence records;
- mixed corridor asset map remained `hualilan=v1, veladero=v2, los-azules=v1`;
- road-context validator reported `Road context validated: 5012 feature(s).`;
- Veladero V2 geometry validation passed with the existing V0.1 metrics unchanged;
- `src/qa/v01RoadGeometryAcceptance.test.ts` passed;
- claim audit completed with **60 matching lines** for human review;
- TypeScript + Vite production build passed **without `VITE_CESIUM_ION_TOKEN`**;
- responsive Visual QA passed at 1440×900, 1024×768, and 390×844 through the explicit WebGL fallback path.

The build still reports the existing non-blocking large Cesium bundle warning. That remains a packaging/performance concern, not an acceptance failure for this release.

## Terrain runtime and fallback acceptance

Automated terrain-specific coverage includes:

- `src/map/terrainRuntime.test.ts` — **4 tests** covering token normalization, world-terrain provider installation, ellipsoid fallback, failure handling, and teardown/abort behavior;
- `src/map/terrainPlacement.test.ts` — fixed visual offsets for operational vehicles, background traffic, active projects, and inactive projects;
- `src/ui/MapInstrumentation.test.tsx` — explicit `TERRAIN 3D` vs `TERRAIN ELLIPSOID` presentation;
- existing adapter/domain tests continue to prove analytical elevation is carried through the operational mapping contract independently of the visual terrain placement policy.

Normal PR CI deliberately excludes the terrain secret. This keeps the no-token ellipsoid path as the default automated release gate.

## Real WebGL terrain smoke — CI #289

CI #289 ran the dedicated terrain smoke through Chrome in headed Xvfb mode with SwiftShader WebGL and a valid dedicated Cesium ion token.

Observed final state:

```json
{
  "terrain3d": true,
  "ellipsoid": false,
  "fallbackVisible": false,
  "canvas": {
    "width": 1440,
    "height": 900,
    "renderer": "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"
  }
}
```

The smoke reached `TERRAIN 3D`, retained the Cesium canvas, and produced regional plus high-Andes close-up screenshots. Artifact inspection showed visible oblique Cordillera relief around Veladero with project/vehicle markers against the terrain surface.

The only recorded smoke diagnostic was a non-operational `favicon.ico` 404.

### WebGL limitation

This is genuine WebGL renderer evidence, but it is still an automated virtual-display environment using Xvfb + SwiftShader rather than a human-operated physical-GPU production browser. The GitHub Pages deployment smoke therefore remains explicitly pending until after merge/deploy.

## IGN road-context artifact

Canonical files:

- `public/data/context/roads-context.v1.geojson`;
- `public/data/context/roads-context.v1.json`.

Observed/recorded values:

| Property | Value |
| --- | --- |
| Schema | `sanjuan.road-context/v1` |
| Provider | `Instituto Geográfico Nacional de la República Argentina` |
| Feature count | **5,012** |
| Context padding | **0.25°** |
| Selection method | feature-bbox intersection around active-corridor route-sample bbox + 0.25° |
| GeoJSON Git blob SHA | `2c7d671951fa0da456587f3d2b92b3311164073f` |
| Metadata Git blob SHA | `2eb92a4a55c182d588eb03ff3f2799a020050fb8` |

Authoring provenance frozen in the sidecar:

- authoring file: `Geo_Platform/web/public/data/san_juan_rutas.geojson`;
- source commit: `a4812d053f4f381b9d3e1d5ff30abb9fed7d6772`;
- source blob SHA: `1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70`;
- official IGN portal: `https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG`;
- official terms URL: `https://www.ign.gob.ar/descargas/tyc1.html`;
- required attribution: `FUENTE: Instituto Geográfico Nacional de la República Argentina`.

The public artifact transfer was verified byte-for-byte through identical Git blob SHAs before rendering integration.

### Provenance limitation retained, not guessed away

The sidecar explicitly records that the exact historical IGN download endpoint used when the private GeoPlatform authoring file was originally added was **not recorded**. V0.1.1 therefore retains provider identity from source attributes and cites current official IGN portal/terms separately; it does not fabricate an exact historical acquisition URL.

## Road-context loader and failure boundary

`src/data/loadRoadContext.test.ts` contains **13 tests** covering the metadata/GeoJSON pair and fail-closed validation. Integration tests additionally require:

- the contextual layer to be optional;
- a contextual-layer failure to leave required operational data available;
- `Operational data unavailable` not to be triggered by an IGN-context failure;
- `ROAD CONTEXT` disclosure to appear only when validated context is loaded;
- provider, attribution, official source/terms links, source commit/blob, and limitations to remain visible in Sources.

The road context does not enter `loadStaticOperationData()` and is not an input to `OperationSpec`, the movement engine, route math, ETA, events, environment lookup, or background-traffic generation.

## Rendering hierarchy

V0.1.1 keeps the visual stack explicit:

```text
terrain / imagery
    ↓
subdued IGN road context
    ↓
stronger operational corridor
    ↓
vehicles / selection / project emphasis
```

The contextual-road style is clamped to terrain at `zIndex: 0`; the operational corridor remains clamped at `zIndex: 10` and retains its V0.1 evidence-class patterns (`PUBLIC_ROAD`, `RECONSTRUCTED_ACCESS`, `APPROXIMATE_APPROACH`).

CI #289 loaded the full **5,012-feature** context artifact during the WebGL terrain smoke without breaking the scene. Inspection of the generated screenshots confirmed the contextual network remained visually subordinate to the operational corridor.

## V0.1 operational compatibility

Acceptance test: `src/qa/v01RoadGeometryAcceptance.test.ts`.

Result in CI #290: **PASS**.

V0.1.1 does not edit the simulation engine, route math, V2 calibration, route samples, analytical profile, immutable run, environment snapshot, or traffic calibration merely to support terrain/context rendering.

A direct compare from `main` (`b54344495f1ef0c84366b86b565b8c97cc86cacb`) to the tested implementation HEAD (`7bcd6941bd79960b29da234d2916654067f9e17e`) showed **no changed files** under:

```text
public/data/corridors/
public/data/runs/
public/data/environment/
public/data/calibration/
```

The only new runtime data family is the separate `public/data/context/` artifact.

Therefore the V0/V0.1 operational artifacts remain unchanged by V0.1.1 at this acceptance gate.

## Claims review

CI #290 produced 60 claim-audit matches. Reviewed categories remain negative boundaries, source limitations, tests that prohibit stronger claims, or design/plan language documenting prohibited claims.

No positive V0.1.1 claim is introduced that:

- terrain establishes road safety or transitability;
- IGN context is a current routing/navigation feed;
- contextual-road proximity proves route membership or access authorization;
- a reconstructed/publicly mapped line is operator-verified;
- modelled weather or analytical elevation becomes a live operational measurement.

## Remaining release check — post-merge only

After explicit approval and merge, the deployed GitHub Pages build must be checked in a real browser for:

- no `Operational data unavailable` message;
- terrain visible in the Cordillera;
- corridor and vehicles visually attached to terrain;
- IGN roads subdued behind the operational corridor;
- Veladero evidence-class line styling still readable;
- Sources clearly distinguishing `ROAD GEOMETRY` from `ROAD CONTEXT`;
- OSM and IGN attribution/limitations remaining accurate;
- playback and vehicle selection still working;
- GitHub Pages base path producing no required data/asset 404s.

Until that deployment exists and is observed, this item remains **PENDING** rather than being inferred from CI.
