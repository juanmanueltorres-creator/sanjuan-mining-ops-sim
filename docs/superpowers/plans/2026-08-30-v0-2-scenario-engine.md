# San Juan Mining Ops Sim — V0.2 Scenario Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use strict RED → GREEN → REFACTOR and review each task before starting the next one.

**Goal:** Add a Veladero-only deterministic What-If Scenario Engine that compiles explicit authored assumptions into the existing simulation, compares their model consequences against an immutable Baseline, and preserves all V0/V0.1 evidence and no-overclaim boundaries.

**Architecture:** Add a scenario layer around the existing engine, not a second simulator. `ScenarioDefinition` is parsed, canonicalized, fingerprinted and compiled into a derived `SanJuanOperationSpec` plus an injected movement policy; the existing engine then produces snapshots/events. Scenario results summarize timings and modelled context-at-passage, and a pure comparison layer emits neutral deltas for a compact map-first UI.

**Tech Stack:** TypeScript + React 19 + Vite 7 + Vitest 3, Zod 4, CesiumJS 1.132, static JSON artifacts, Node 22 ESM validation/QA scripts, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-v0-2-scenario-engine-design.md`

## Global Constraints

- Implementation branch: `feat/v0.2-scenario-engine`, created from `main` **only after V0.1 Road Geometry is merged and accepted**.
- Before Task 1, carry the approved spec and this plan from `design/v0.2-scenario-engine` onto the implementation branch; never implement on the design branch.
- Veladero only. Hualilán and Los Azules remain operationally unchanged.
- Baseline run id is `sanjuan-v0-run-20260830-v1` and baseline seed is `sanjuan-v0-20260830`. If accepted V0.1 intentionally changes either artifact, stop and reconcile the design before implementation.
- V0.1 preserves operational segment `veladero-05` as `260–340 km`; Scenario C targets that exact segment.
- Scenario A: `DEPARTURE_OFFSET +60` for all highlighted Veladero synthetic vehicles.
- Scenario B: one authored synthetic `REST` stop at operational km `205`, dwell `15` minutes, for all highlighted Veladero synthetic vehicles. It is not a real checkpoint claim.
- Scenario C: `SEGMENT_SPEED_MULTIPLIER ×0.80` on `veladero-05`. Because V0.2 has no direction dimension, the multiplier applies **every time a vehicle traverses that segment, outbound and return**.
- Supported rule vocabulary is closed: `DEPARTURE_OFFSET`, `ADD_PLANNED_STOP`, `SEGMENT_SPEED_MULTIPLIER` only.
- `weather describes context but does not automatically alter movement` remains invariant.
- `simulation != real operation`; `road geometry != road condition`; `modelled != observed`; `missing != zero`; `candidate != diagnosis`; `proximity != impact`.
- No prediction, recommendation, ranking, risk/safety score, road-status inference, optimization, RL, Monte Carlo, telemetry, dispatch/FMS integration, route alternatives, or Territorial Score implementation.
- No runtime provider calls are introduced. Scenario definitions/evidence are checked-in static artifacts.
- One active scenario is rendered at a time. No second Cesium Viewer and no simultaneous Baseline/Scenario vehicle overlays.
- Switching scenarios preserves the current simulation clock. Existing Reset semantics do not silently reset scenario selection.
- Baseline with `rules: []` must reproduce existing V0/V0.1 operational snapshots/events exactly.
- Missing environment context remains `UNAVAILABLE`; never substitute zero, previous values, or invented data.
- Every scenario/rule evidence reference resolves fail-closed to `SYNTHETIC_ASSUMPTION` evidence.
- Final gate on one HEAD: `npm test -- --run` → `npm run validate:data` → `npm run audit:claims` → `npm run build` → `npm run qa:visual`.
- Do not merge V0.2 without explicit human approval.

## Execution Preflight

Before Task 1:

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

Verify the accepted V0.1 base contract:

```bash
node - <<'NODE'
const fs = require('fs');
const metadataPath = fs.existsSync('public/data/corridors/veladero/metadata.v2.json')
  ? 'public/data/corridors/veladero/metadata.v2.json'
  : 'public/data/corridors/veladero/metadata.v1.json';
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const segment = metadata.segments.find((item) => item.id === 'veladero-05');
if (!segment || segment.startKm !== 260 || segment.endKm !== 340) {
  throw new Error('Expected veladero-05 to remain exactly 260–340 km');
}
const run = JSON.parse(fs.readFileSync('public/data/runs/sanjuan-v0-run.v1.json', 'utf8'));
if (run.id !== 'sanjuan-v0-run-20260830-v1' || run.seed !== 'sanjuan-v0-20260830') {
  throw new Error(`Baseline run drift: ${run.id}/${run.seed}`);
}
console.log(`V0.2 preflight OK: ${metadataPath}; ${segment.id}; ${run.id}`);
NODE
```

Expected: `V0.2 preflight OK`. Any failure is a design/base-contract drift; stop rather than adapting silently.

---

### Task 1: Scenario Input Contracts and Fail-Closed Schemas

**Files:**
- Create: `src/scenario/contracts.ts`
- Create: `src/scenario/schemas.ts`
- Create: `src/scenario/schemas.test.ts`
- Modify: `src/domain/schemas.ts`

**Interfaces:**
- Consumes: existing `EvidenceRef` and evidence Zod shape.
- Produces: `ScenarioRule`, `ScenarioDefinition`, `ScenarioCatalog`, `parseScenarioDefinition(input)`, `parseScenarioCatalog(input)`.

- [ ] **Step 1: Write RED schema tests**

Create `src/scenario/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseScenarioCatalog, parseScenarioDefinition } from './schemas';

