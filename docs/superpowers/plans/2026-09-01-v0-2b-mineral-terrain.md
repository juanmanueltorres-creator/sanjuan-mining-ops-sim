# V0.2B Mineral Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make World Terrain relief visually legible and operational corridors dominant by applying a deterministic light/desaturated “Mineral Terrain” treatment to the existing OSM imagery without changing terrain, route geometry or simulation semantics.

**Architecture:** Keep Cesium World Terrain and the existing OSM raster provider. Isolate visual constants in a pure map-style module, apply them only to the Cesium `ImageryLayer` and globe substrate, and extend visual/terrain QA so the style can be reviewed independently from the operation engine.

**Tech Stack:** CesiumJS `ImageryLayer`, React/TypeScript, Vitest, Puppeteer visual QA, existing GitHub Pages terrain smoke.

**Spec:** `docs/superpowers/specs/2026-09-01-v0-2-territorial-operations-ui-design.md`

## Global Constraints

- Keep Cesium World Terrain as the terrain provider when available and preserve the existing ellipsoid fallback.
- Keep the OSM raster provider in V0.2B; no MapLibre/vector-provider migration in this PR.
- No vertical exaggeration: one metre remains one metre.
- Do not change analytical elevation, route samples, operational state, ETA, environment semantics, road context or POI data.
- Saturated colors remain owned by operational corridors, active projects and selected/attention entities.
- OSM attribution must remain visible.
- Styling must remain deterministic across reloads and must not depend on current wall-clock sunlight.
- Do not enable time-dependent globe lighting in this PR; evaluate relief through imagery hierarchy and real 3D geometry first.

---

### Task 1: Define the Mineral Imagery Style as a Testable Contract

**Files:**
- Create: `src/map/mineralTerrainStyle.ts`
- Create: `src/map/mineralTerrainStyle.test.ts`

**Interfaces:**
- Produces: `MINERAL_IMAGERY_STYLE` and `applyMineralImageryStyle(layer)`.
- Consumes: an object implementing the Cesium imagery-layer numeric fields `brightness`, `contrast`, `saturation`, `gamma`.

- [ ] **Step 1: Write the failing style test**

```ts
import { describe, expect, it } from 'vitest';
import { applyMineralImageryStyle, MINERAL_IMAGERY_STYLE } from './mineralTerrainStyle';

describe('Mineral Terrain imagery treatment', () => {
  it('uses the approved light/desaturated constants', () => {
    expect(MINERAL_IMAGERY_STYLE).toEqual({
      brightness: 0.88,
      contrast: 1.15,
      saturation: 0.18,
      gamma: 1,
    });
  });

  it('mutates only visual imagery fields', () => {
    const layer = { brightness: 1, contrast: 1, saturation: 1, gamma: 1, alpha: 0.73 };
    applyMineralImageryStyle(layer);
    expect(layer).toEqual({ ...MINERAL_IMAGERY_STYLE, alpha: 0.73 });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --run src/map/mineralTerrainStyle.test.ts
```

Expected: FAIL because `mineralTerrainStyle.ts` does not exist.

- [ ] **Step 3: Implement the pure style helper**

```ts
export const MINERAL_IMAGERY_STYLE = Object.freeze({
  brightness: 0.88,
  contrast: 1.15,
  saturation: 0.18,
  gamma: 1,
});

export interface MineralImageryLayer {
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
}

export function applyMineralImageryStyle(layer: MineralImageryLayer): void {
  Object.assign(layer, MINERAL_IMAGERY_STYLE);
}
```

The values are the initial approved treatment. Tune only by changing this constant in a reviewable commit; do not scatter magic numbers in `CesiumStage.tsx`.

- [ ] **Step 4: Run GREEN**

```bash
npm test -- --run src/map/mineralTerrainStyle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map/mineralTerrainStyle.ts src/map/mineralTerrainStyle.test.ts
git commit -m "test: define Mineral Terrain imagery treatment"
```

---

### Task 2: Apply Mineral Terrain to the Existing OSM Layer

**Files:**
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/map/CesiumStage.test.tsx` if present; otherwise create `src/map/CesiumStage.mineralTerrain.test.tsx`

**Interfaces:**
- Consumes: `applyMineralImageryStyle()`.
- Produces: a styled OSM `ImageryLayer`; no new data contract.

- [ ] **Step 1: Write the failing integration test**

Mock the Cesium imagery collection so the test proves the layer returned by `addImageryProvider()` receives the Mineral style. The assertion must be on the layer object, not on implementation text.

```ts
expect(fakeLayer.brightness).toBe(0.88);
expect(fakeLayer.contrast).toBe(1.15);
expect(fakeLayer.saturation).toBe(0.18);
expect(fakeLayer.gamma).toBe(1);
```

Also assert the `UrlTemplateImageryProvider` URL remains:

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/map/CesiumStage.mineralTerrain.test.tsx
```

Expected: FAIL because the returned imagery layer is currently ignored and remains at Cesium defaults.

- [ ] **Step 3: Apply the style in `CesiumStage`**

Change the imagery setup from fire-and-forget to:

```ts
const osmLayer = viewer.imageryLayers.addImageryProvider(
  new UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maximumLevel: 18,
    credit: new Credit(
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>',
      true,
    ),
  }),
);
applyMineralImageryStyle(osmLayer);
```

Change only the uncovered globe substrate from the current dark teal to a warm neutral stone:

