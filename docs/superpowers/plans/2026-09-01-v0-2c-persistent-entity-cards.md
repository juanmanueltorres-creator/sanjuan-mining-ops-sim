# V0.2C Persistent Entity Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact persistent cards for operational vehicles and projects so users can read identity/state without clicking, while preserving the existing detailed vehicle panel and avoiding map clutter.

**Architecture:** Use a React DOM overlay above the Cesium canvas because the active set is bounded (24 operational vehicles + 10 projects maximum) and the approved card design needs two-line layout, rounded backgrounds and deterministic collision priority. Cesium remains responsible for geographic placement; on each rendered frame the map stage projects entity coordinates to screen space, then a pure layout module decides which cards are visible. Background traffic never enters the card pipeline.

**Tech Stack:** React 19, TypeScript, CesiumJS screen projection, Vitest/Testing Library, CSS, Puppeteer visual QA.

**Spec:** `docs/superpowers/specs/2026-09-01-v0-2-territorial-operations-ui-design.md`

## Global Constraints

- Persistent vehicle cards use only short ID, operational state and compact ETA/temporal value.
- Do not persistently show weather, elevation, evidence, full corridor name or multi-stat grids.
- Synthetic background traffic receives no persistent cards.
- Selected vehicle still uses the existing `VehiclePanel` for detail.
- Project cards may show only data derivable from current contracts/runtime; no invented mine lifecycle states.
- Selected state must use a non-color cue.
- State must not be communicated by color alone.
- Cards are scale-dependent and collision handling is deterministic.
- Priority order: selected entity > attention state > active project > ordinary active vehicle > inactive project.
- Card rendering must not mutate simulation clock, snapshots, route geometry, ETA or terrain behavior.
- Mobile may suppress cards more aggressively than desktop/tablet.

---

### Task 1: Build Pure Vehicle/Project Card Models

**Files:**
- Create: `src/map/entityCardModel.ts`
- Create: `src/map/entityCardModel.test.ts`

**Interfaces:**

```ts
export type MapScaleBand = 'REGIONAL' | 'CORRIDOR' | 'CLOSE';
export type EntityCardKind = 'VEHICLE' | 'PROJECT';

export interface EntityCardModel {
  id: string;
  kind: EntityCardKind;
  lon: number;
  lat: number;
  primary: string;
  secondary: string;
  trailing: string | null;
  priority: number;
  selected: boolean;
  attention: boolean;
  activeProject: boolean;
}

export function classifyMapScale(cameraHeightM: number): MapScaleBand;
export function buildEntityCardModels(input: {
  data: StaticOperationData;
  snapshot: OperationalSnapshot;
  selectedVehicleId: string | null;
  scale: MapScaleBand;
}): EntityCardModel[];
```

- [ ] **Step 1: Write failing scale-band tests**

```ts
expect(classifyMapScale(340_000)).toBe('REGIONAL');
expect(classifyMapScale(100_000)).toBe('CORRIDOR');
expect(classifyMapScale(38_000)).toBe('CLOSE');
```

Use exact thresholds:

```ts
REGIONAL >= 180_000 m
CORRIDOR >= 50_000 m and < 180_000 m
CLOSE < 50_000 m
```

- [ ] **Step 2: Write failing vehicle-card tests**

Fixture vehicle:

```ts
{
  id: 'VEH-LOG-03', type: 'LOGISTICS', corridorId: 'hualilan', state: 'EN_ROUTE', direction: 'TO_PROJECT',
  position: { lon: -68.8, lat: -31.1 }, distanceKm: 40, elevationM: 1200, segmentId: 'hualilan-02', etaMinute: 510,
}
```

At simulation minute `480`, expect:

```ts
{
  primary: 'LOG-03',
  secondary: 'EN ROUTE',
  trailing: '30m',
}
```

Assert the model contains no weather/elevation/corridor-name fields.

- [ ] **Step 3: Write failing visibility-priority tests**

Required behavior:

- Regional: include selected vehicles, `ATTENTION` vehicles and vehicles at project; suppress ordinary en-route vehicles.
- Corridor: include all vehicles except `DONE`/`AT_BASE`, plus selected vehicle regardless of state.
- Close: include all operational vehicles; background traffic is impossible because the function accepts only `snapshot.vehicles`.
- Active projects appear in all bands; inactive projects appear only at `CLOSE`.

Attention IDs are derived from:

```ts
new Set(snapshot.contextEvents.filter((event) => event.severity === 'ATTENTION').map((event) => event.vehicleId))
```

Use priorities:

```ts
selected vehicle: 1000
attention vehicle: 900
active project: 800
vehicle at project: 750
ordinary vehicle: 600
inactive project: 500
```

- [ ] **Step 4: Run RED**

```bash
npm test -- --run src/map/entityCardModel.test.ts
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 5: Implement minimal model helpers**

Short ID:

```ts
export function shortVehicleId(id: string): string {
  return id.replace(/^VEH-/, '');
}
```

Compact ETA:

```ts
function compactEta(etaMinute: number | null, simTime: number, state: VehicleState): string | null {
  if (etaMinute === null || state === 'DONE' || state === 'AT_PROJECT') return null;
  const remaining = Math.max(0, Math.round(etaMinute - simTime));
  return `${remaining}m`;
}
```

Inbound project count must be derived by matching `corridor.destination.id === project.id` and counting snapshots where `direction === 'TO_PROJECT'` and state is `EN_ROUTE` or `AT_STOP`. Active-project secondary copy:

```text
3 inbound
```

or, when zero:

```text
ACTIVE DESTINATION
```

Inactive close-view project copy:

```text
PROJECT
```

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- --run src/map/entityCardModel.test.ts
git add src/map/entityCardModel.ts src/map/entityCardModel.test.ts
git commit -m "feat: derive persistent entity card models"
```

---

### Task 2: Add Deterministic Collision Layout and Performance Guard

**Files:**
- Create: `src/map/entityCardLayout.ts`
- Create: `src/map/entityCardLayout.test.ts`
- Create: `scripts/benchmark-entity-card-layout.mjs`

**Interfaces:**

```ts
export interface ProjectedEntityCard extends EntityCardModel {
  x: number;
  y: number;
}

export interface LaidOutEntityCard extends ProjectedEntityCard {
  visible: boolean;
}

export function resolveEntityCardLayout(
  cards: ProjectedEntityCard[],
  viewport: { width: number; height: number },
): LaidOutEntityCard[];
```

- [ ] **Step 1: Write failing priority/collision tests**

Use deterministic nominal rectangles:

```ts
VEHICLE: 118 x 38 px
PROJECT: 138 x 42 px
collision gap: 6 px
```

Test two overlapping cards:

```ts
const selected = { id: 'vehicle:a', kind: 'VEHICLE', x: 100, y: 100, priority: 1000, selected: true, ... };
const ordinary = { id: 'vehicle:b', kind: 'VEHICLE', x: 102, y: 101, priority: 600, selected: false, ... };
const result = resolveEntityCardLayout([ordinary, selected], { width: 500, height: 400 });
expect(result.find((card) => card.id === selected.id)?.visible).toBe(true);
expect(result.find((card) => card.id === ordinary.id)?.visible).toBe(false);
```

Add stable tie-breaking by `id.localeCompare()` when priorities are equal.

- [ ] **Step 2: Add viewport clipping test**

Cards whose anchor is outside `[-40, width + 40] × [-40, height + 40]` are not visible. This prevents offscreen DOM from growing the page.

- [ ] **Step 3: Run RED**

```bash
npm test -- --run src/map/entityCardLayout.test.ts
```

Expected: FAIL because layout module does not exist.

- [ ] **Step 4: Implement greedy deterministic layout**

Algorithm:

1. sort by `priority DESC`, then `id ASC`;
2. round projected `x/y` to integer pixels;
3. compute a card rectangle centered horizontally and positioned above the anchor;
4. selected card is accepted first by priority;
5. accept a card only if its rectangle does not intersect any accepted rectangle expanded by 6 px;
6. return all inputs with `visible` flags in original input order.

Do not move cards around the screen to solve collisions; hide lower-priority cards. This prevents visual jitter.

- [ ] **Step 5: Add the benchmark**

`benchmark-entity-card-layout.mjs` must create 34 candidates (24 vehicles + 10 projects), run `resolveEntityCardLayout()` 10,000 times and fail if mean execution time exceeds `2 ms` per layout on the CI runner.

Output example:

```text
entity-card-layout mean=0.18ms candidates=34 iterations=10000
```

- [ ] **Step 6: Run GREEN + benchmark**

```bash
npm test -- --run src/map/entityCardLayout.test.ts
node scripts/benchmark-entity-card-layout.mjs
```

Expected: PASS and mean <= 2 ms.

- [ ] **Step 7: Commit**

```bash
git add src/map/entityCardLayout.ts src/map/entityCardLayout.test.ts scripts/benchmark-entity-card-layout.mjs
git commit -m "feat: add deterministic entity card decluttering"
```

---

