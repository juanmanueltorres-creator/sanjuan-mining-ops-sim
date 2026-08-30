# San Juan Mining Ops Sim — V0.2 Scenario Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use strict RED → GREEN → REFACTOR and review each task before starting the next one.

**Goal:** Add a Veladero-only deterministic What-If Scenario Engine that compiles explicit authored assumptions into the existing simulation, compares their model consequences against an immutable Baseline, and preserves all V0/V0.1 evidence and no-overclaim boundaries.

**Architecture:** Add a scenario layer around the existing engine, not a second simulator. `ScenarioDefinition` is parsed, canonicalized, fingerprinted and compiled into a derived `SanJuanOperationSpec` plus an injected movement policy; the existing engine then produces snapshots/events. Scenario results summarize timings and modelled context-at-passage, and a pure comparison layer emits neutral deltas for a compact map-first UI.

**Tech Stack:** TypeScript + React 19 + Vite 7 + Vitest 3, Zod 4, CesiumJS 1.132, static JSON artifacts, Node 22 ESM validation/QA scripts, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-v0-2-scenario-engine-design.md`

## Global Constraints

- Implementation branch: `feat/v0.2-scenario-engine`, created from `main` **only after V0.1 Road Geometry is merged and accepted**.
- Before Task 1, copy the approved spec and this plan from `design/v0.2-scenario-engine` onto the implementation branch; do not implement on the design branch.
- Veladero only. Hualilán and Los Azules remain operationally unchanged.
- Baseline run id remains `sanjuan-v0-run-20260830-v1` unless V0.1 deliberately changes the immutable run artifact; if that id or its seed changes, stop and reconcile the spec/plan before implementation.
- Baseline seed remains `sanjuan-v0-20260830`; every V0.2 `ScenarioDefinition.seed` must exactly equal `OperationalRun.seed` and `SanJuanOperationSpec.seed`.
- V0.1 must preserve operational segment `veladero-05` as `260–340 km`. Scenario C targets that exact segment. If the final merged V0.1 asset does not satisfy this invariant, stop rather than selecting a “nearest” segment.
- Scenario B adds a **synthetic REST stop at operational km 205 with 15 minutes dwell**. It is not a real checkpoint claim.
- Supported rule vocabulary is closed: `DEPARTURE_OFFSET`, `ADD_PLANNED_STOP`, `SEGMENT_SPEED_MULTIPLIER` only.
- Scenario A applies `+60` departure minutes to all Veladero highlighted synthetic vehicles.
- Scenario C applies `×0.80` to baseline synthetic speed on `veladero-05` only.
- `weather describes context but does not automatically alter movement` remains an invariant.
- `simulation != real operation`; `road geometry != road condition`; `modelled != observed`; `missing != zero`; `candidate != diagnosis`; `proximity != impact`.
- No prediction, recommendation, ranking, risk/safety score, road-status inference, optimization, RL, Monte Carlo, telemetry, dispatch/FMS integration, route alternatives or Territorial Score implementation.
- No runtime provider calls are introduced. Scenario definitions and evidence are checked-in static artifacts.
- One active scenario is rendered at a time. No second Cesium Viewer and no simultaneous Baseline/Scenario vehicle overlays in V0.2.
- Switching scenarios preserves the current simulation clock. Existing Reset semantics do not silently reset the selected scenario.
- Baseline with `rules: []` must reproduce existing V0/V0.1 operational snapshots/events exactly.
- Missing environment context remains `UNAVAILABLE`; never substitute zero, previous values or invented data.
- Every scenario/rule evidence reference resolves fail-closed to `SYNTHETIC_ASSUMPTION` evidence.
- Full final gate on one HEAD: tests → data validation → claim audit → build → visual QA.
- Do not merge the final V0.2 PR without explicit human approval.

## Execution Preflight

Before Task 1, verify the implementation base really is the accepted V0.1 state:

```bash
git switch main
git pull --ff-only
git switch -c feat/v0.2-scenario-engine
git checkout design/v0.2-scenario-engine -- \
  docs/superpowers/specs/2026-08-30-v0-2-scenario-engine-design.md \
  docs/superpowers/plans/2026-08-30-v0-2-scenario-engine.md

git add docs/superpowers/specs/2026-08-30-v0-2-scenario-engine-design.md \
        docs/superpowers/plans/2026-08-30-v0-2-scenario-engine.md
git commit -m "docs: carry approved V0.2 scenario design"
```

Then run:

```bash
node - <<'NODE'
const fs = require('fs');
const metadataPath = fs.existsSync('public/data/corridors/veladero/metadata.v2.json')
  ? 'public/data/corridors/veladero/metadata.v2.json'
  : 'public/data/corridors/veladero/metadata.v1.json';
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const target = metadata.segments.find((segment) => segment.id === 'veladero-05');
if (!target || target.startKm !== 260 || target.endKm !== 340) {
  throw new Error('V0.2 preflight failed: expected veladero-05 to remain 260–340 km');
}
const run = JSON.parse(fs.readFileSync('public/data/runs/sanjuan-v0-run.v1.json', 'utf8'));
if (run.id !== 'sanjuan-v0-run-20260830-v1' || run.seed !== 'sanjuan-v0-20260830') {
  throw new Error(`V0.2 preflight failed: baseline run drifted to ${run.id}/${run.seed}`);
}
console.log(`V0.2 preflight OK: ${metadataPath}, ${target.id}, ${run.id}`);
NODE
```

Expected: `V0.2 preflight OK`. If it fails, stop and update the approved design before writing code.

---

### Task 1: Scenario Input Contracts, Schemas, and Catalog Integrity

**Files:**
- Create: `src/scenario/contracts.ts`
- Create: `src/scenario/schemas.ts`
- Create: `src/scenario/schemas.test.ts`
- Modify: `src/domain/schemas.ts`

**Interfaces:**
- Consumes: existing `EvidenceRef` from `src/domain/contracts.ts` and existing Zod evidence shape from `src/domain/schemas.ts`.
- Produces: `ScenarioRule`, `ScenarioDefinition`, `ScenarioCatalog`, `parseScenarioDefinition(input)`, `parseScenarioCatalog(input)`.

- [ ] **Step 1: Write RED tests for the closed rule vocabulary and catalog integrity**

Create `src/scenario/schemas.test.ts` with tests equivalent to:

```ts
import { describe, expect, it } from 'vitest';
import { parseScenarioCatalog, parseScenarioDefinition } from './schemas';

const base = {
  schemaVersion: 'sanjuan.scenario/v1',
  id: 'veladero-baseline-v1',
  label: 'Baseline',
  corridorId: 'veladero',
  baseRunId: 'sanjuan-v0-run-20260830-v1',
  scenarioVersion: 'what-if-v0.1',
  ruleSetVersion: 'scenario-rules-v1',
  seed: 'sanjuan-v0-20260830',
  rules: [],
  evidenceRefs: ['what-if-baseline-v1'],
  limitations: ['Synthetic scenario wrapper only.'],
};