const baseline = {
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

const evidence = (id: string) => ({
  id,
  role: 'SYNTHETIC_ASSUMPTION',
  sourceName: 'San Juan Mining Ops Sim — authored scenario rule',
  retrievedAt: '2026-08-30',
  method: 'Explicit scenario assumption.',
  limitations: ['Not observed operator behavior.'],
});

it('parses the closed three-rule vocabulary', () => {
  const parsed = parseScenarioDefinition({
    ...baseline,
    id: 'combined-v1',
    rules: [
      {
        id: 'departure-plus-60-v1', type: 'DEPARTURE_OFFSET',
        target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
        offsetMinutes: 60, evidenceRefs: ['departure-evidence'],
      },
      {
        id: 'stop-km205-v1', type: 'ADD_PLANNED_STOP',
        target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
        stop: { id: 'scenario-stop-km205-v1', distanceKm: 205, dwellMinutes: 15 },
        evidenceRefs: ['stop-evidence'],
      },
      {
        id: 'speed-veladero-05-v1', type: 'SEGMENT_SPEED_MULTIPLIER',
        target: { corridorId: 'veladero', segmentId: 'veladero-05', scope: 'ALL_CORRIDOR_VEHICLES' },
        multiplier: 0.8, evidenceRefs: ['speed-evidence'],
      },
    ],
  });
  expect(parsed.rules.map((rule) => rule.type)).toEqual([
    'DEPARTURE_OFFSET', 'ADD_PLANNED_STOP', 'SEGMENT_SPEED_MULTIPLIER',
  ]);
});

it('rejects unsupported rule types and multiplier authoring mistakes', () => {
  expect(() => parseScenarioDefinition({
    ...baseline,
    rules: [{ id: 'x', type: 'PREDICT_DELAY', evidenceRefs: ['x'] }],
  })).toThrow();
  expect(() => parseScenarioDefinition({
    ...baseline,
    rules: [{
      id: 'x', type: 'SEGMENT_SPEED_MULTIPLIER',
      target: { corridorId: 'veladero', segmentId: 'veladero-05', scope: 'ALL_CORRIDOR_VEHICLES' },
      multiplier: 80, evidenceRefs: ['x'],
    }],
  })).toThrow();
});

it('requires exactly one empty-rule Baseline and resolvable synthetic evidence', () => {
  const good = parseScenarioCatalog({
    schemaVersion: 'sanjuan.scenario-catalog/v1', id: 'veladero-what-if-v1', corridorId: 'veladero',
    scenarios: [baseline], evidence: [evidence('what-if-baseline-v1')], limitations: [],
  });
  expect(good.scenarios).toHaveLength(1);

  expect(() => parseScenarioCatalog({
    schemaVersion: 'sanjuan.scenario-catalog/v1', id: 'veladero-what-if-v1', corridorId: 'veladero',
    scenarios: [{ ...baseline, evidenceRefs: ['missing'] }], evidence: [], limitations: [],
  })).toThrow(/missing/i);

  expect(() => parseScenarioCatalog({
    schemaVersion: 'sanjuan.scenario-catalog/v1', id: 'veladero-what-if-v1', corridorId: 'veladero',
    scenarios: [baseline, { ...baseline, id: 'second-baseline' }],
    evidence: [evidence('what-if-baseline-v1')], limitations: [],
  })).toThrow(/baseline/i);
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/scenario/schemas.test.ts
```

Expected: FAIL because scenario modules do not exist.

- [ ] **Step 3: Add exact serializable contracts**

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

- [ ] **Step 4: Export the existing evidence Zod schema**

In `src/domain/schemas.ts`, change only `const evidenceRefSchema` to `export const evidenceRefSchema`; do not alter validation semantics.

- [ ] **Step 5: Implement Zod schemas and catalog cross-reference checks**

Use `z.discriminatedUnion('type', ...)` with exact guards:

```ts
offsetMinutes: z.number().int().finite(),
distanceKm: z.number().nonnegative().finite(),
dwellMinutes: z.number().nonnegative().finite(),
multiplier: z.number().min(0.1).max(2).finite(),
```

Use literal values for schema versions, `veladero`, `ALL_CORRIDOR_VEHICLES`, `what-if-v0.1`, and `scenario-rules-v1`.

`parseScenarioCatalog` additionally rejects duplicate scenario ids, duplicate evidence ids, duplicate rule ids in a scenario, missing evidence refs, referenced evidence whose role is not `SYNTHETIC_ASSUMPTION`, and anything other than exactly one empty-rule Baseline.

- [ ] **Step 6: GREEN and commit**

```bash
npm test -- --run src/scenario/schemas.test.ts src/domain/schemas.test.ts
npm run build
git add src/scenario/contracts.ts src/scenario/schemas.ts src/scenario/schemas.test.ts src/domain/schemas.ts
git commit -m "feat: add scenario input contracts and schemas"
```

---

### Task 2: Canonicalization and Deterministic Fingerprints

**Files:**
- Create: `src/scenario/canonicalize.ts`
- Create: `src/scenario/canonicalize.test.ts`

**Interfaces:**
- Consumes: `ScenarioDefinition`, `ScenarioRule`.
- Produces: `canonicalizeScenarioRules(rules)`, `scenarioFingerprint(definition)`.

- [ ] **Step 1: Write RED tests**

```ts
import { describe, expect, it } from 'vitest';
import type { ScenarioDefinition, ScenarioRule } from './contracts';
import { canonicalizeScenarioRules, scenarioFingerprint } from './canonicalize';

const departure: ScenarioRule = {
  id: 'departure-plus-60-v1', type: 'DEPARTURE_OFFSET',
  target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
  offsetMinutes: 60, evidenceRefs: ['departure-evidence'],
};
const stop: ScenarioRule = {
  id: 'stop-km205-v1', type: 'ADD_PLANNED_STOP',
  target: { corridorId: 'veladero', scope: 'ALL_CORRIDOR_VEHICLES' },
  stop: { id: 'scenario-stop-km205-v1', distanceKm: 205, dwellMinutes: 15 },
  evidenceRefs: ['stop-evidence'],
};
const definition = (rules: ScenarioRule[]): ScenarioDefinition => ({
  schemaVersion: 'sanjuan.scenario/v1', id: 'combined-v1', label: 'Combined', corridorId: 'veladero',
  baseRunId: 'sanjuan-v0-run-20260830-v1', scenarioVersion: 'what-if-v0.1',
  ruleSetVersion: 'scenario-rules-v1', seed: 'sanjuan-v0-20260830', rules,
  evidenceRefs: ['scenario-evidence'], limitations: [],
});

it('makes rule order semantically irrelevant', () => {
  expect(canonicalizeScenarioRules([departure, stop])).toEqual(canonicalizeScenarioRules([stop, departure]));
  expect(scenarioFingerprint(definition([departure, stop]))).toBe(scenarioFingerprint(definition([stop, departure])));
});

it('changes identity when a model parameter changes but not when display label changes', () => {
  const original = definition([departure]);
  expect(scenarioFingerprint({ ...original, label: 'Other label' })).toBe(scenarioFingerprint(original));
  expect(scenarioFingerprint(definition([{ ...departure, offsetMinutes: 61 }]))).not.toBe(scenarioFingerprint(original));
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/scenario/canonicalize.test.ts
```

- [ ] **Step 3: Implement stable canonical JSON and FNV-1a 64-bit**

Sort object keys recursively, sort every `evidenceRefs` array, and sort rules by:

```text
type → target.corridorId → target.segmentId-or-empty → id
```

Fingerprint exactly this payload:

```ts
{
  baseRunId: definition.baseRunId,
  scenarioVersion: definition.scenarioVersion,
  ruleSetVersion: definition.ruleSetVersion,
  seed: definition.seed,
  rules: canonicalizeScenarioRules(definition.rules),
}
```

Use deterministic FNV-1a 64-bit with `BigInt`, returning a lowercase 16-character hex string. No timestamp, randomness, browser state, or async provider dependency.

- [ ] **Step 4: GREEN and commit**

```bash
npm test -- --run src/scenario/canonicalize.test.ts
git add src/scenario/canonicalize.ts src/scenario/canonicalize.test.ts
git commit -m "feat: add deterministic scenario fingerprints"
```

---

### Task 3: Centralize Simulation Time Semantics

**Files:**
- Create: `src/simulation/time.ts`
- Create: `src/simulation/time.test.ts`
- Modify: `src/simulation/vehicle.ts`
- Modify: `src/simulation/schedule.ts`
- Modify: `src/simulation/engine.ts`

**Interfaces:**
- Produces: `parseMinuteOfDay`, `formatMinuteOfDay`, `isoAtSimulationMinute`.

- [ ] **Step 1: RED tests**

```ts
import { describe, expect, it } from 'vitest';
import { formatMinuteOfDay, isoAtSimulationMinute, parseMinuteOfDay } from './time';

it('round-trips valid local time', () => {
  expect(parseMinuteOfDay('07:05')).toBe(425);
  expect(formatMinuteOfDay(425)).toBe('07:05');
});
it('rejects invalid clocks', () => {
  expect(() => parseMinuteOfDay('24:00')).toThrow(/Invalid departureTime/);
  expect(() => formatMinuteOfDay(1440)).toThrow(/minute/i);
});
it('builds the existing fixed-offset passage timestamp', () => {
  expect(isoAtSimulationMinute('2026-08-30', 425)).toBe('2026-08-30T07:05:00-03:00');
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/simulation/time.test.ts
```

- [ ] **Step 3: Move existing semantics, not behavior**

Move `parseMinuteOfDay` from `vehicle.ts`, `formatMinuteOfDay` from `schedule.ts`, and `isoAtSimulationMinute`/clock parsing from `engine.ts` into `time.ts`. `formatMinuteOfDay` rejects non-integers and values outside `0..1439` rather than wrapping them.

- [ ] **Step 4: GREEN baseline regression and commit**

```bash
npm test -- --run src/simulation/time.test.ts src/simulation/vehicle.test.ts src/simulation/engine.test.ts src/simulation/events.test.ts src/qa/v0Acceptance.test.ts
npm run build
git add src/simulation/time.ts src/simulation/time.test.ts src/simulation/vehicle.ts src/simulation/schedule.ts src/simulation/engine.ts
git commit -m "refactor: centralize deterministic simulation time"
```

---

### Task 4: Inject a Movement Speed Policy Without Baseline Drift

**Files:**
- Create: `src/simulation/speed.ts`
- Create: `src/simulation/speed.test.ts`
- Modify: `src/simulation/schedule.ts`
- Modify: `src/simulation/vehicle.ts`
- Modify: `src/simulation/events.ts`
- Modify: `src/simulation/engine.ts`
- Modify: `src/qa/v0Acceptance.test.ts`

**Interfaces:**
- Produces: `SpeedResolver`, `MovementPolicy`, `baselineSpeedResolver`, `BASELINE_MOVEMENT_POLICY`, `segmentTravelMinutes`.

- [ ] **Step 1: RED resolver tests**

```ts
import { describe, expect, it } from 'vitest';
import type { CorridorSegment, VehicleDefinition } from '../domain/contracts';
import { baselineSpeedResolver } from './speed';

const vehicle = { id: 'V', type: 'LOGISTICS', corridorId: 'veladero' } as VehicleDefinition;
const segment = { id: 'veladero-05', roadClass: 'highMountain' } as CorridorSegment;

it('preserves current synthetic speed assumptions', () => {
  expect(baselineSpeedResolver(vehicle, segment)).toBe(25);
});
it('fails closed on unsupported road class', () => {
  expect(() => baselineSpeedResolver(vehicle, { ...segment, roadClass: 'unknown' })).toThrow(/Unsupported synthetic road class/);
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/simulation/speed.test.ts
```

- [ ] **Step 3: Move speed-profile responsibility into `speed.ts`**

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

`schedule.ts` may re-export `SPEED_PROFILES`/`SyntheticRoadClass` for compatibility.

- [ ] **Step 4: Thread the resolver through all timing/movement paths**

Use these signatures:

```ts
export function travelMinutesBetween(corridor: CorridorDefinition, vehicle: VehicleDefinition, startKm: number, endKm: number, speedResolver: SpeedResolver = baselineSpeedResolver): number;
export function segmentTravelMinutes(vehicle: VehicleDefinition, segment: CorridorSegment, speedResolver: SpeedResolver = baselineSpeedResolver): number;
export function getVehicleTiming(vehicle: VehicleDefinition, corridor: CorridorDefinition, speedResolver: SpeedResolver = baselineSpeedResolver): VehicleTiming;
export function outboundPassageMinuteAtDistance(vehicle: VehicleDefinition, corridor: CorridorDefinition, requestedDistanceKm: number, speedResolver: SpeedResolver = baselineSpeedResolver): number;
export function snapshotVehicle(vehicle: VehicleDefinition, corridor: CorridorDefinition, simMinute: number, speedResolver: SpeedResolver = baselineSpeedResolver): VehicleSnapshot;
export function deriveOperationalEvents(vehicle: VehicleDefinition, corridor: CorridorDefinition, speedResolver: SpeedResolver = baselineSpeedResolver): OperationalEvent[];
```

Update engine signature:

```ts
export function getOperationalSnapshot(
  spec: SanJuanOperationSpec,
  run: OperationalRun,
  simMinute: number,
  environment?: EnvironmentSnapshot,
  movementPolicy: MovementPolicy = BASELINE_MOVEMENT_POLICY,
): OperationalSnapshot;
```

- [ ] **Step 5: Add explicit no-drift acceptance**

At every existing `CHECKPOINTS` minute in `src/qa/v0Acceptance.test.ts`:

```ts
expect(getOperationalSnapshot(spec, artifacts.run, minuteOfDay, artifacts.environment, BASELINE_MOVEMENT_POLICY))
  .toEqual(getOperationalSnapshot(spec, artifacts.run, minuteOfDay, artifacts.environment));
```

- [ ] **Step 6: GREEN and commit**

```bash
npm test -- --run src/simulation/speed.test.ts src/simulation/vehicle.test.ts src/simulation/events.test.ts src/simulation/engine.test.ts src/qa/v0Acceptance.test.ts
npm run build
git add src/simulation/speed.ts src/simulation/speed.test.ts src/simulation/schedule.ts src/simulation/vehicle.ts src/simulation/events.ts src/simulation/engine.ts src/qa/v0Acceptance.test.ts
git commit -m "refactor: inject deterministic movement speed policy"
```

---

### Task 5: Pure Scenario Compiler

**Files:**
- Create: `src/scenario/compiler.ts`
- Create: `src/scenario/compiler.test.ts`

**Interfaces:**
- Produces: `ScenarioCompilation`, `compileScenario(definition, baselineSpec, run, scenarioEvidence)`.

- [ ] **Step 1: Write a concrete checked-in baseline loader inside the test**

At top of `compiler.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildV0OperationSpec } from '../data/buildOperationSpec';
import { loadStaticOperationData, loadStaticRunArtifacts, loadTrafficCalibration, type JsonFetcher } from '../data/loadOperation';

const fileFetcher: JsonFetcher = async (url) => {
  try {
    const body = JSON.parse(await readFile(path.join(process.cwd(), 'public', url.replace(/^\//, '')), 'utf8'));
    return { ok: true, json: async () => body };
  } catch {
    return { ok: false, json: async () => ({}) };
  }
};

async function checkedInBaseline() {
  const [operation, artifacts, traffic] = await Promise.all([
    loadStaticOperationData(fileFetcher), loadStaticRunArtifacts(fileFetcher), loadTrafficCalibration(fileFetcher),
  ]);
  return { spec: buildV0OperationSpec(operation, artifacts.run.seed, traffic), run: artifacts.run };
}
```

- [ ] **Step 2: RED compiler tests with executable assertions**

Use a helper that returns one `SYNTHETIC_ASSUMPTION` evidence record per requested id. Then test:

```ts
it('keeps an empty Baseline immutable', async () => {
  const { spec, run } = await checkedInBaseline();
  const before = JSON.stringify(spec);
  const definition = baselineDefinition(run.id, run.seed);
  const compilation = compileScenario(definition, spec, run, scenarioEvidence(definition));
  expect(compilation.appliedRuleIds).toEqual([]);
  expect(compilation.effectiveSpec).toEqual(spec);
  expect(JSON.stringify(spec)).toBe(before);
});

it('adds +60 only to Veladero departures', async () => {
  const { spec, run } = await checkedInBaseline();
  const definition = departureDefinition(run.id, run.seed, 60);
  const compilation = compileScenario(definition, spec, run, scenarioEvidence(definition));
  for (let i = 0; i < spec.fleet.length; i += 1) {
    const before = spec.fleet[i];
    const after = compilation.effectiveSpec.fleet[i];
    if (before.corridorId === 'veladero') {
      expect(parseMinuteOfDay(after.departureTime) - parseMinuteOfDay(before.departureTime)).toBe(60);
    } else {
      expect(after).toEqual(before);
    }
  }
});

it('adds the exact synthetic REST stop at km 205', async () => {
  const { spec, run } = await checkedInBaseline();
  const definition = stopDefinition(run.id, run.seed);
  const compilation = compileScenario(definition, spec, run, scenarioEvidence(definition));
  const veladero = compilation.effectiveSpec.fleet.filter((vehicle) => vehicle.corridorId === 'veladero');
  expect(veladero.length).toBeGreaterThan(0);
  for (const vehicle of veladero) {
    expect(vehicle.plannedStops).toContainEqual(expect.objectContaining({
      id: 'veladero-simulated-stop-km205-v1', type: 'REST', distanceKm: 205, dwellMinutes: 15, synthetic: true,
    }));
  }
});

it('multiplies only veladero-05 on every traversal', async () => {
  const { spec, run } = await checkedInBaseline();
  const definition = speedDefinition(run.id, run.seed);
  const compilation = compileScenario(definition, spec, run, scenarioEvidence(definition));
  const vehicle = compilation.effectiveSpec.fleet.find((item) => item.corridorId === 'veladero')!;
  const corridor = spec.corridors.find((item) => item.id === 'veladero')!;
  const target = corridor.segments.find((item) => item.id === 'veladero-05')!;
  const other = corridor.segments.find((item) => item.id === 'veladero-04')!;
  expect(compilation.movementPolicy.speedResolver(vehicle, target)).toBeCloseTo(baselineSpeedResolver(vehicle, target) * 0.8, 10);
  expect(compilation.movementPolicy.speedResolver(vehicle, other)).toBe(baselineSpeedResolver(vehicle, other));
});
```

Also add explicit `toThrow` tests for mismatched `baseRunId`, mismatched seed, duplicate departure rules, two speed rules on `veladero-05`, unknown segment, stop distance beyond corridor end, duplicate stop id, departure outside `360..1200`, unresolved evidence, and evidence role other than `SYNTHETIC_ASSUMPTION`.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/scenario/compiler.test.ts
```

- [ ] **Step 4: Define and implement compilation**

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

Validate before transformation:

```text
definition.baseRunId === run.id
definition.seed === run.seed
baselineSpec.seed === run.seed
definition.corridorId === veladero
all referenced scenario evidence exists and role === SYNTHETIC_ASSUMPTION
```

Reject duplicate rule ids; multiple departure offsets on the all-Veladero target; multiple speed multipliers on the same segment; duplicate added-stop ids; collisions with existing planned-stop ids; unknown segments; stop outside `0..corridorEnd`; and transformed departures outside `spec.schedule.startMinute..endMinute`.

Apply canonical rules from Task 2. Departure changes use Task 3 time helpers. Added stop materializes exactly:

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

Speed policy wraps `baselineSpeedResolver`; multiplier is selected by `segment.id`, so return travel through `veladero-05` receives the same ×0.80 rule. Keep `effectiveSpec.scenarioId` equal to Baseline; scenario identity lives in `ScenarioCompilation`.

- [ ] **Step 5: GREEN and commit**

```bash
npm test -- --run src/scenario/compiler.test.ts src/simulation/vehicle.test.ts src/qa/v0Acceptance.test.ts
npm run build
git add src/scenario/compiler.ts src/scenario/compiler.test.ts
git commit -m "feat: add pure Veladero scenario compiler"
```

---

### Task 6: Versioned Baseline/A/B/C Catalog and Loader

**Files:**
- Create: `public/data/scenarios/veladero-scenarios.v1.json`
- Create: `src/scenario/loadScenarioCatalog.ts`
- Create: `src/scenario/loadScenarioCatalog.test.ts`

**Interfaces:**
- Produces: `SCENARIO_CATALOG_URL`, `loadScenarioCatalog(fetcher)`.

- [ ] **Step 1: RED loader test with a complete inline catalog**

```ts
import { describe, expect, it } from 'vitest';
import { loadScenarioCatalog, SCENARIO_CATALOG_URL } from './loadScenarioCatalog';

it('loads a parsed versioned catalog', async () => {
  const doc = {
    schemaVersion: 'sanjuan.scenario-catalog/v1', id: 'veladero-what-if-v1', corridorId: 'veladero',
    scenarios: [{
      schemaVersion: 'sanjuan.scenario/v1', id: 'veladero-baseline-v1', label: 'Baseline', corridorId: 'veladero',
      baseRunId: 'sanjuan-v0-run-20260830-v1', scenarioVersion: 'what-if-v0.1', ruleSetVersion: 'scenario-rules-v1',
      seed: 'sanjuan-v0-20260830', rules: [], evidenceRefs: ['what-if-baseline-v1'], limitations: [],
    }],
    evidence: [{
      id: 'what-if-baseline-v1', role: 'SYNTHETIC_ASSUMPTION', sourceName: 'Scenario baseline', retrievedAt: '2026-08-30',
      method: 'No-op baseline wrapper.', limitations: ['Not observed operator behavior.'],
    }], limitations: [],
  };
  const catalog = await loadScenarioCatalog(async (url) => ({ ok: url === SCENARIO_CATALOG_URL, json: async () => doc }));
  expect(catalog.id).toBe('veladero-what-if-v1');
  expect(catalog.scenarios[0].rules).toEqual([]);
});

it('fails closed when the static resource is unavailable', async () => {
  await expect(loadScenarioCatalog(async () => ({ ok: false, json: async () => ({}) }))).rejects.toThrow(/unavailable/i);
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/scenario/loadScenarioCatalog.test.ts
```

- [ ] **Step 3: Check in exact production scenario definitions**

The catalog contains exactly:

```text
veladero-baseline-v1
  rules=[]

veladero-departure-plus-60-v1
  DEPARTURE_OFFSET offsetMinutes=60

veladero-stop-km205-plus-15-v1
  ADD_PLANNED_STOP stop.id=veladero-simulated-stop-km205-v1 distanceKm=205 dwellMinutes=15

veladero-speed-veladero-05-x080-v1
  SEGMENT_SPEED_MULTIPLIER segmentId=veladero-05 multiplier=0.8
```

All use `baseRunId=sanjuan-v0-run-20260830-v1`, `scenarioVersion=what-if-v0.1`, `ruleSetVersion=scenario-rules-v1`, `seed=sanjuan-v0-20260830`, `corridorId=veladero`.

Evidence records are exactly:

```text
what-if-baseline-v1
what-if-departure-plus-60-v1
what-if-stop-km205-plus-15-v1
what-if-speed-veladero-05-x080-v1
```

All are `SYNTHETIC_ASSUMPTION`. Each limitation explicitly says the scenario is authored/synthetic and not observed operator behavior, road condition, safety/transitability policy, or recommendation. The stop evidence says km 205 is a simulated REST stop, not a real checkpoint.

- [ ] **Step 4: Implement loader**

```ts
export const SCENARIO_CATALOG_URL = '/data/scenarios/veladero-scenarios.v1.json';

export async function loadScenarioCatalog(fetcher: JsonFetcher): Promise<ScenarioCatalog> {
  const response = await fetcher(SCENARIO_CATALOG_URL);
  if (!response.ok) throw new Error(`Scenario catalog unavailable: ${SCENARIO_CATALOG_URL}`);
  return parseScenarioCatalog(await response.json());
}
```

- [ ] **Step 5: GREEN and commit**

```bash
npm test -- --run src/scenario/loadScenarioCatalog.test.ts src/scenario/schemas.test.ts
npm run build
git add public/data/scenarios/veladero-scenarios.v1.json src/scenario/loadScenarioCatalog.ts src/scenario/loadScenarioCatalog.test.ts
git commit -m "feat: add versioned Veladero what-if scenarios"
```

---

### Task 7: Deterministic Scenario Results and Neutral Comparison

**Files:**
- Create: `src/scenario/results.ts`
- Create: `src/scenario/results.test.ts`

**Interfaces:**
- Produces: `ScenarioResult`, `ScenarioComparison`, `buildScenarioResult`, `compareScenarioResults`.

- [ ] **Step 1: Define RED behavioral assertions against Baseline/A/B/C**

Use the real checked-in catalog with the same filesystem-fetch pattern as Task 5. Compile all four definitions. Assert:

```ts
const baselineResult = buildScenarioResult(baselineCompilation, run, environment);
const aResult = buildScenarioResult(aCompilation, run, environment);
const bResult = buildScenarioResult(bCompilation, run, environment);
const cResult = buildScenarioResult(cCompilation, run, environment);

expect(aResult.corridorSummary.lastProjectArrivalMinute - baselineResult.corridorSummary.lastProjectArrivalMinute).toBe(60);
expect(aResult.vehicleTimings.map((item) => item.totalCycleMinutes)).toEqual(baselineResult.vehicleTimings.map((item) => item.totalCycleMinutes));

const bComparison = compareScenarioResults(baselineResult, bResult);
expect(bComparison.vehicleDeltas.every((item) => item.dwellDeltaMinutes === 15)).toBe(true);
expect(bComparison.vehicleDeltas.every((item) => item.projectArrivalDeltaMinutes === 15)).toBe(true);

const cComparison = compareScenarioResults(baselineResult, cResult);
expect(cComparison.vehicleDeltas.every((item) =>
  item.segmentTimeDeltas.filter((segment) => Math.abs(segment.deltaMinutes) > 1e-9)
    .every((segment) => segment.segmentId === 'veladero-05'),
)).toBe(true);
expect(cComparison.vehicleDeltas.every((item) => item.baseArrivalDeltaMinutes > item.projectArrivalDeltaMinutes)).toBe(true);
```

The final assertion proves Scenario C also affects the return traversal of the target segment.

Also assert two independent builds and comparisons deep-equal exactly.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/scenario/results.test.ts
```

- [ ] **Step 3: Implement exact result contracts**

```ts
export interface ScenarioSegmentTiming { segmentId: string; minutes: number }
export interface ScenarioVehicleTiming {
  vehicleId: string; type: VehicleType; departureMinute: number; projectArrivalMinute: number;
  returnStartMinute: number; baseArrivalMinute: number; totalCycleMinutes: number;
  plannedDwellMinutes: number; segmentTimings: ScenarioSegmentTiming[];
}
export interface ScenarioPassageContext {
  vehicleId: string; nodeId: string; passageMinute: number; environment: EnvironmentContext;
}
export interface ScenarioCorridorSummary {
  corridorId: 'veladero'; vehicleCount: number; firstDepartureMinute: number;
  lastProjectArrivalMinute: number; lastBaseArrivalMinute: number;
  totalPlannedDwellMinutes: number; maxElevationM: number;
}
export interface ScenarioResult {
  scenarioId: string; baseRunId: string; corridorId: 'veladero'; environmentSnapshotId: string;
  seed: string | number; fingerprint: string; appliedRuleIds: string[];
  vehicleTimings: ScenarioVehicleTiming[]; corridorSummary: ScenarioCorridorSummary;
  passageContexts: ScenarioPassageContext[]; evidenceRefs: string[]; limitations: string[];
}
```

Comparison types:

```ts
export interface ScenarioSegmentTimeDelta { segmentId: string; baselineMinutes: number; scenarioMinutes: number; deltaMinutes: number }
export interface ScenarioVehicleDelta {
  vehicleId: string; departureDeltaMinutes: number; projectArrivalDeltaMinutes: number;
  baseArrivalDeltaMinutes: number; totalCycleDeltaMinutes: number; dwellDeltaMinutes: number;
  segmentTimeDeltas: ScenarioSegmentTimeDelta[];
}
export interface ScenarioCorridorDelta {
  firstDepartureDeltaMinutes: number; lastProjectArrivalDeltaMinutes: number;
  lastBaseArrivalDeltaMinutes: number; totalPlannedDwellDeltaMinutes: number;
}
export interface PassageContextChange {
  vehicleId: string; nodeId: string; baselinePassageMinute: number; scenarioPassageMinute: number;
  baseline: EnvironmentContext; scenario: EnvironmentContext;
}
export interface ScenarioComparison {
  baselineScenarioId: string; comparedScenarioId: string; corridorDelta: ScenarioCorridorDelta;
  vehicleDeltas: ScenarioVehicleDelta[]; passageContextChanges: PassageContextChange[];
  unchangedTerritorialDimensions: Array<'corridorGeometry' | 'elevationProfile' | 'environmentSnapshot' | 'seed'>;
  appliedRuleIds: string[];
}
```

No score/ranking/recommendation/probability fields.

- [ ] **Step 4: Implement result calculation**

```ts
export function buildScenarioResult(
  compilation: ScenarioCompilation,
  run: OperationalRun,
  environment: EnvironmentSnapshot,
): ScenarioResult;
```

Validate compilation/run/environment identity. Filter effective fleet to Veladero. For each vehicle use `getVehicleTiming(..., resolver)`, sum planned dwell, and calculate every operational segment with `segmentTravelMinutes(vehicle, segment, resolver)`.

For each existing Veladero corridor node:

```ts
const passageMinute = outboundPassageMinuteAtDistance(vehicle, corridor, node.distanceKm, resolver);
const context = environmentAtPassage(
  environment, corridor.id, node.distanceKm, isoAtSimulationMinute(run.targetDate, passageMinute),
);
```

Preserve `UNAVAILABLE` as-is.

- [ ] **Step 5: Implement pure comparison**

```ts
export function compareScenarioResults(baseline: ScenarioResult, scenario: ScenarioResult): ScenarioComparison;
```

Reject mismatched baseRunId, corridorId, environmentSnapshotId, seed, or vehicle-id sets. Pair passage contexts by `vehicleId + nodeId`. Set held constants to:

```ts
['corridorGeometry', 'elevationProfile', 'environmentSnapshot', 'seed']
```

- [ ] **Step 6: Environment boundary test**

Deep-clone the same environment artifact, change numeric weather values while keeping identity/timestamps, rebuild results, and assert all `vehicleTimings` deep-equal while at least one available `passageContexts[].environment` value differs.

- [ ] **Step 7: GREEN and commit**

```bash
npm test -- --run src/scenario/results.test.ts src/environment/lookup.test.ts src/simulation/vehicle.test.ts
npm run build
git add src/scenario/results.ts src/scenario/results.test.ts
git commit -m "feat: add deterministic scenario comparison results"
```

---

### Task 8: Runtime Adapter and Map-First Scenario UI

**Files:**
- Create: `src/scenario/runtime.ts`
- Create: `src/scenario/runtime.test.ts`
- Create: `src/ui/ScenarioSelector.tsx`
- Create: `src/ui/ScenarioSelector.test.tsx`
- Create: `src/ui/ScenarioComparisonDrawer.tsx`
- Create: `src/ui/ScenarioComparisonDrawer.test.tsx`
- Create: `src/ui/scenario.css`
- Create: `src/app/App.scenario.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `getScenarioSnapshot(compilation, run, simMinute, environment)`.
- UI consumes parsed scenario/result/comparison data only; no model rule is implemented in React.

- [ ] **Step 1: RED runtime adapter test**

```ts
it('delegates to the existing engine with effective spec and movement policy', () => {
  expect(getScenarioSnapshot(compilation, run, 630, environment)).toEqual(
    getOperationalSnapshot(compilation.effectiveSpec, run, 630, environment, compilation.movementPolicy),
  );
});
```

- [ ] **Step 2: Implement the adapter exactly**

```ts
export function getScenarioSnapshot(
  compilation: ScenarioCompilation,
  run: OperationalRun,
  simMinute: number,
  environment: EnvironmentSnapshot,
): OperationalSnapshot {
  return getOperationalSnapshot(compilation.effectiveSpec, run, simMinute, environment, compilation.movementPolicy);
}
```

- [ ] **Step 3: RED component tests**

`ScenarioSelector.test.tsx` renders four supplied definitions and asserts the selected id reaches `onChange`. It also asserts rendered text does not match `/prediction|recommended|optimal/i`.

`ScenarioComparisonDrawer.test.tsx` renders a concrete `ScenarioComparison` fixture and asserts visible text includes `AUTHORED CHANGE`, `MODEL RESULT`, `WHY THIS CHANGED`, `HELD CONSTANT`, signed minute deltas, and `SCENARIO RULE`; an `UNAVAILABLE` passage context displays `UNAVAILABLE` and never `0`. Assert absence of `/best|recommended|safe|risk score/i`.

- [ ] **Step 4: Verify RED**

```bash
npm test -- --run src/scenario/runtime.test.ts src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.test.tsx
```

- [ ] **Step 5: Implement compact components**

```ts
export interface ScenarioSelectorProps {
  scenarios: ScenarioDefinition[];
  value: string;
  disabled?: boolean;
  onChange: (scenarioId: string) => void;
}
```

Render `.scenario-selector` with `<select aria-label="Scenario">`.

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

Use `.scenario-comparison-drawer` and `.scenario-comparison-scroll`; width max `min(420px, viewport - 20px)`. Show fleet-level last project arrival, last base arrival, affected vehicles, per-vehicle delta range, changed segment delta ranges, applied rule identity, and held constants. Delta styling stays semantically neutral.

- [ ] **Step 6: Add executable App integration tests**

In `App.scenario.test.tsx`, mock existing static fetch responses plus the scenario catalog and assert:

```ts
expect(await screen.findByLabelText('Scenario')).toHaveValue('veladero-baseline-v1');
await user.selectOptions(screen.getByLabelText('Scenario'), 'veladero-departure-plus-60-v1');
expect(screen.getByLabelText('Scenario')).toHaveValue('veladero-departure-plus-60-v1');
expect(screen.getByRole('button', { name: 'COMPARE' })).toBeInTheDocument();
```

Capture displayed command time before selection and assert the same text afterward. Click Reset and assert the selected scenario remains `veladero-departure-plus-60-v1`.

Add a second test where scenario catalog fetch returns `ok:false`; assert the existing operational UI remains usable and text contains `SCENARIOS · UNAVAILABLE` while A/B/C options are not rendered.

- [ ] **Step 7: Integrate in `App.tsx` with a fail-closed scenario layer**

Load the catalog separately from operation/run/traffic so catalog failure cannot take down Baseline.

Build a pure memoized compilation state:

```ts
const compiledScenarios = useMemo(() => {
  if (!catalog || !spec || !runArtifacts) return { items: new Map<string, ScenarioCompilation>(), error: null as string | null };
  try {
    return {
      items: new Map(catalog.scenarios.map((definition) => [
        definition.id,
        compileScenario(definition, spec, runArtifacts.run, catalog.evidence),
      ])),
      error: null,
    };
  } catch (error) {
    return { items: new Map<string, ScenarioCompilation>(), error: error instanceof Error ? error.message : 'Scenario compilation unavailable' };
  }
}, [catalog, spec, runArtifacts]);
```

When catalog first loads, initialize `selectedScenarioId` to its unique empty-rule Baseline only if selection is still null. Scenario selection never calls `setClock`; Reset never calls `setSelectedScenarioId`.

If a valid active compilation exists, snapshot uses `getScenarioSnapshot`. If catalog/compilation is unavailable, use the existing Baseline `getOperationalSnapshot(...)` path and surface `SCENARIOS · UNAVAILABLE`.

Background traffic remains unchanged and continues from the immutable run seed.

Precompute Baseline/active `ScenarioResult` and `ScenarioComparison`. Render `COMPARE` only for a non-empty-rule active scenario. Do not implement the optional four-column A/B/C table in this slice.

- [ ] **Step 8: GREEN and commit**

```bash
npm test -- --run src/scenario/runtime.test.ts src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.test.tsx src/app/App.scenario.test.tsx
npm run build
git add src/scenario/runtime.ts src/scenario/runtime.test.ts src/ui/ScenarioSelector.tsx src/ui/ScenarioSelector.test.tsx src/ui/ScenarioComparisonDrawer.tsx src/ui/ScenarioComparisonDrawer.test.tsx src/ui/scenario.css src/app/App.tsx src/app/App.scenario.test.tsx
git commit -m "feat: add map-first what-if scenario experience"
```

---

### Task 9: Checked-In Acceptance, Data Validation, Claims Audit, and Visual QA

**Files:**
- Create: `src/qa/v02ScenarioAcceptance.test.ts`
- Modify: `scripts/validate-data.mjs`
- Modify: `scripts/audit-claims.mjs`
- Modify: `scripts/visual-qa.mjs`

**Interfaces:**
- Acceptance uses the same checked-in catalog used by production; no hand-built alternate scenario definitions.

- [ ] **Step 1: Add full V0.2 acceptance replay**

Load the checked-in operation/run/environment/traffic/catalog. Compile all four scenarios. At existing checkpoints `360, 540, 720, 960, 1200`, require empty-rule Baseline snapshots/events to deep-equal the existing default engine path.

Also assert:

```ts
expect(aVeladero.every((after, index) => parseMinuteOfDay(after.departureTime) - parseMinuteOfDay(baseVeladero[index].departureTime) === 60)).toBe(true);
expect(nonVeladeroAfter).toEqual(nonVeladeroBefore);
expect(bComparison.vehicleDeltas.every((item) => item.dwellDeltaMinutes === 15 && item.projectArrivalDeltaMinutes === 15)).toBe(true);
expect(cComparison.vehicleDeltas.every((item) => item.projectArrivalDeltaMinutes > 0)).toBe(true);
expect(cComparison.vehicleDeltas.every((item) => item.baseArrivalDeltaMinutes > item.projectArrivalDeltaMinutes)).toBe(true);
expect(JSON.stringify(firstReplay)).toBe(JSON.stringify(secondReplay));
```

Resolve every scenario/rule evidence id against catalog evidence and assert role `SYNTHETIC_ASSUMPTION`.

- [ ] **Step 2: Extend `validate:data` with exact catalog invariants**

Load `public/data/scenarios/veladero-scenarios.v1.json`; require exact four scenario ids, one empty Baseline, every `baseRunId===run.id`, every `seed===run.seed`, every evidence ref resolved with `SYNTHETIC_ASSUMPTION`, Scenario A offset `60`, Scenario B stop `205/15`, Scenario C target `veladero-05` multiplier `0.8`, and loaded Veladero operational segment `veladero-05` exactly `260–340`.

- [ ] **Step 3: Extend claim-audit vocabulary**

Add these case-insensitive terms to the existing pattern:

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

The script still lists findings for human review; it is not converted into a naive zero-match gate.

- [ ] **Step 4: Extend browser visual QA**

After `START SHIFT`, include `.scenario-selector` in core layout inspection. Read `.command-time` text, programmatically select `veladero-speed-veladero-05-x080-v1`, dispatch bubbling `change`, and assert `.command-time` text did not change.

Click `COMPARE`; require `.scenario-comparison-drawer` and `.scenario-comparison-scroll`. Apply the same contained-drawer rules as Sources: viewport-contained, width ≤ `min(420px, viewport-20px)`, internal vertical scroll, no uncontrolled horizontal overflow, z-index above operational overlays. Require drawer text to contain `AUTHORED CHANGE`, `MODEL RESULT`, `SCENARIO RULE`.

Run at `1440×900`, `1024×768`, `390×844`. No QA requirement for the optional A/B/C summary table because it is not implemented in Task 8.

- [ ] **Step 5: Run complete task gate and review claims**

```bash
npm test -- --run src/qa/v02ScenarioAcceptance.test.ts
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Every new claim-audit match must be negative/explanatory or an explicit limitation. Positive prediction/recommendation/safety/operator-policy wording must be changed.

- [ ] **Step 6: Commit**

```bash
git add src/qa/v02ScenarioAcceptance.test.ts scripts/validate-data.mjs scripts/audit-claims.mjs scripts/visual-qa.mjs
git commit -m "test: add V0.2 scenario acceptance gates"
```

---

### Task 10: Documentation, Final Gate, and Merge Candidate

**Files:**
- Create: `docs/qa/v0-2-acceptance.md`
- Modify: `README.md`
- Modify only if it indexes runtime artifacts: `docs/data-sources.md`

**Interfaces:**
- Documentation records only behavior proved by final execution.

- [ ] **Step 1: Update README**

Add the implemented chain:

```text
Baseline + explicit authored scenario rule
→ deterministic model result
→ neutral comparison
```

Name A/B/C. State explicitly that modelled weather remains descriptive, and the feature is not prediction, optimization, recommendation, safety/transitability evaluation, real dispatch, or a validated digital twin. Do not market V0.2 as `digital twin`.

- [ ] **Step 2: Run full gate on one candidate HEAD**

```bash
npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Capture the actual test-file/test counts and any build warning from this run; do not invent planned counts.

- [ ] **Step 3: Write `docs/qa/v0-2-acceptance.md` from actual evidence**

Record the final branch/HEAD, exact five-command sequence, actual test counts, Baseline exact regression, A/B/C semantics, environment-context-only result, provenance/fail-closed result, three viewport results, existing headless-WebGL limitation, and explicit no-prediction/no-recommendation/no-safety conclusion. Do not use `TBD` fields.

If `docs/data-sources.md` indexes checked-in runtime artifacts, add `veladero-scenarios.v1.json` there and identify its evidence as `SYNTHETIC_ASSUMPTION`; otherwise leave that file unchanged.

- [ ] **Step 4: Commit docs and re-run the full gate**

```bash
git add README.md docs/qa/v0-2-acceptance.md
if git diff --quiet -- docs/data-sources.md; then :; else git add docs/data-sources.md; fi
git commit -m "docs: record V0.2 scenario engine acceptance"

npm test -- --run
npm run validate:data
npm run audit:claims
npm run build
npm run qa:visual
```

Expected: all five commands PASS on the same documentation-inclusive HEAD.

- [ ] **Step 5: Create/update a draft merge-candidate PR; do not merge**

Title:

```text
feat: add Veladero what-if Scenario Engine V0.2
```

Body must report immutable Baseline + A/B/C rules, deterministic compiler/fingerprint, existing-engine reuse through movement policy, context-only environment boundary, neutral comparison/no ranking, fail-closed provenance, final gate evidence, and headless-WebGL limitation.

Stop for explicit human merge approval.

---

## Final Acceptance Checklist

```text
[ ] accepted V0.1 base confirmed
[ ] veladero-05 remains exactly 260–340 km
[ ] baseline run/seed identity unchanged
[ ] rules=[] Baseline exact regression passes
[ ] Scenario A changes Veladero departures only
[ ] Scenario B adds only synthetic km205 +15m REST dwell
[ ] Scenario C changes only veladero-05 speed ×0.80 on outbound and return traversal
[ ] non-Veladero highlighted vehicles unchanged
[ ] background traffic unchanged
[ ] environment changes context-at-passage but cannot alter timing by itself
[ ] missing modelled context remains UNAVAILABLE
[ ] same logical inputs produce same fingerprint/result
[ ] reordered rules produce same fingerprint/result
[ ] conflicting/invalid rules fail closed
[ ] every scenario/rule ref resolves to SYNTHETIC_ASSUMPTION
[ ] comparison exposes neutral deltas only
[ ] no prediction/recommendation/risk/safety/transitability/operator-policy claim
[ ] one active scenario / one Cesium world
[ ] switching scenario preserves clock
[ ] Reset preserves scenario selection
[ ] desktop/tablet/mobile QA has no clipping or map obstruction
[ ] full five-command gate passes on one final HEAD
[ ] PR is not merged without explicit approval
```