### Task 3: Render the Approved Compact Card UI

**Files:**
- Create: `src/ui/EntityCardOverlay.tsx`
- Create: `src/ui/EntityCardOverlay.test.tsx`
- Create: `src/ui/entityCards.css`
- Modify: `src/app/App.tsx` only to import stylesheet if the overlay stylesheet is not imported by its component.

**Interfaces:**

```ts
export interface EntityCardOverlayProps {
  cards: LaidOutEntityCard[];
  onVehicleSelect: (vehicleId: string) => void;
}
```

- [ ] **Step 1: Write failing component tests**

Vehicle card must render maximum two text rows:

```tsx
<EntityCardOverlay cards={[{
  id: 'VEH-LOG-03', kind: 'VEHICLE', primary: 'LOG-03', secondary: 'EN ROUTE', trailing: '30m',
  x: 200, y: 180, visible: true, priority: 600, selected: false, attention: false, activeProject: false,
  lon: -68.8, lat: -31.1,
}]} onVehicleSelect={select} />
```

Assertions:

```ts
expect(screen.getByText('LOG-03')).toBeVisible();
expect(screen.getByText('EN ROUTE')).toBeVisible();
expect(screen.getByText('30m')).toBeVisible();
await user.click(screen.getByRole('button', { name: /LOG-03/i }));
expect(select).toHaveBeenCalledWith('VEH-LOG-03');
```

Project cards render as non-button anchors in the first slice because project-detail selection is out of scope.

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/ui/EntityCardOverlay.test.tsx
```

- [ ] **Step 3: Implement compact markup**

Vehicle:

```tsx
<button
  className={`entity-card entity-card--vehicle${card.selected ? ' is-selected' : ''}${card.attention ? ' has-attention' : ''}`}
  style={{ left: card.x, top: card.y }}
  onClick={() => onVehicleSelect(card.id)}
  aria-label={`${card.primary} ${card.secondary}${card.trailing ? ` ${card.trailing}` : ''}`}
>
  <span className="entity-card__top"><strong>{card.primary}</strong>{card.trailing && <span>{card.trailing}</span>}</span>
  <span className="entity-card__secondary">{card.secondary}</span>