it('parses the three supported scenario transformation rules', () => {
  const definition = parseScenarioDefinition({
    ...base,
    id: 'combined-v1',
    rules: [
      {
        id: 'departure-plus-60-v1',
        type: 'DEPARTURE_OFFSET',
        target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
        offsetMinutes: 60,
        evidenceRefs: ['departure-rule-evidence'],
      },
      {
        id: 'stop-km205-v1',
        type: 'ADD_PLANNED_STOP',
        target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
        stop: { id: 'scenario-stop-km205-v1', distanceKm: 205, dwellMinutes: 15 },
        evidenceRefs: ['stop-rule-evidence'],
      },
      {
        id: 'speed-veladero-05-v1',
        type: 'SEGMENT_SPEED_MULTIPLIER',
        target: { corridorId: 'veladero', segmentId: 'veladero-05', scope: 'ALL_CORRIDOR_VEHICLES' },
        multiplier: 0.8,
        evidenceRefs: ['speed-rule-evidence'],
      },
    ],
  });
  expect(definition.rules.map((rule) => rule.type)).toEqual([
    'DEPARTURE_OFFSET',
    'ADD_PLANNED_STOP',
    'SEGMENT_SPEED_MULTIPLIER',
  ]);
});

it('rejects unknown rule types and multipliers outside the authoring guard', () => {
  expect(() => parseScenarioDefinition({
    ...base,
    rules: [{ id: 'x', type: 'PREDICT_DELAY', target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' }, evidenceRefs: ['e'] }],
  })).toThrow();

  expect(() => parseScenarioDefinition({
    ...base,
    rules: [{
      id: 'x',
      type: 'SEGMENT_SPEED_MULTIPLIER',
      target: { corridorId: 'veladero', segmentId: 'veladero-05', scope: 'ALL_CORRIDOR_VEHICLES' },
      multiplier: 80,
      evidenceRefs: ['e'],
    }],
  })).toThrow();
});

it('requires catalog rule evidence to resolve to SYNTHETIC_ASSUMPTION records', () => {
  expect(() => parseScenarioCatalog({
    schemaVersion: 'sanjuan.scenario-catalog/v1',
    id: 'veladero-what-if-v1',
    corridorId: 'veladero',
    scenarios: [{ ...base, evidenceRefs: ['missing'] }],
    evidence: [],
    limitations: [],
  })).toThrow(/missing/i);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/scenario/schemas.test.ts
```

Expected: FAIL because the scenario module does not exist.

- [ ] **Step 3: Add the exact serializable scenario contracts**

Create `src/scenario/contracts.ts`:

```ts
import type { EvidenceRef } from '../domain/contracts';

export type ScenarioTargetScope = 'ALL_CORRIDOR_VEHICLES';

export interface DepartureOffsetRule {
  id: string;
  type: 'DEPARTURE_OFFSET';
  target: { corridorId: 'veladero'; scope: ScenarioTargetScope };
  offsetMinutes: number;
  evidenceRefs: string[];
}

export interface AddPlannedStopRule {
  id: string;
  type: 'ADD_PLANNED_STOP';
  target: { corridorId: 'veladero'; scope: ScenarioTargetScope };
  stop: { id: string; distanceKm: number; dwellMinutes: number };
  evidenceRefs: string[];
}

export interface SegmentSpeedMultiplierRule {
  id: string;
  type: 'SEGMENT_SPEED_MULTIPLIER';
  target: { corridorId: 'veladero'; segmentId: string; scope: ScenarioTargetScope };
  multiplier: number;
  evidenceRefs: string[];
}

export type ScenarioRule = DepartureOffsetRule | AddPlannedStopRule | SegmentSpeedMultiplierRule;

export interface ScenarioDefinition {
  schemaVersion: 'sanjuan.scenario/v1';
  id: string;
  label: string;
  corridorId: 'veladero';
  baseRunId: string;
  scenarioVersion: 'what-if-v0.1';
  ruleSetVersion: 'scenario-rules-v1';
  seed: string | number;
  rules: ScenarioRule[];
  evidenceRefs: string[];
  limitations: string[];
}

export interface ScenarioCatalog {
  schemaVersion: 'sanjuan.scenario-catalog/v1';
  id: string;
  corridorId: 'veladero';
  scenarios: ScenarioDefinition[];
  evidence: EvidenceRef[];
  limitations: string[];
}
```

- [ ] **Step 4: Export the existing evidence Zod schema without changing its behavior**

In `src/domain/schemas.ts`, change only:

```ts
const evidenceRefSchema = z.object({
```

to:

```ts
export const evidenceRefSchema = z.object({
```

Run the existing domain schema tests immediately after this mechanical change.

- [ ] **Step 5: Implement strict Zod parsing and cross-reference integrity**

Create `src/scenario/schemas.ts` using a `z.discriminatedUnion('type', ...)`. Exact numeric guards:

```ts
offsetMinutes: z.number().int().finite(),
distanceKm: z.number().nonnegative().finite(),
dwellMinutes: z.number().nonnegative().finite(),
multiplier: z.number().min(0.1).max(2).finite(),
```

Use literals for:

```text
sanjuan.scenario/v1
sanjuan.scenario-catalog/v1
veladero
ALL_CORRIDOR_VEHICLES
what-if-v0.1
scenario-rules-v1
```

`parseScenarioCatalog` must additionally reject:

- duplicate scenario ids;
- duplicate evidence ids;
- duplicate rule ids inside one scenario;
- any scenario/rule evidence ref missing from `catalog.evidence`;
- any referenced scenario evidence whose role is not `SYNTHETIC_ASSUMPTION`;
- zero or more than one empty-rule Baseline definition.

- [ ] **Step 6: GREEN and compatibility check**

```bash
npm test -- --run src/scenario/schemas.test.ts src/domain/schemas.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scenario/contracts.ts src/scenario/schemas.ts src/scenario/schemas.test.ts src/domain/schemas.ts
git commit -m "feat: add scenario input contracts and schemas"
```

---

### Task 2: Canonicalization and Deterministic Scenario Fingerprints

**Files:**
- Create: `src/scenario/canonicalize.ts`
- Create: `src/scenario/canonicalize.test.ts`

**Interfaces:**
- Consumes: `ScenarioDefinition`, `ScenarioRule` from Task 1.
- Produces: `canonicalizeScenarioRules(rules)`, `scenarioFingerprint(definition)`.

- [ ] **Step 1: Write RED tests for rule-order invariance**

```ts
import { describe, expect, it } from 'vitest';
import { canonicalizeScenarioRules, scenarioFingerprint } from './canonicalize';
import type { ScenarioDefinition, ScenarioRule } from './contracts';

const departure: ScenarioRule = {
  id: 'departure-plus-60-v1',
  type: 'DEPARTURE_OFFSET',
  target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
  offsetMinutes: 60,
  evidenceRefs: ['departure-evidence'],
};
const stop: ScenarioRule = {
  id: 'stop-km205-v1',
  type: 'ADD_PLANNED_STOP',
  target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
  stop: { id: 'scenario-stop-km205-v1', distanceKm: 205, dwellMinutes: 15 },
  evidenceRefs: ['stop-evidence'],
};

function definition(rules: ScenarioRule[]): ScenarioDefinition {
  return {
    schemaVersion: 'sanjuan.scenario/v1',
    id: 'combined-v1',
    label: 'Combined',
    corridorId: 'veladero',
    baseRunId: 'sanjuan-v0-run-20260830-v1',
    scenarioVersion: 'what-if-v0.1',
    ruleSetVersion: 'scenario-rules-v1',
    seed: 'sanjuan-v0-20260830',
    rules,
    evidenceRefs: ['scenario-evidence'],
    limitations: [],
  };
}

it('canonicalizes reordered rules identically', () => {
  expect(canonicalizeScenarioRules([departure, stop])).toEqual(canonicalizeScenarioRules([stop, departure]));
});

it('produces the same fingerprint for reordered rules and a different one for changed parameters', () => {
  expect(scenarioFingerprint(definition([departure, stop]))).toBe(scenarioFingerprint(definition([stop, departure])));
  expect(scenarioFingerprint(definition([{ ...departure, offsetMinutes: 61 }, stop])))
    .not.toBe(scenarioFingerprint(definition([departure, stop])));
});

it('does not change model identity when only the presentation label changes', () => {
  const a = definition([departure]);
  const b = { ...a, label: 'Different display label' };
  expect(scenarioFingerprint(a)).toBe(scenarioFingerprint(b));
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/scenario/canonicalize.test.ts
```

Expected: FAIL because canonicalization does not exist.

- [ ] **Step 3: Implement stable canonical JSON and a non-cryptographic FNV-1a 64-bit fingerprint**

Use a recursive stable serializer that sorts object keys and sorts `evidenceRefs`. Canonical rule ordering must be by:

```text
type → target corridor → target segment (or empty string) → rule id
```

Fingerprint payload is exactly:

```ts
{
  baseRunId: definition.baseRunId,
  scenarioVersion: definition.scenarioVersion,
  ruleSetVersion: definition.ruleSetVersion,
  seed: definition.seed,
  rules: canonicalizeScenarioRules(definition.rules),
}
```

Implement FNV-1a 64-bit with `BigInt` and return a 16-character lowercase hex string. Do not use `Date.now()`, `Math.random()`, browser state or async crypto.

- [ ] **Step 4: GREEN**

```bash
npm test -- --run src/scenario/canonicalize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenario/canonicalize.ts src/scenario/canonicalize.test.ts
git commit -m "feat: add deterministic scenario fingerprints"
```

---

### Task 3: Centralize Deterministic Simulation Time Utilities

**Files:**
- Create: `src/simulation/time.ts`
- Create: `src/simulation/time.test.ts`
- Modify: `src/simulation/vehicle.ts`
- Modify: `src/simulation/schedule.ts`
- Modify: `src/simulation/engine.ts`

**Interfaces:**
- Produces: `parseMinuteOfDay(value)`, `formatMinuteOfDay(minute)`, `isoAtSimulationMinute(targetDate, simMinute)`.
- Later tasks use the same parse/format semantics for scenario compilation and environment-at-passage summaries.

- [ ] **Step 1: Write RED utility tests from current behavior**

```ts
import { describe, expect, it } from 'vitest';
import { formatMinuteOfDay, isoAtSimulationMinute, parseMinuteOfDay } from './time';

it('round-trips valid local clock values', () => {
  expect(parseMinuteOfDay('07:05')).toBe(425);
  expect(formatMinuteOfDay(425)).toBe('07:05');
});

it('rejects invalid clock values', () => {
  expect(() => parseMinuteOfDay('24:00')).toThrow(/Invalid departureTime/);
  expect(() => parseMinuteOfDay('07:60')).toThrow(/Invalid departureTime/);
});

it('converts simulation minute to the fixed San Juan run offset format', () => {
  expect(isoAtSimulationMinute('2026-08-30', 425)).toBe('2026-08-30T07:05:00-03:00');
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/simulation/time.test.ts
```

Expected: FAIL because `time.ts` does not exist.

- [ ] **Step 3: Move the existing semantics into the new pure helpers**

Move, without semantic changes:

- `parseMinuteOfDay` from `vehicle.ts`;
- `formatMinuteOfDay` from `schedule.ts`;
- `isoAtSimulationMinute` and minute parsing in `engine.ts`.

`formatMinuteOfDay` must reject non-integer values outside `0..1439`; it must not silently wrap scenario authoring errors.

- [ ] **Step 4: Replace local helper copies with imports**

Ensure `vehicle.ts`, `schedule.ts`, and `engine.ts` all use `src/simulation/time.ts`.

- [ ] **Step 5: GREEN regression**

```bash
npm test -- --run src/simulation/time.test.ts src/simulation/vehicle.test.ts src/simulation/engine.test.ts src/simulation/events.test.ts src/qa/v0Acceptance.test.ts
npm run build
```

Expected: all existing behavior remains green.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/time.ts src/simulation/time.test.ts src/simulation/vehicle.ts src/simulation/schedule.ts src/simulation/engine.ts
git commit -m "refactor: centralize deterministic simulation time"
```

---

### Task 4: Inject a Speed Resolver Without Baseline Drift

**Files:**
- Create: `src/simulation/speed.ts`
- Create: `src/simulation/speed.test.ts`
- Modify: `src/simulation/schedule.ts`
- Modify: `src/simulation/vehicle.ts`
- Modify: `src/simulation/events.ts`
- Modify: `src/simulation/engine.ts`
- Modify: `src/qa/v0Acceptance.test.ts`

**Interfaces:**
- Produces: `SpeedResolver`, `MovementPolicy`, `baselineSpeedResolver`, `BASELINE_MOVEMENT_POLICY`.
- Changes existing simulation functions only by adding optional/defaulted speed-policy inputs; existing callers remain source-compatible.

- [ ] **Step 1: Write RED tests for the baseline resolver**

Create `src/simulation/speed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { baselineSpeedResolver } from './speed';
import type { CorridorSegment, VehicleDefinition } from '../domain/contracts';

const vehicle = { id: 'V', type: 'LOGISTICS', corridorId: 'veladero' } as VehicleDefinition;
const segment = { id: 'veladero-05', roadClass: 'highMountain' } as CorridorSegment;

it('reproduces the existing logistics high-mountain synthetic speed', () => {
  expect(baselineSpeedResolver(vehicle, segment)).toBe(25);
});

it('fails closed on an unsupported synthetic road class', () => {
  expect(() => baselineSpeedResolver(vehicle, { ...segment, roadClass: 'unknown' })).toThrow(/Unsupported synthetic road class/);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/simulation/speed.test.ts
```

Expected: FAIL because `speed.ts` does not exist.

- [ ] **Step 3: Move speed-profile responsibility into `speed.ts`**

Create:

```ts
export type SyntheticRoadClass = 'pavedLowland' | 'mountainRoad' | 'highMountain' | 'approach';
export type SpeedResolver = (vehicle: VehicleDefinition, segment: CorridorSegment) => number;
export interface MovementPolicy { speedResolver: SpeedResolver }

export const SPEED_PROFILES: Record<VehicleType, Record<SyntheticRoadClass, number>> = {
  PERSONNEL: { pavedLowland: 70, mountainRoad: 45, highMountain: 30, approach: 25 },
  FIELD: { pavedLowland: 75, mountainRoad: 50, highMountain: 35, approach: 30 },
  LOGISTICS: { pavedLowland: 60, mountainRoad: 38, highMountain: 25, approach: 20 },
};

export const baselineSpeedResolver: SpeedResolver = (vehicle, segment) => {
  const speed = SPEED_PROFILES[vehicle.type][segment.roadClass as SyntheticRoadClass];
  if (!speed) throw new Error(`Unsupported synthetic road class: ${segment.roadClass}`);
  return speed;
};

export const BASELINE_MOVEMENT_POLICY: MovementPolicy = { speedResolver: baselineSpeedResolver };
```

`src/simulation/schedule.ts` may re-export `SPEED_PROFILES` and `SyntheticRoadClass` for compatibility, but vehicle movement must import the resolver from `speed.ts`.

- [ ] **Step 4: Thread the resolver through movement/event functions with baseline defaults**

Change signatures to:

```ts
export function travelMinutesBetween(
  corridor: CorridorDefinition,
  vehicle: VehicleDefinition,
  startKm: number,
  endKm: number,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): number;

export function segmentTravelMinutes(
  vehicle: VehicleDefinition,
  segment: CorridorSegment,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): number;

export function getVehicleTiming(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): VehicleTiming;

export function outboundPassageMinuteAtDistance(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  requestedDistanceKm: number,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): number;

export function snapshotVehicle(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  simMinute: number,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): VehicleSnapshot;
```

Use `speedResolver(vehicle, segment)` everywhere movement previously read `SPEED_PROFILES` directly.

Update:

```ts
export function deriveOperationalEvents(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  speedResolver: SpeedResolver = baselineSpeedResolver,
): OperationalEvent[];
```

Add the fifth engine parameter:

```ts
export function getOperationalSnapshot(
  spec: SanJuanOperationSpec,
  run: OperationalRun,
  simMinute: number,
  environment?: EnvironmentSnapshot,
  movementPolicy: MovementPolicy = BASELINE_MOVEMENT_POLICY,
): OperationalSnapshot;
```

- [ ] **Step 5: Add the explicit no-drift acceptance assertion**

In `src/qa/v0Acceptance.test.ts`, at the existing checkpoints compare default execution to explicit baseline policy:

```ts
for (const minuteOfDay of CHECKPOINTS) {
  expect(getOperationalSnapshot(spec, artifacts.run, minuteOfDay, artifacts.environment, BASELINE_MOVEMENT_POLICY))
    .toEqual(getOperationalSnapshot(spec, artifacts.run, minuteOfDay, artifacts.environment));
}
```

- [ ] **Step 6: GREEN**

```bash
npm test -- --run src/simulation/speed.test.ts src/simulation/vehicle.test.ts src/simulation/events.test.ts src/simulation/engine.test.ts src/qa/v0Acceptance.test.ts
npm run build
```

Expected: exact Baseline compatibility.

- [ ] **Step 7: Commit**

```bash
git add src/simulation/speed.ts src/simulation/speed.test.ts src/simulation/schedule.ts src/simulation/vehicle.ts src/simulation/events.ts src/simulation/engine.ts src/qa/v0Acceptance.test.ts
git commit -m "refactor: inject deterministic movement speed policy"
```

---

### Task 5: Pure Scenario Compiler

**Files:**
- Create: `src/scenario/compiler.ts`
- Create: `src/scenario/compiler.test.ts`

**Interfaces:**
- Consumes: `ScenarioDefinition`, `EvidenceRef`, `SanJuanOperationSpec`, `OperationalRun`, `MovementPolicy`.
- Produces: `ScenarioCompilation`, `compileScenario(definition, baselineSpec, run, scenarioEvidence)`.

- [ ] **Step 1: Write RED compiler tests using the checked-in V0/V0.1 baseline**

Use the same filesystem `JsonFetcher` pattern as `src/qa/v0Acceptance.test.ts` to load the real operation/run/traffic artifacts, then build `baselineSpec` through `buildV0OperationSpec()`.

Required tests:

```ts
it('compiles an empty Baseline without mutating the baseline spec', () => { /* JSON snapshot before/after remains identical */ });
it('applies +60 minutes only to Veladero departures', () => { /* non-Veladero vehicles deep-equal baseline */ });
it('adds one synthetic REST stop at km 205 with 15 minutes dwell', () => { /* evidence refs are rule refs */ });
it('builds a speed policy that multiplies only veladero-05 by 0.80', () => { /* other segments use baseline speed */ });
it('rejects a baseRunId or seed that differs from the immutable run', () => { /* fail closed */ });
it('rejects duplicate departure rules and duplicate speed rules on the same segment', () => { /* no precedence */ });
it('rejects an unknown segment, an out-of-range stop, duplicate stop id, or departure outside the 06:00–20:00 schedule', () => { /* fail closed */ });
it('rejects unresolved or non-SYNTHETIC_ASSUMPTION rule evidence', () => { /* fail closed */ });
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/scenario/compiler.test.ts
```

Expected: FAIL because compiler does not exist.

- [ ] **Step 3: Define the runtime compilation boundary**

In `src/scenario/compiler.ts`:

```ts
export interface ScenarioCompilation {
  scenarioId: string;
  baseRunId: string;
  fingerprint: string;
  appliedRuleIds: string[];
  effectiveSpec: SanJuanOperationSpec;
  movementPolicy: MovementPolicy;
  evidenceRefs: string[];
  limitations: string[];
}

export function compileScenario(
  definition: ScenarioDefinition,
  baselineSpec: SanJuanOperationSpec,
  run: OperationalRun,
  scenarioEvidence: EvidenceRef[],
): ScenarioCompilation;
```

- [ ] **Step 4: Implement identity and conflict validation before transformation**

Require exact equality:

```text
definition.baseRunId === run.id
definition.seed === run.seed
baselineSpec.seed === run.seed
definition.corridorId === 'veladero'
```

Require the target corridor to exist. Validate all definition/rule evidence against `scenarioEvidence` and require role `SYNTHETIC_ASSUMPTION`.

Conflict rules:

- duplicate rule ids fail;
- more than one `DEPARTURE_OFFSET` for the Veladero all-vehicles target fails;
- more than one `SEGMENT_SPEED_MULTIPLIER` for the same segment fails;
- duplicate added stop ids fail, including collision with an existing planned-stop id;
- different added-stop ids may compose deterministically.

- [ ] **Step 5: Implement pure transformations**

For `DEPARTURE_OFFSET`:

```ts
const departureMinute = parseMinuteOfDay(vehicle.departureTime) + rule.offsetMinutes;
if (departureMinute < baselineSpec.schedule.startMinute || departureMinute > baselineSpec.schedule.endMinute) {
  throw new Error(...);
}
const departureTime = formatMinuteOfDay(departureMinute);
```

For `ADD_PLANNED_STOP`, materialize:

```ts
{
  id: rule.stop.id,
  type: 'REST',
  distanceKm: rule.stop.distanceKm,
  dwellMinutes: rule.stop.dwellMinutes,
  synthetic: true,
  evidenceRefs: [...rule.evidenceRefs],
}
```

Insert the stop into Veladero vehicles only. Never label it a real checkpoint.

For `SEGMENT_SPEED_MULTIPLIER`, build a scenario `SpeedResolver` around `baselineSpeedResolver`:

```ts
const base = baselineSpeedResolver(vehicle, segment);
if (vehicle.corridorId !== 'veladero') return base;
return base * (multiplierBySegmentId.get(segment.id) ?? 1);
```

Keep `effectiveSpec.scenarioId` unchanged from Baseline; scenario identity belongs to `ScenarioCompilation`, not the baseline domain object.

- [ ] **Step 6: Canonicalize before application and fingerprinting**

Use Task 2 canonical rules for both conflict evaluation/application order and `scenarioFingerprint(definition)`.

`appliedRuleIds` must be canonical and stable.

- [ ] **Step 7: GREEN**

```bash
npm test -- --run src/scenario/compiler.test.ts src/simulation/vehicle.test.ts src/qa/v0Acceptance.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/scenario/compiler.ts src/scenario/compiler.test.ts
git commit -m "feat: add pure Veladero scenario compiler"
```

---

### Task 6: Versioned Baseline/A/B/C Scenario Catalog and Loader

**Files:**
- Create: `public/data/scenarios/veladero-scenarios.v1.json`
- Create: `src/scenario/loadScenarioCatalog.ts`
- Create: `src/scenario/loadScenarioCatalog.test.ts`

**Interfaces:**
- Consumes: `ScenarioCatalog`, `parseScenarioCatalog`, existing `JsonFetcher` shape.
- Produces: `SCENARIO_CATALOG_URL`, `loadScenarioCatalog(fetcher)`.

- [ ] **Step 1: Write RED loader tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadScenarioCatalog, SCENARIO_CATALOG_URL } from './loadScenarioCatalog';

it('loads and parses the Veladero catalog from the versioned static path', async () => {
  const fetcher = async (url: string) => ({
    ok: url === SCENARIO_CATALOG_URL,
    json: async () => validCatalogFixture,
  });
  const catalog = await loadScenarioCatalog(fetcher);
  expect(catalog.scenarios.map((scenario) => scenario.id)).toEqual([
    'veladero-baseline-v1',
    'veladero-departure-plus-60-v1',
    'veladero-stop-km205-plus-15-v1',
    'veladero-speed-veladero-05-x080-v1',
  ]);
});

it('fails closed on missing or invalid catalog data', async () => {
  await expect(loadScenarioCatalog(async () => ({ ok: false, json: async () => ({}) }))).rejects.toThrow();
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/scenario/loadScenarioCatalog.test.ts
```

Expected: FAIL because loader/catalog do not exist.

- [ ] **Step 3: Check in the exact four reference definitions**

`public/data/scenarios/veladero-scenarios.v1.json` must contain these ids and transformations:

```text
veladero-baseline-v1
  rules = []

veladero-departure-plus-60-v1
  DEPARTURE_OFFSET +60

veladero-stop-km205-plus-15-v1
  ADD_PLANNED_STOP id=veladero-simulated-stop-km205-v1 distanceKm=205 dwellMinutes=15

veladero-speed-veladero-05-x080-v1
  SEGMENT_SPEED_MULTIPLIER segmentId=veladero-05 multiplier=0.80
```

All four definitions use:

```text
baseRunId = sanjuan-v0-run-20260830-v1
scenarioVersion = what-if-v0.1
ruleSetVersion = scenario-rules-v1
seed = sanjuan-v0-20260830
corridorId = veladero
```

Add four scenario evidence records, all `SYNTHETIC_ASSUMPTION`:

```text
what-if-baseline-v1
what-if-departure-plus-60-v1
what-if-stop-km205-plus-15-v1
what-if-speed-veladero-05-x080-v1
```

Each limitation must explicitly state that the rule/result is synthetic and is not observed operator behavior, road condition, safety/transitability policy or recommendation. Scenario B evidence must say the km 205 stop is an authored simulated REST stop, not a real checkpoint.

- [ ] **Step 4: Implement the static loader**

```ts
export const SCENARIO_CATALOG_URL = '/data/scenarios/veladero-scenarios.v1.json';

export async function loadScenarioCatalog(fetcher: JsonFetcher): Promise<ScenarioCatalog> {
  const response = await fetcher(SCENARIO_CATALOG_URL);
  if (!response.ok) throw new Error(`Scenario catalog unavailable: ${SCENARIO_CATALOG_URL}`);
  return parseScenarioCatalog(await response.json());
}
```

Follow existing loader error conventions rather than using browser-global `fetch` inside the parser.

- [ ] **Step 5: GREEN**

```bash
npm test -- --run src/scenario/loadScenarioCatalog.test.ts src/scenario/schemas.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add public/data/scenarios/veladero-scenarios.v1.json src/scenario/loadScenarioCatalog.ts src/scenario/loadScenarioCatalog.test.ts
git commit -m "feat: add versioned Veladero what-if scenarios"
```

---

### Task 7: Scenario Results, Passage Context, and Neutral Comparison

**Files:**
- Create: `src/scenario/results.ts`
- Create: `src/scenario/results.test.ts`

**Interfaces:**
- Consumes: `ScenarioCompilation`, `OperationalRun`, `EnvironmentSnapshot`, movement timing helpers.
- Produces: `ScenarioResult`, `ScenarioComparison`, `buildScenarioResult(...)`, `compareScenarioResults(...)`.

- [ ] **Step 1: Write RED result/comparison tests**

Using the checked-in catalog and baseline artifacts, compile Baseline/A/B/C and assert:

```ts
expect(resultA.corridorSummary.lastProjectArrivalMinute - baseline.corridorSummary.lastProjectArrivalMinute).toBe(60);
expect(resultA.vehicleTimings.every((timing, i) => timing.totalCycleMinutes === baseline.vehicleTimings[i].totalCycleMinutes)).toBe(true);

expect(comparisonB.vehicleDeltas.every((delta) => delta.dwellDeltaMinutes === 15)).toBe(true);
expect(comparisonB.vehicleDeltas.every((delta) => delta.projectArrivalDeltaMinutes === 15)).toBe(true);

expect(comparisonC.vehicleDeltas.every((delta) =>
  delta.segmentTimeDeltas.filter((segment) => segment.deltaMinutes !== 0).every((segment) => segment.segmentId === 'veladero-05'),
)).toBe(true);
```

Also require two independent `buildScenarioResult()` calls from identical inputs to deep-equal exactly.

- [ ] **Step 2: Run RED**

```bash
npm test -- --run src/scenario/results.test.ts
```

Expected: FAIL because result/comparison layer does not exist.

- [ ] **Step 3: Define exact result types**

In `src/scenario/results.ts`:

```ts
export interface ScenarioSegmentTiming {
  segmentId: string;
  minutes: number;
}

export interface ScenarioVehicleTiming {
  vehicleId: string;
  type: VehicleType;
  departureMinute: number;
  projectArrivalMinute: number;
  returnStartMinute: number;
  baseArrivalMinute: number;
  totalCycleMinutes: number;
  plannedDwellMinutes: number;
  segmentTimings: ScenarioSegmentTiming[];
}

export interface ScenarioPassageContext {
  vehicleId: string;
  nodeId: string;
  passageMinute: number;
  environment: EnvironmentContext;
}

export interface ScenarioCorridorSummary {
  corridorId: 'veladero';
  vehicleCount: number;
  firstDepartureMinute: number;
  lastProjectArrivalMinute: number;
  lastBaseArrivalMinute: number;
  totalPlannedDwellMinutes: number;
  maxElevationM: number;
}

export interface ScenarioResult {
  scenarioId: string;
  baseRunId: string;
  corridorId: 'veladero';
  environmentSnapshotId: string;
  seed: string | number;
  fingerprint: string;
  appliedRuleIds: string[];
  vehicleTimings: ScenarioVehicleTiming[];
  corridorSummary: ScenarioCorridorSummary;
  passageContexts: ScenarioPassageContext[];
  evidenceRefs: string[];
  limitations: string[];
}
```

Comparison types:

```ts
export interface ScenarioSegmentTimeDelta {
  segmentId: string;
  baselineMinutes: number;
  scenarioMinutes: number;
  deltaMinutes: number;
}

export interface ScenarioVehicleDelta {
  vehicleId: string;
  departureDeltaMinutes: number;
  projectArrivalDeltaMinutes: number;
  baseArrivalDeltaMinutes: number;
  totalCycleDeltaMinutes: number;
  dwellDeltaMinutes: number;
  segmentTimeDeltas: ScenarioSegmentTimeDelta[];
}

export interface ScenarioCorridorDelta {
  firstDepartureDeltaMinutes: number;
  lastProjectArrivalDeltaMinutes: number;
  lastBaseArrivalDeltaMinutes: number;
  totalPlannedDwellDeltaMinutes: number;
}

export interface PassageContextChange {
  vehicleId: string;
  nodeId: string;
  baselinePassageMinute: number;
  scenarioPassageMinute: number;
  baseline: EnvironmentContext;
  scenario: EnvironmentContext;
}

export interface ScenarioComparison {
  baselineScenarioId: string;
  comparedScenarioId: string;
  corridorDelta: ScenarioCorridorDelta;
  vehicleDeltas: ScenarioVehicleDelta[];
  passageContextChanges: PassageContextChange[];
  unchangedTerritorialDimensions: Array<'corridorGeometry' | 'elevationProfile' | 'environmentSnapshot' | 'seed'>;
  appliedRuleIds: string[];
}
```

There are deliberately no score/rank/recommendation/probability fields.

- [ ] **Step 4: Implement deterministic result building**

Export:

```ts
export function buildScenarioResult(
  compilation: ScenarioCompilation,
  run: OperationalRun,
  environment: EnvironmentSnapshot,
): ScenarioResult;
```

Validate `compilation.baseRunId === run.id` and `environment.id === run.environmentSnapshotId`.

For Veladero vehicles only:

- call `getVehicleTiming(vehicle, corridor, compilation.movementPolicy.speedResolver)`;
- `totalCycleMinutes = baseArrivalMinute - departureMinute`;
- `plannedDwellMinutes = sum(vehicle.plannedStops.map(stop => stop.dwellMinutes))`;
- `segmentTimings = corridor.segments.map(segment => ({ segmentId, minutes: segmentTravelMinutes(vehicle, segment, resolver) }))`.

For each existing `corridor.nodes` entry and each Veladero vehicle:

```ts
const passageMinute = outboundPassageMinuteAtDistance(vehicle, corridor, node.distanceKm, resolver);
const time = isoAtSimulationMinute(run.targetDate, passageMinute);
const context = environmentAtPassage(environment, corridor.id, node.distanceKm, time);
```

Keep `UNAVAILABLE` context exactly as returned by `environmentAtPassage`.

`corridorSummary` uses fleet-level neutral extrema/totals only: first departure, last project arrival, last base arrival, total planned dwell, max route-sample elevation.

- [ ] **Step 5: Implement pure comparison with identity guards**

Export:

```ts
export function compareScenarioResults(
  baseline: ScenarioResult,
  scenario: ScenarioResult,
): ScenarioComparison;
```

Reject comparisons unless baseRunId, corridorId, environmentSnapshotId, seed and vehicle-id sets match.

Pair passage contexts by `vehicleId + nodeId`. Preserve `UNAVAILABLE` objects rather than manufacturing numeric deltas.

Set:

```ts
unchangedTerritorialDimensions: [
  'corridorGeometry',
  'elevationProfile',
  'environmentSnapshot',
  'seed',
]
```

because compilation is constrained to one immutable baseline and V0.2 has no route/environment transformation rule.

- [ ] **Step 6: Add the environment boundary regression**

Clone the environment snapshot and alter numeric weather values while preserving identity/timestamps. Rebuild timing results and assert **all vehicle timing fields remain equal**; only passage-context values may differ.

- [ ] **Step 7: GREEN**

```bash
npm test -- --run src/scenario/results.test.ts src/environment/lookup.test.ts src/simulation/vehicle.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/scenario/results.ts src/scenario/results.test.ts
git commit -m "feat: add deterministic scenario comparison results"
```

---

### Task 8: Scenario Runtime Adapter and Map-First UI

**Files:**
- Create: `src/scenario/runtime.ts`
- Create: `src/scenario/runtime.test.ts`
- Create: `src/ui/ScenarioSelector.tsx`
- Create: `src/ui/ScenarioSelector.test.tsx`
- Create: `src/ui/ScenarioComparisonDrawer.tsx`
- Create: `src/ui/ScenarioComparisonDrawer.test.tsx`
- Create: `src/ui/scenario.css`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `getScenarioSnapshot(compilation, run, simMinute, environment)` as the one adapter from compiled scenario to the existing engine.
- UI consumes parsed catalog definitions and pure `ScenarioComparison`; it does not implement model rules.

- [ ] **Step 1: Write RED runtime adapter test**

```ts
it('delegates to the existing engine with effectiveSpec and movementPolicy', () => {
  const actual = getScenarioSnapshot(compilation, run, 630, environment);
  const expected = getOperationalSnapshot(
    compilation.effectiveSpec,
    run,
    630,
    environment,
    compilation.movementPolicy,
  );
  expect(actual).toEqual(expected);
});
```

- [ ] **Step 2: Implement the tiny adapter**

```ts
export function getScenarioSnapshot(
  compilation: ScenarioCompilation,
  run: OperationalRun,
  simMinute: number,
  environment: EnvironmentSnapshot,
): OperationalSnapshot {
  return getOperationalSnapshot(
    compilation.effectiveSpec,
    run,
    simMinute,
    environment,
    compilation.movementPolicy,
  );
}
```

No React/Cesium imports.

- [ ] **Step 3: Write RED component tests**

`ScenarioSelector.test.tsx` must verify:

- exactly Baseline/A/B/C options from props;
- active value changes through `onChange`;
- no wording such as `Prediction`, `Recommended`, `Optimal`.

`ScenarioComparisonDrawer.test.tsx` must verify:

- `AUTHORED CHANGE`, `MODEL RESULT`, `WHY THIS CHANGED`, `HELD CONSTANT` sections;
- neutral signed minute deltas;
- applied rule ids/labels are visible;
- unavailable passage context renders `UNAVAILABLE`, not `0`;
- no `best`, `recommended`, `safe`, `risk score` output.

- [ ] **Step 4: Run RED UI tests**

```bash
npm test -- --run src/scenario/runtime.test.ts src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 5: Implement compact scenario controls**

`ScenarioSelector` props:

```ts
export interface ScenarioSelectorProps {
  scenarios: ScenarioDefinition[];
  value: string;
  disabled?: boolean;
  onChange: (scenarioId: string) => void;
}
```

Render a compact labelled `<select aria-label="Scenario">` with `.scenario-selector` class.

`ScenarioComparisonDrawer` props:

```ts
export interface ScenarioComparisonDrawerProps {
  open: boolean;
  scenario: ScenarioDefinition | null;
  baseline: ScenarioResult | null;
  result: ScenarioResult | null;
  comparison: ScenarioComparison | null;
  onClose: () => void;
}
```

Use `.scenario-comparison-drawer` and `.scenario-comparison-scroll`. Keep the drawer max width consistent with the existing Sources drawer pattern (`min(420px, viewport - 20px)`).

Fleet-level primary rows:

```text
LAST PROJECT ARRIVAL
LAST BASE ARRIVAL
AFFECTED VEHICLES
```

Show per-vehicle delta range for project arrival/cycle/dwell when values differ by vehicle type. For changed segments, group non-zero `segmentTimeDeltas` by segment id and show neutral min…max minute delta across affected vehicles. Do not label positive/negative as good/bad.

- [ ] **Step 6: Integrate scenarios into `App.tsx` without blocking the Baseline if the scenario catalog is unavailable**

Keep existing operation/run/traffic loading unchanged. Add separate scenario-catalog state/error loading through the same `resolveRuntimeAssetUrl` fetch wrapper.

Required derived state:

```ts
const baselineScenario = catalog?.scenarios.find((scenario) => scenario.rules.length === 0) ?? null;
const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
```

When a valid catalog first loads, initialize `selectedScenarioId` to `baselineScenario.id` only if no scenario has been selected yet.

Compile definitions with:

```ts
compileScenario(definition, spec, runArtifacts.run, catalog.evidence)
```

The active snapshot uses `getScenarioSnapshot(...)`. If the scenario catalog is unavailable/invalid, keep the existing Baseline simulation usable but surface `SCENARIOS · UNAVAILABLE`; do not silently present A/B/C as valid.

Scenario switching must **not** call `setClock`.

Existing Reset must **not** call `setSelectedScenarioId`.

Background traffic remains unchanged and continues to use the immutable baseline run seed.

- [ ] **Step 7: Add comparison action only for non-Baseline scenarios**

Precompute `ScenarioResult` for Baseline and the selected scenario with `buildScenarioResult()`, then `compareScenarioResults()`.

Render `COMPARE` only when the selected definition has at least one rule. Baseline has no comparison button.

Do not implement the optional four-column Baseline/A/B/C summary table in V0.2 unless it can be added without expanding scope; the approved spec marks that table optional.

- [ ] **Step 8: GREEN component/runtime tests**

```bash
npm test -- --run src/scenario/runtime.test.ts src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.test.tsx src/app/App.test.tsx
npm run build
```

If `src/app/App.test.tsx` does not exist on the post-V0.1 base, add focused integration coverage in `src/app/App.scenario.test.tsx` rather than creating unrelated app tests.

- [ ] **Step 9: Commit**

```bash
git add src/scenario/runtime.ts src/scenario/runtime.test.ts src/ui/ScenarioSelector.tsx src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.tsx src/ui/ScenarioComparisonDrawer.test.tsx src/ui/scenario.css src/app/App.tsx src/app/App.scenario.test.tsx
git commit -m "feat: add map-first what-if scenario experience"
```

If the existing app test path is used instead of `App.scenario.test.tsx`, stage that actual file path rather than a nonexistent one.

---

### Task 9: V0.2 Acceptance Replay, Static Data Validation, Claims Audit, and Visual QA

**Files:**
- Create: `src/qa/v02ScenarioAcceptance.test.ts`
- Modify: `scripts/validate-data.mjs`
- Modify: `scripts/audit-claims.mjs`
- Modify: `scripts/visual-qa.mjs`

**Interfaces:**
- Acceptance consumes the canonical checked-in Baseline/A/B/C catalog; it does not build ad-hoc scenario definitions that can drift from production.

- [ ] **Step 1: Write RED checked-in V0.2 acceptance tests**

`src/qa/v02ScenarioAcceptance.test.ts` loads operation/run/environment/traffic/catalog from `public/`, builds the canonical baseline spec, compiles all four scenarios and requires:

```text
Baseline: empty-rule scenario snapshots/events deep-equal existing engine Baseline at 360, 540, 720, 960, 1200.
A: all Veladero departures +60; non-Veladero vehicles unchanged; driving/segment durations unchanged.
B: all Veladero vehicles gain one synthetic REST stop at km 205 and exactly +15 downstream minutes.
C: only veladero-05 speed changes; earlier segment times remain equal; downstream times inherit deterministic deltas.
Determinism: compile + result + comparison repeated twice deep-equal exactly.
Environment boundary: changing only modelled weather values cannot change vehicle timings.
Provenance: every scenario/rule evidence ref resolves to catalog SYNTHETIC_ASSUMPTION evidence.
```

- [ ] **Step 2: Run RED acceptance**

```bash
npm test -- --run src/qa/v02ScenarioAcceptance.test.ts
```

Expected: at least one missing validation/QA requirement fails before the next steps are implemented.

- [ ] **Step 3: Extend static `validate:data` with the checked-in scenario catalog**

Load `public/data/scenarios/veladero-scenarios.v1.json` and require:

```text
schemaVersion = sanjuan.scenario-catalog/v1
corridorId = veladero
exact scenario ids = baseline/A/B/C ids from Task 6
exactly one rules=[] Baseline
all scenario baseRunId values equal run.id
all scenario seeds equal run.seed
all evidence refs resolve
all referenced evidence roles = SYNTHETIC_ASSUMPTION
Scenario A offset = 60
Scenario B distanceKm = 205 and dwellMinutes = 15
Scenario C segmentId = veladero-05 and multiplier = 0.8
veladero-05 exists in the loaded corridor operational segments at 260–340 km
```

The script must fail rather than normalize/repair invalid values.

- [ ] **Step 4: Extend the claim-audit pattern**

Add case-insensitive matches for:

```text
recommended scenario
best scenario
optimal scenario
safe scenario
risk score
prediction
predicted
will occur
operator rule
real speed restriction
```

Retain existing terms. The audit remains a human-review listing, not a blind keyword failure threshold.

- [ ] **Step 5: Extend browser visual QA for scenario controls and comparison drawer**

After `START SHIFT`, require `.scenario-selector` to exist, be visible, inside viewport and have no uncontrolled horizontal overflow.

Programmatically select `veladero-speed-veladero-05-x080-v1` through the `<select>` and dispatch a bubbling `change` event. Verify the displayed clock text remains unchanged across the selection.

Click `COMPARE`, require `.scenario-comparison-drawer`, and run a generalized contained-drawer inspection equivalent to the Sources drawer rules:

```text
inside viewport
max width <= min(420px, viewport - 20px)
internal vertical scrolling
no uncontrolled horizontal overflow
z-index above operational overlays
```

Require drawer text to include `AUTHORED CHANGE`, `MODEL RESULT`, and `SCENARIO RULE`.

Do this at all existing viewports: `1440×900`, `1024×768`, `390×844`.

The optional Baseline/A/B/C summary table has no QA requirement unless Task 8 actually implements it.

- [ ] **Step 6: GREEN acceptance and static gates**

```bash
npm test -- --run src/qa/v02ScenarioAcceptance.test.ts
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Review every new claim-audit match. Positive prediction/recommendation/safety/operator-policy wording must be corrected before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/qa/v02ScenarioAcceptance.test.ts scripts/validate-data.mjs scripts/audit-claims.mjs scripts/visual-qa.mjs
git commit -m "test: add V0.2 scenario acceptance gates"
```

---

### Task 10: Documentation, Final Verification, and Merge Candidate

**Files:**
- Create: `docs/qa/v0-2-acceptance.md`
- Modify: `README.md`
- Modify if needed: `docs/data-sources.md`

**Interfaces:**
- Documents only behavior proven by the final implementation/acceptance output.

- [ ] **Step 1: Update README from “future WHAT_IF” to implemented V0.2 capability**

Add a concise section explaining:

```text
Baseline + explicit authored scenario rule → deterministic model result → neutral comparison
```

Name the three reference scenarios and state that the environment remains descriptive. Preserve the public boundary that this is not prediction, safety/transitability evaluation, optimization, real dispatch or a validated digital twin.

Do not market the feature as `digital twin`.

- [ ] **Step 2: Update data/source documentation only where scenario artifacts need provenance indexing**

If `docs/data-sources.md` indexes checked-in runtime artifacts, add the scenario catalog and explain its evidence records are `SYNTHETIC_ASSUMPTION`, not territorial/provider evidence. Do not duplicate the full design spec.

- [ ] **Step 3: Run the complete final gate on one HEAD**

```bash
npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Expected: all five commands PASS on the same commit candidate. Record the exact test-file/test counts and any Vite bundle warning from this actual run; do not predeclare counts.

- [ ] **Step 4: Write the acceptance record from actual final-gate evidence**

Create `docs/qa/v0-2-acceptance.md` containing:

- final branch and HEAD SHA;
- exact automated command sequence above;
- actual test-file/test counts from Step 3;
- Baseline exact-regression result;
- A/B/C behavioral acceptance statements;
- scenario provenance/fail-closed result;
- environment-context-only result;
- responsive viewport results;
- the existing GitHub-hosted headless-WebGL limitation, without representing fallback rendering as a Cesium 3D visual pass;
- explicit statement that no prediction/recommendation/safety/transitability claim is accepted.

Use actual values produced in Step 3. Do not write `TBD` fields.

- [ ] **Step 5: Re-run claim audit after documentation**

```bash
npm run audit:claims
```

Review all added documentation matches as negative/explanatory limitations.

- [ ] **Step 6: Commit documentation and re-run full final gate**

```bash
git add README.md docs/data-sources.md docs/qa/v0-2-acceptance.md
git commit -m "docs: record V0.2 scenario engine acceptance"

npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

If `docs/data-sources.md` required no change, omit it from `git add`.

- [ ] **Step 7: Create/update the V0.2 PR as a merge candidate, but do not merge**

PR title:

```text
feat: add Veladero what-if Scenario Engine V0.2
```

PR body must summarize:

```text
- immutable Baseline plus A/B/C explicit authored rules
- deterministic compiler/fingerprint
- existing-engine reuse through injected movement policy
- modelled environment remains context-only
- neutral comparison/no ranking or recommendation
- fail-closed scenario provenance
- final test/validate/audit/build/visual gate evidence
- headless WebGL limitation
```

Leave merge for explicit human approval.

---

## Final Acceptance Checklist

Before requesting merge approval, verify all of the following on the final HEAD:

```text
[ ] V0.1 accepted base confirmed
[ ] veladero-05 is still 260–340 km
[ ] Baseline run/seed identity unchanged
[ ] rules=[] Baseline exact-regression passes
[ ] Scenario A changes departure only
[ ] Scenario B adds only the explicit synthetic km205 +15m REST stop
[ ] Scenario C changes only veladero-05 synthetic speed ×0.80
[ ] non-Veladero highlighted vehicles remain unchanged
[ ] background traffic remains unchanged
[ ] environment can change context-at-passage but cannot alter timing by itself
[ ] missing modelled context remains UNAVAILABLE
[ ] same logical scenario + same inputs produces same fingerprint/result
[ ] reordered rules produce same fingerprint/result
[ ] conflicting/invalid rules fail closed
[ ] every scenario/rule evidence ref resolves to SYNTHETIC_ASSUMPTION
[ ] comparison exposes neutral deltas only
[ ] no prediction/recommendation/risk/safety/transitability/operator-policy claim
[ ] one active scenario / one Cesium world
[ ] switching scenario preserves clock
[ ] Reset preserves scenario selection
[ ] desktop/tablet/mobile QA has no clipping or map obstruction
[ ] full five-command gate passes on one final HEAD
[ ] PR is not merged without explicit approval
```