```ts
viewer.scene.globe.baseColor = Color.fromCssColorString('#d3cec2');
```

Keep `viewer.scene.backgroundColor`, atmosphere, terrain install/fallback and all operational entities unchanged.

- [ ] **Step 4: Run the focused and full tests**

```bash
npm test -- --run src/map/mineralTerrainStyle.test.ts src/map/CesiumStage.mineralTerrain.test.tsx
npm test -- --run
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map/CesiumStage.tsx src/map/CesiumStage.mineralTerrain.test.tsx
git commit -m "feat: apply Mineral Terrain basemap treatment"
```

---

### Task 3: Guard Visual Hierarchy in Automated QA

**Files:**
- Modify: `scripts/visual-qa.mjs`
- Create: `src/map/visualHierarchy.test.ts`
- Modify: `src/map/roadContextStyle.test.ts` if needed

**Interfaces:**
- Produces: machine-readable hierarchy guards and screenshots for regional/corridor/close review.

- [ ] **Step 1: Add a pure hierarchy test**

```ts
import { describe, expect, it } from 'vitest';
import { routeGeometryStyle } from './routeGeometryStyle';
import { roadContextStyle } from './roadContextStyle';

it('keeps operational corridors visually stronger than road context', () => {
  const operation = routeGeometryStyle('PUBLIC_ROAD');
  const context = roadContextStyle('Ruta');
  expect(operation.width).toBeGreaterThan(context.width);
  expect(operation.alpha).toBeGreaterThan(context.alpha);
});
```

The test must not enforce a particular color; it enforces the hierarchy promised by the spec.

- [ ] **Step 2: Run RED only if the hierarchy is not already encoded**

```bash
npm test -- --run src/map/visualHierarchy.test.ts
```

If the existing styles already satisfy the contract, the new test may be GREEN immediately; in that case do not weaken operation/context styles merely to manufacture a RED. Record that this task is a characterization guard and continue.

- [ ] **Step 3: Extend visual QA with a Mineral Terrain screenshot before opening Sources**

After `START SHIFT` and core-layout checks, add:

```js
await page.screenshot({
  path: path.join(process.cwd(), 'artifacts', 'visual-qa', `${viewport.name}-mineral-terrain.png`),
  fullPage: false,
});
```

Keep the existing Sources screenshot as a separate later image so map appearance can be reviewed unobstructed.

- [ ] **Step 4: Add a desktop `VELADERO 3D` screenshot**

For `desktop-1440x900` only:

```js
await clickButtonByText(page, 'VELADERO 3D');
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.screenshot({
  path: path.join(process.cwd(), 'artifacts', 'visual-qa', 'desktop-1440x900-veladero-3d.png'),
  fullPage: false,
});
```

Tokenless CI is expected to show `ELLIPSOID FALLBACK`; this screenshot is for composition/contrast only, not a terrain-provider proof.

- [ ] **Step 5: Run visual QA**

```bash
npm run build
npm run qa:visual
```

Expected: layout assertions PASS and the new screenshots are generated at all three viewport sizes.

- [ ] **Step 6: Commit**

```bash
git add scripts/visual-qa.mjs src/map/visualHierarchy.test.ts
git commit -m "test: guard Mineral Terrain visual hierarchy"
```

---

### Task 4: Prove World Terrain Still Works With the New Style

**Files:**
- Modify only if necessary: `scripts/terrain-smoke.mjs`
- Create: `docs/qa/v0-2b-mineral-terrain-acceptance.md`

**Interfaces:**
- Consumes: production-capable build with `VITE_CESIUM_ION_TOKEN`.
- Produces: real-WebGL evidence that Mineral imagery did not alter terrain installation/fallback behavior.

- [ ] **Step 1: Ensure the terrain smoke asserts the current explicit badge**

The smoke must require:

```text
WORLD TERRAIN · 3D
```

and reject:

```text
ELLIPSOID FALLBACK
```

When a token is intentionally supplied.

- [ ] **Step 2: In the terrain-enabled smoke, click `VELADERO 3D` and capture the final screenshot**

The screenshot must be produced only after `WORLD TERRAIN · 3D` is observed and the camera reaches the oblique Veladero preset.

- [ ] **Step 3: Run the real terrain gate in an environment containing the public Cesium token**

```bash
npm run build
npm run qa:terrain
```

Expected: PASS with World Terrain READY and a rendered canvas. Never print the token.

- [ ] **Step 4: Record acceptance**

`docs/qa/v0-2b-mineral-terrain-acceptance.md` must record:

- PR/head SHA;
- Mineral style constants;
- OSM provider unchanged;
- World Terrain READY run ID/evidence;
- tokenless fallback QA still usable;
- screenshots reviewed at regional and Veladero oblique views;
- explicit statement: no route data, analytical elevation, operational outputs or environment artifacts changed.

- [ ] **Step 5: Commit**

```bash
git add scripts/terrain-smoke.mjs docs/qa/v0-2b-mineral-terrain-acceptance.md
git commit -m "docs: record Mineral Terrain acceptance"
```

### PR B Completion Gate

Run on the final PR HEAD:

```bash
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run audit:claims
npm run build
npm run qa:visual
```

Then run `npm run qa:terrain` once with the configured Cesium token. Merge only after both tokenless fallback and real World Terrain behavior are verified and screenshots confirm that the map is quieter than the current untreated OSM view while operational corridors remain dominant.