</button>
```

Project uses the same shell with `entity-card--project` and no click handler.

- [ ] **Step 4: Implement the visual contract in CSS**

Exact first-pass dimensions:

```css
.entity-card {
  position: absolute;
  transform: translate(-50%, calc(-100% - 10px));
  z-index: 3;
  display: grid;
  gap: 2px;
  min-width: 92px;
  max-width: 138px;
  padding: 5px 7px;
  border: 1px solid rgba(235, 240, 242, 0.18);
  border-radius: 9px;
  background: rgba(11, 17, 21, 0.84);
  color: #f2f5f6;
  box-shadow: 0 5px 16px rgba(0,0,0,0.18);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
.entity-card__top { display:flex; justify-content:space-between; gap:8px; font-size:10px; }
.entity-card__secondary { font-size:8px; font-weight:700; letter-spacing:.06em; color:rgba(242,245,246,.66); }
.entity-card.is-selected { outline: 2px solid rgba(227,170,84,.92); outline-offset: 1px; }
.entity-card.has-attention::before { content:'!'; font-weight:900; margin-right:4px; }
.entity-card--project { border-color: rgba(227,170,84,.38); }
```

No animation is required. Respect existing reduced-motion behavior.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- --run src/ui/EntityCardOverlay.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/EntityCardOverlay.tsx src/ui/EntityCardOverlay.test.tsx src/ui/entityCards.css
git commit -m "feat: add compact persistent entity cards"
```

---

### Task 4: Project Geographic Entities Into the DOM Overlay

**Files:**
- Modify: `src/map/CesiumStage.tsx`
- Modify: `src/app/App.tsx`
- Create: `src/map/entityCardProjection.ts`
- Create: `src/map/entityCardProjection.test.ts`
- Modify: `src/map/CesiumStage.test.tsx` if available

**Interfaces:**

```ts
export interface EntityCardAnchor {
  id: string;
  lon: number;
  lat: number;
  offsetM: number;
}

export function resolveEntityCardWorldHeight(
  terrainHeightM: number | undefined,
  offsetM: number,
): number;
```

`CesiumStageProps` gains:

```ts
selectedVehicleId: string | null;
```

- [ ] **Step 1: Write projection-height tests**

```ts
expect(resolveEntityCardWorldHeight(4993, 8)).toBe(5001);
expect(resolveEntityCardWorldHeight(undefined, 8)).toBe(8);
```

This preserves usable ellipsoid fallback when terrain height is unavailable.

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/map/entityCardProjection.test.ts
```

- [ ] **Step 3: Implement geographic projection in `CesiumStage`**

On each Cesium `scene.postRender`:

1. classify scale from `viewer.camera.positionCartographic.height`;
2. call `buildEntityCardModels({ data, snapshot, selectedVehicleId, scale })`;
3. for each model, get terrain height with `viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat))` when available;
4. use visual offsets: operational vehicle `8 m`, active project `80 m`, project `20 m`;
5. create world position with `Cartesian3.fromDegrees(lon, lat, resolvedHeight)`;
6. project via `SceneTransforms.worldToWindowCoordinates(viewer.scene, worldPosition)`;
7. call `resolveEntityCardLayout()` with canvas dimensions;
8. update React state only when rounded card positions/visibility changed.

Do not use analytical `vehicle.elevationM` as a visual world height.

- [ ] **Step 4: Render the overlay inside `.map-stage`**

```tsx
<EntityCardOverlay cards={entityCards} onVehicleSelect={(id) => onVehicleSelectRef.current?.(id)} />
```

`App.tsx` passes:

```tsx
selectedVehicleId={selectedVehicleId}
```

The existing Cesium marker click and the card click must both drive the same `setSelectedVehicleId` callback.

- [ ] **Step 5: Add listener cleanup**

Register one named `postRender` callback and remove it during the existing Viewer cleanup. No orphan animation loop or global listener is allowed.

- [ ] **Step 6: Run integration GREEN**

```bash
npm test -- --run
npm run build
```

Expected: PASS; existing `VehiclePanel` selection tests remain green.

- [ ] **Step 7: Commit**

```bash
git add src/map/CesiumStage.tsx src/app/App.tsx src/map/entityCardProjection.ts src/map/entityCardProjection.test.ts
git commit -m "feat: anchor entity cards to Cesium terrain"
```

---

### Task 5: Visual QA, Mobile Suppression and Accessibility

**Files:**
- Modify: `scripts/visual-qa.mjs`
- Modify: `src/ui/entityCards.css`
- Create: `docs/qa/v0-2c-entity-cards-acceptance.md`

**Interfaces:**
- Produces: screenshots and explicit card-count/layout checks at desktop/tablet/mobile.

- [ ] **Step 1: Add card checks to visual QA**

At desktop/tablet after `START SHIFT`, assert:

```js
const cardReport = await page.evaluate(() => ({
  visibleCards: [...document.querySelectorAll('.entity-card')].filter((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }).length,
  selectedPanels: document.querySelectorAll('.vehicle-panel').length,
}));
if (cardReport.visibleCards === 0) throw new Error('No persistent entity cards visible');
```

Seek to a time with multiple active units before screenshotting so collision behavior is exercised.

- [ ] **Step 2: Add mobile behavior**

At `max-width: 720px`, hide ordinary unselected vehicle/project cards with a CSS class supplied by model/layout, while keeping selected/attention cards visible. The component must continue to expose selected detail through `VehiclePanel`.

Do not render all 24 cards on a 390 px viewport.

- [ ] **Step 3: Add accessibility assertions**

Testing Library must confirm every vehicle card is a named button, selected card has `aria-pressed="true"`, and project cards have an accessible label but are not focusable controls in this slice.

- [ ] **Step 4: Run full QA and benchmark**

```bash
node scripts/benchmark-entity-card-layout.mjs
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run audit:claims
npm run build
npm run qa:visual
```

Expected: PASS, mean layout <= 2 ms, no page horizontal overflow.

- [ ] **Step 5: Record acceptance**

The acceptance document must include:

- exact card visibility rules by scale;
- priority order;
- benchmark result;
- desktop/tablet/mobile screenshot names;
- statement that background traffic remains unlabeled;
- selected card/detail-panel interaction result;
- regression statement that simulation outputs and terrain state were unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/visual-qa.mjs src/ui/entityCards.css docs/qa/v0-2c-entity-cards-acceptance.md
git commit -m "docs: record persistent entity card acceptance"
```

### PR C Completion Gate

```bash
node scripts/benchmark-entity-card-layout.mjs
npm test -- --run
npm run validate:data
npm run validate:road-context
npm run audit:claims
npm run build
npm run qa:visual
```

All commands must pass on the PR HEAD. Review screenshots specifically for overlap around San Juan, active-project anchors and Veladero close view. Do not merge if selected/attention cards can disappear behind lower-priority cards or if mobile becomes a wall of labels.
