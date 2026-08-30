# San Juan Mining Ops Sim — V0.2 Scenario Engine Design

Date: 2026-08-30
Status: Approved design, pre-implementation
Repository: `juanmanueltorres-creator/sanjuan-mining-ops-sim`
Design branch: `design/v0.2-scenario-engine`
Implementation target: `feat/v0.2-scenario-engine` after V0.1 Road Geometry is merged and accepted

## 1. Purpose

V0 established a deterministic, source-aware simulation of synthetic mining mobilizations across San Juan territory. V0.1 improves the spatial fidelity and provenance of the Veladero corridor without changing operational semantics.

V0.2 introduces a small, explicit what-if layer over the existing deterministic simulation. The objective is not prediction, dispatch, optimization, or a real digital twin. The objective is to ask a narrower and auditable question:

> Holding the territorial state and baseline run constant, what changes inside the model when one explicit operational assumption is changed?

Conceptually:

```text
S(t) + A(t) → S(t+1)
```

The real system remains open, uncertain and only partially observable. Therefore V0.2 does not claim that the resulting state will occur in reality. It only calculates consequences within the declared model.

Core statement:

> Territory defines the state. Scenario rules define the hypothetical. The simulator calculates the consequences inside the model.

V0.2 may be described internally as an experimental micro-digital-twin or territorial scenario simulation, but `digital twin` is not a public operational claim for this release.

## 2. Product Boundary

### V0.2 includes

- Veladero only.
- One immutable Baseline scenario.
- Three explicit authored what-if scenarios:
  - departure offset;
  - additional simulated planned stop;
  - segment-level synthetic speed multiplier.
- Deterministic scenario compilation.
- Versioned scenario definitions and rule-set identity.
- Scenario fingerprinting from canonical inputs.
- Reuse of the existing V0 simulation engine.
- Scenario summaries and neutral deltas against Baseline.
- Modelled environment context evaluated at the resulting passage time.
- Compact map-first scenario selection and comparison UI.
- Explicit provenance and fail-closed validation for every scenario rule.
- Exact regression protection that an empty rule set preserves V0 behavior.

### Explicitly out of scope

- Real prediction.
- Safety score, road-risk score or operational recommendation.
- Automatic optimization or route selection.
- Reinforcement learning.
- Monte Carlo or large stochastic ensembles.
- Real telemetry or GPS ingestion.
- Mine dispatch/FMS integration.
- Autonomous or semi-autonomous decisions.
- Road opening/closure, transitability, authorization or condition inference.
- Weather-driven automatic movement changes.
- Automatic generation of scenario rules from environmental signals.
- Multi-corridor scenario authoring.
- Alternative-route comparison.
- Real checkpoints or private-company operational claims.
- Territorial Score implementation inside this repository.
- `digital twin` as a marketing or operational-validation claim.

V0.2 is a scenario-comparison foundation, not an operational decision engine.

## 3. Relationship to V0, V0.1 and Territorial Systems

The architectural sequence is:

```text
V0     deterministic baseline simulator
V0.1   higher-fidelity Veladero road geometry
V0.2   explicit what-if scenario engine
```

V0.2 must not be mixed into the V0.1 Road Geometry pull request. Implementation begins only after V0.1 is merged and its final acceptance gates are green.

The broader conceptual relationship remains:

```text
GeoPlatform / public sources
            ↓
future Territorial Score
            ↓
Territorial state artifact
            ↓
Mining Ops scenario simulator
```

This repository does not absorb GeoPlatform or Territorial Score. It consumes already-resolved territorial artifacts through stable domain contracts.

The long-term responsibility split is:

```text
Territorial Score
→ constructs or represents territorial state S(t)

Mining Ops Sim
→ evolves a synthetic operation over that state under explicit authored rules
```

## 4. Existing Boundaries That Remain In Force

V0.2 preserves the following rules exactly:

```text
weather describes context but does not automatically alter movement
simulation != real operation
road geometry != road condition
modelled != observed
missing != zero
candidate != diagnosis
proximity != impact
```

V0.2 must not infer:

- safety;
- transitability;
- opening or closure;
- real road condition;
- operational authorization;
- aggregate risk;
- operator policy;
- company-specific speed restrictions.

If a future rule modifies movement, that rule must be explicit, versioned and displayed as a scenario assumption.

## 5. Architectural Overview

V0.2 adds a scenario layer around the existing engine rather than replacing the engine.

```text
IMMUTABLE BASELINE INPUTS
SanJuanOperationSpec
OperationalRun
EnvironmentSnapshot
Veladero corridor
seed + versions + provenance
            │
            ▼
    ScenarioDefinition
            │
            ▼
     Scenario Compiler
            │
      ┌─────┴─────┐
      ▼           ▼
effective spec   movement policy
      │           │
      └─────┬─────┘
            ▼
 EXISTING V0 SIMULATION
            │
            ▼
 OperationalSnapshot(s)
            │
            ▼
    ScenarioSummary
            │
            ▼
  ScenarioComparison
```

The key architectural rule is:

> The simulation engine should not need to know which named scenario is active.

The scenario compiler produces effective deterministic inputs. The engine then operates on those inputs using the same movement/event semantics as Baseline.

## 6. Baseline Is Immutable

The checked-in baseline run, operation spec, corridor data and environment snapshot are never mutated by a what-if scenario.

Conceptually:

```text
Baseline Spec
+ ScenarioDefinition
= derived EffectiveOperationSpec
```

The derived spec exists only for the scenario execution. It does not overwrite checked-in baseline artifacts.

Baseline is represented as a first-class scenario with:

```text
rules = []
```

An empty rule set must compile to behavior that is exactly equal to the existing V0 operational behavior.

## 7. Scenario Input Boundary

V0.2 does not introduce a large generic `TerritorialState` object.

The minimal scenario input bundle is conceptually:

```text
ScenarioInputBundle
=
SanJuanOperationSpec
+ OperationalRun
+ EnvironmentSnapshot
```

The corridor definitions inside the operation spec already carry geometry, route samples, segments, elevation, evidence and limitations.

A future Territorial Score adapter may emit or transform its output into these stable inputs. V0.2 does not depend on that future system.

## 8. ScenarioDefinition

Conceptual contract:

```ts
interface ScenarioDefinition {
  schemaVersion: string;
  id: string;
  label: string;

  corridorId: 'veladero';

  baseRunId: string;
  scenarioVersion: string;
  ruleSetVersion: string;
  seed: string | number;

  rules: ScenarioRule[];

  evidenceRefs: string[];
  limitations: string[];
}
```

Requirements:

- `baseRunId` must exactly resolve to the loaded `OperationalRun.id`.
- `corridorId` is `veladero` only in V0.2.
- `scenarioVersion` and `ruleSetVersion` are explicit and supported.
- `seed` is explicit and deterministic.
- every `evidenceRef` resolves fail-closed.
- the object is serializable and canonicalizable.

No runtime search for a “similar” run, scenario or corridor is allowed.

## 9. Scenario Rule Vocabulary

V0.2 supports exactly three closed rule types. It does not implement a generic expression language.

### 9.1 DEPARTURE_OFFSET

Conceptual shape:

```ts
interface DepartureOffsetRule {
  id: string;
  type: 'DEPARTURE_OFFSET';
  target: {
    corridorId: 'veladero';
    scope: 'ALL_CORRIDOR_VEHICLES';
  };
  offsetMinutes: number;
  evidenceRefs: string[];
}
```

Semantics:

```text
scenario departure = baseline departure + offsetMinutes
```

Nothing else changes directly.

V0.2 reference scenario:

```text
Scenario A
Departure +60 minutes
```

### 9.2 ADD_PLANNED_STOP

Conceptual shape:

```ts
interface AddPlannedStopRule {
  id: string;
  type: 'ADD_PLANNED_STOP';
  target: {
    corridorId: 'veladero';
    scope: 'ALL_CORRIDOR_VEHICLES';
  };
  stop: {
    id: string;
    distanceKm: number;
    dwellMinutes: number;
  };
  evidenceRefs: string[];
}
```

The compiler materializes this as a synthetic planned stop.

Required semantics:

```text
synthetic = true
```

The UI must label it `SIMULATED STOP` or equivalent. It must not be presented as a real company checkpoint.

V0.2 reference scenario:

```text
Scenario B
Additional simulated stop +15 minutes
```

### 9.3 SEGMENT_SPEED_MULTIPLIER

Conceptual shape:

```ts
interface SegmentSpeedMultiplierRule {
  id: string;
  type: 'SEGMENT_SPEED_MULTIPLIER';
  target: {
    corridorId: 'veladero';
    segmentId: string;
    scope: 'ALL_CORRIDOR_VEHICLES';
  };
  multiplier: number;
  evidenceRefs: string[];
}
```

Semantics:

```text
effectiveSyntheticSpeed
=
baselineSyntheticSpeed × multiplier
```

This is an authored scenario assumption only. It is not an observed speed, road condition, operator policy or safety restriction.

V0.2 reference scenario:

```text
Scenario C
Explicit high-mountain/selected-segment speed multiplier ×0.80
```

The exact V0.1 segment identifier used by Scenario C is selected from the final merged Veladero corridor data. V0.2 must not invent a target segment name before that asset exists.

## 10. Rule Provenance

Scenario rules reuse the existing evidence role:

```text
SYNTHETIC_ASSUMPTION
```

Each rule must resolve to one or more explicit scenario evidence records.

Example conceptual evidence:

```text
id: what-if-segment-speed-080-v1
role: SYNTHETIC_ASSUMPTION
sourceName: San Juan Mining Ops Sim — authored scenario rule
method: explicit hypothetical multiplier applied only inside Scenario C
limitations:
  - not an observed vehicle speed
  - not a road-condition inference
  - not a safety or transitability threshold
  - not an operator recommendation
```

A geometry source, environment source or territorial source does not automatically justify a scenario rule.

## 11. Context Rules and Scenario Rules Remain Separate

The existing V0 context rules are descriptive display rules. They may emit context events such as strong gust, freezing temperature or high elevation. They do not change movement.

V0.2 introduces a different concept:

```text
SCENARIO_DISPLAY_RULE
→ describes context only

SCENARIO_TRANSFORMATION_RULE
→ explicit authored hypothetical that modifies synthetic inputs
```

There is no automatic conversion between the two.

In particular:

```text
modelled weather signal
!=
automatic movement rule
```

A future rule such as:

```text
WHAT_IF: modelled wind > X → synthetic speed × Y
```

is explicitly deferred. It would require its own rule-evaluation and temporal-integration semantics.

## 12. Scenario Compiler

The scenario compiler is a pure transformation boundary.

Conceptually:

```text
ScenarioDefinition
+ immutable baseline inputs
        ↓
compileScenario(...)
        ↓
ScenarioCompilation
```

Conceptual output:

```ts
interface ScenarioCompilation {
  scenarioId: string;
  baseRunId: string;
  fingerprint: string;
  appliedRuleIds: string[];
  effectiveSpec: SanJuanOperationSpec;
  limitations: string[];
}
```

The exact runtime type may include a separate movement policy rather than embedding all speed modifiers in the operation spec. The key requirement is that the baseline objects remain immutable and the engine receives deterministic resolved inputs.

## 13. Speed Resolver Seam

Departure offsets and planned stops can be expressed naturally through derived `VehicleDefinition` values.

Segment-level speed changes require one small architecture seam because V0 currently resolves synthetic speed from global speed profiles.

V0.2 should introduce an injected/pure speed resolver concept:

```text
BaselineSpeedResolver
VehicleType + roadClass
→ baseline synthetic speed

ScenarioSpeedResolver
baseline synthetic speed
+ explicit target multiplier
→ effective synthetic speed
```

The movement engine should ask only for the effective synthetic speed. It must not branch on scenario names such as `Scenario C`.

Baseline uses the baseline resolver and must remain exactly regression-compatible.

## 14. Rule Canonicalization and Composition

Rule array order has no semantic meaning.

Therefore:

```text
[A, B, C]
```

and:

```text
[C, A, B]
```

must compile to the same canonical scenario and same fingerprint when the logical rules are identical.

Rules are normalized by stable identity/type/target before fingerprinting and application.

V0.2 rejects conflicting rules rather than inventing precedence semantics.

Example invalid case:

```text
segment X speed ×0.80
segment X speed ×0.70
```

This fails validation instead of multiplying both values or selecting one implicitly.

## 15. Scenario Fingerprint

Each compilation receives a reproducible fingerprint derived from canonical deterministic inputs, conceptually:

```text
hash(
  baseRunId
  + scenarioVersion
  + ruleSetVersion
  + seed
  + canonicalRules
)
```

The fingerprint is an identity/debugging mechanism, not a cryptographic proof of real-world validity.

Requirements:

- same logical inputs → same fingerprint;
- rule-array ordering does not change the fingerprint;
- changed rule parameters change the fingerprint;
- no timestamp, browser state or random runtime value participates in canonical identity.

## 16. ScenarioResult

V0.2 does not store thousands of animation frames. The existing engine continues to derive operational snapshots on demand.

`ScenarioResult` is a deterministic summary suitable for comparison.

Conceptual structure:

```ts
interface ScenarioResult {
  scenarioId: string;
  baseRunId: string;
  fingerprint: string;
  appliedRuleIds: string[];
  vehicleTimings: ScenarioVehicleTiming[];
  corridorSummary: ScenarioCorridorSummary;
  evidenceRefs: string[];
  limitations: string[];
}
```

Per-vehicle timing should include at least:

```text
vehicleId
departureMinute
projectArrivalMinute
returnStartMinute
baseArrivalMinute
totalCycleMinutes
plannedDwellMinutes
```

## 17. Time by Operational Segment

V0.2 should expose time spent traversing each existing Veladero operational segment.

The comparison uses the same operational segment boundaries already defined by the corridor. It does not create a new segment system.

Example presentation:

```text
260–340 km
Baseline      160 min
Scenario C    200 min
Delta          +40 min
```

The values describe simulated time within the model only.

## 18. Elevation and Other Held-Constant Territorial Dimensions

V0.2 does not change route geometry or elevation.

Therefore Baseline and Scenarios A/B/C may have identical values for:

- maximum elevation encountered;
- elevation range;
- corridor geometry;
- source provenance;
- environment artifact identity.

The comparison should explicitly surface relevant held-constant dimensions. This reinforces that the experiment changes one authored operational assumption while territorial inputs remain fixed.

## 19. Environment-at-Passage Semantics

Environment remains descriptive and immutable.

The current conceptual flow remains:

```text
vehicle movement
→ passage time
→ environment lookup at passage
→ modelled context
```

Therefore a scenario can indirectly encounter different modelled context because its passage time changes.

Example:

```text
Baseline passage at Tudcum: 09:41
Scenario A passage at Tudcum: 10:41
```

The two passages may resolve different modelled weather values from the same immutable EnvironmentSnapshot.

This is valid because the authored action changed movement timing. The environment did not cause the movement change.

V0.2 does not calculate continuous exposure duration to weather thresholds. That would require explicit sampling, interpolation and threshold-crossing semantics and is deferred.

## 20. ScenarioComparison

Comparison is pure and neutral.

Conceptual contract:

```ts
interface ScenarioComparison {
  baselineScenarioId: string;
  comparedScenarioId: string;

  projectArrivalDeltaMinutes: number;
  totalCycleDeltaMinutes: number;
  dwellDeltaMinutes: number;

  segmentTimeDeltas: SegmentTimeDelta[];
  passageContextChanges: PassageContextChange[];
  unchangedTerritorialDimensions: string[];
  appliedRuleIds: string[];
}
```

The comparison reports deltas only. It does not contain:

```text
score
ranking
recommended
best
optimal
safe
unsafe
risk
probability
confidence
```

The product statement is:

> These declared inputs produce these differences inside the model.

## 21. Reference Scenarios

### Baseline

```text
rules = []
```

Behavior must exactly match the existing deterministic V0 baseline.

### Scenario A — departure offset

```text
AUTHORED CHANGE
Veladero synthetic departures +60 minutes
```

Expected qualitative result:

- departure times +60 min;
- project arrival times +60 min when no other rule applies;
- travel duration unchanged;
- corridor/elevation unchanged;
- environment-at-passage may differ because passage timestamps differ.

### Scenario B — additional simulated stop

```text
AUTHORED CHANGE
Additional simulated stop +15 minutes at a declared valid Veladero distance
```

Expected qualitative result:

- movement before the stop unchanged;
- +15 min dwell introduced at the stop;
- downstream timing delayed by 15 min;
- travel speed assumptions unchanged.

### Scenario C — segment speed multiplier

```text
AUTHORED CHANGE
Selected Veladero operational segment synthetic speed ×0.80
```

Expected qualitative result:

- earlier segments unchanged;
- target segment travel time changes;
- downstream event times inherit the accumulated delta;
- baseline speed assumptions resume outside the target segment;
- no road-condition or safety inference is made.

## 22. User Experience

The map remains the primary surface.

The existing flow remains:

```text
LOAD
→ START SHIFT
→ MAP + TIMELINE
→ PLAY / PAUSE / SEEK
```

V0.2 adds a compact scenario selector to the operational UI.

Example:

```text
SCENARIO
[ BASELINE ▾ ]
```

Options:

```text
BASELINE
A · Departure +60 min
B · Additional stop +15 min
C · Segment speed ×0.80
```

The app renders exactly one active scenario at a time.

## 23. Scenario Switching

Switching scenarios preserves the current simulation clock.

Example:

```text
10:30 Baseline
→ switch to Scenario A
→ remain at 10:30
→ calculate Scenario A state at 10:30
```

This allows direct visual comparison at the same modeled time.

Scenario selection does not automatically reset the clock.

The existing Reset control retains its clock/reset semantics and does not silently change the selected scenario.

## 24. One Active Scenario in Cesium

V0.2 does not render four simultaneous fleets or four Cesium viewers.

Rule:

> One active scenario → one active simulated world.

The corridor geometry remains unchanged among Baseline and A/B/C. Vehicle positions and timings change according to the active scenario.

Baseline ghost positions, dual-vehicle overlays and multiple-scenario map traces are deferred.

## 25. Comparison Drawer

A compact comparison action is available when the active scenario is not Baseline.

The comparison opens in a contained drawer or equivalent progressive-disclosure surface. It does not open a large central modal and must not permanently obscure the map.

The drawer distinguishes authored input from calculated output.

Example:

```text
AUTHORED CHANGE
Segment speed ×0.80
260–340 km

MODEL RESULT
Project arrival   +33 min
Total cycle       +33 min
Target segment    +33 min
```

It also exposes:

```text
WHY THIS CHANGED
SCENARIO RULE
<rule id / label>
```

and relevant held-constant dimensions.

## 26. Multi-Scenario Summary Table

V0.2 may provide a compact table comparing Baseline, A, B and C summaries.

Example:

| Metric | Baseline | A | B | C |
| --- | ---: | ---: | ---: | ---: |
| Project arrival | 12:14 | 13:14 | 12:29 | 12:47 |
| Outbound duration | 314m | 314m | 329m | 347m |
| Added dwell | 0m | 0m | 15m | 0m |
| Target-segment time | 160m | 160m | 160m | 193m |

Values above are illustrative only; implementation uses deterministic calculated values from the final baseline and scenario inputs.

No table cell is styled as a winner, recommendation or risk classification.

## 27. Fail-Closed Validation

Scenario compilation fails before execution for invalid identity or rule state.

### Identity failures

- unknown `baseRunId`;
- loaded run does not match `baseRunId`;
- corridor other than Veladero;
- unsupported `scenarioVersion`;
- unsupported `ruleSetVersion`;
- unresolved evidence references.

### Rule failures

- unknown rule type;
- duplicate rule ID;
- conflicting rules;
- invalid target corridor;
- unknown target `segmentId`;
- invalid or out-of-range `distanceKm`;
- negative stop dwell;
- invalid departure time after applying an offset;
- non-finite parameter;
- multiplier <= 0.

A defensive authoring range should reject obvious multiplier mistakes. Initial recommended integrity guard:

```text
0.1 <= multiplier <= 2.0
```

This is a scenario-data corruption guard, not an operational or engineering limit.

No nearest-segment fallback, closest checkpoint fallback or silent whole-corridor application is allowed.

## 28. Missing Data

Missing remains missing.

If a changed passage time cannot resolve modelled environmental context:

```text
Scenario context = unavailable
```

The system must not:

- substitute zero;
- indefinitely carry forward a previous value;
- invent modelled context;
- calculate a fake delta.

The comparison may explicitly show that Baseline context is available while Scenario context is unavailable.

## 29. Deterministic Requirement

Scenario execution must depend only on explicit deterministic inputs:

```text
baseline immutable inputs
+ canonical ScenarioDefinition
+ ruleSetVersion
+ modelVersion
+ seed
```

Forbidden hidden inputs include:

- `Date.now()`;
- unseeded `Math.random()`;
- browser-local mutable state;
- runtime provider fetches;
- rule-array order;
- current wall-clock time.

For identical inputs:

```text
F(X) = F(X)
```

must hold exactly.

## 30. Baseline Regression Gate

The strongest V0.2 acceptance invariant is:

```text
existing V0 baseline behavior
==
ScenarioCompiler(baseline, rules = [])
```

The comparison covers operational snapshots/events at the existing acceptance checkpoints and any other deterministic outputs required by the final implementation.

No numerical tolerance is used for baseline semantic regression unless a pre-existing V0 numeric tolerance already exists for that field. Scenario Engine itself must introduce no new baseline drift.

## 31. TDD Test Strategy

Implementation follows strict RED → GREEN development.

### Compiler tests

- empty rule set produces no operational changes;
- same scenario compiled twice is exactly equal;
- logically identical reordered rules produce the same compilation/fingerprint;
- duplicate/conflicting rules fail;
- unresolved evidence fails;
- unknown segment fails;
- invalid stop/dwell/departure/multiplier fails.

### Departure rule tests

- departure shifts exactly by configured offset;
- project arrival shifts consistently;
- driving duration remains unchanged;
- unrelated corridors/vehicles remain unchanged.

### Stop rule tests

- passage before stop remains unchanged;
- stop dwell is explicit and synthetic;
- downstream timing includes exact dwell delta;
- travel speed assumptions remain unchanged.

### Speed multiplier tests

- only the target segment uses the modified speed resolver;
- earlier segment timings remain unchanged;
- target segment time changes deterministically;
- downstream times inherit the accumulated delta;
- baseline resolver remains unchanged outside the target.

### Environment interaction tests

- changed passage time uses the corresponding environment lookup time;
- missing context remains unavailable;
- changing only EnvironmentSnapshot content cannot change vehicle timing when no environmental transformation rule exists.

### Comparison tests

- arrival delta correct;
- cycle delta correct;
- dwell delta correct;
- segment-time delta correct;
- unchanged dimensions preserved;
- applied rule IDs preserved;
- no recommendation/ranking fields exist.

## 32. Provenance Acceptance

Every scenario result must be traceable through:

```text
ScenarioComparison
→ ScenarioResult
→ ScenarioCompilation
→ ScenarioDefinition
→ ScenarioRule IDs
→ synthetic assumption evidence

and

→ OperationalRun
→ SanJuanOperationSpec
→ EnvironmentSnapshot
→ corridor/evidence artifacts
```

Unresolved references fail validation.

Operational/synthetic scenario evidence remains distinct from modelled-environment/provider evidence.

## 33. Claims Audit

The existing claim-audit workflow remains mandatory.

V0.2 should add scenario-specific review terms such as:

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

Negative/documentary statements are allowed after human review. Positive UI or product claims implying prediction, recommendation, safety or real operator policy are not allowed.

## 34. Visual QA

Retain the existing accepted viewport set:

```text
1440 × 900
1024 × 768
390 × 844
```

New visual acceptance invariants:

- scenario selector remains within viewport;
- selector labels do not clip;
- comparison drawer remains contained;
- drawer uses internal scrolling;
- no uncontrolled horizontal overflow;
- Baseline/A/B/C table remains readable or responsively transformed;
- mobile comparison does not cover the entire viewport;
- map remains the dominant visual surface;
- no permanent large scenario card obscures the map.

CI WebGL limitations remain documented exactly as in the existing project acceptance process. Headless fallback success is not represented as proof of rendered Cesium 3D quality.

## 35. V0.2 Acceptance Matrix

| Gate | Requirement |
| --- | --- |
| Baseline | Exact V0 regression with empty rules |
| Determinism | Same inputs produce identical result |
| Scenario A | Departure offset only |
| Scenario B | Explicit simulated stop only |
| Scenario C | Explicit segment speed multiplier only |
| Environment | Context only; no automatic movement effect |
| Provenance | Every rule and input reference resolves |
| Missing data | Remains unavailable |
| UI | One active scenario on the map |
| Comparison | Neutral deltas only |
| Claims | No prediction/recommendation/safety inference |
| Responsive | No clipping or map obstruction |
| Build | Full production gate green on one final HEAD |

## 36. Scope Lock

### V0.2 YES

```text
Veladero only
Baseline with empty rule set
Scenario A — departure offset
Scenario B — additional simulated stop
Scenario C — segment synthetic speed multiplier
deterministic compiler
scenario fingerprint
scenario summaries
neutral comparison
modelled context at resulting passage time
scenario provenance
compact map-first UI
```

### V0.2 NO

```text
weather-driven movement
automatic rule generation
route alternatives
route optimization
multi-corridor authoring
Monte Carlo
probabilities
machine learning
reinforcement learning
prediction
safety model
risk score
recommendations
real telemetry
operator integration
real dispatch
real checkpoints
road status
closures
transitability
authorization
Territorial Score implementation
```

## 37. Implementation Dependency and Branching

This design document intentionally lives on a docs-only branch created from `main` so the active V0.1 Road Geometry PR remains scope-pure.

Implementation must not begin on this design branch.

After V0.1 Road Geometry is merged and accepted:

1. update `main` to the merged V0.1 state;
2. create `feat/v0.2-scenario-engine` from that `main`;
3. ensure this approved spec is present on the implementation base;
4. execute the implementation plan with TDD;
5. preserve the V0.1 geometry and deterministic acceptance gates.

Scenario C must use the real final Veladero segment identifier from the merged V0.1 corridor artifact rather than a placeholder.

## 38. Future Extensions Explicitly Deferred

Possible later increments include:

### Conditional authored rules

Example:

```text
IF modelled wind > X
THEN synthetic speed × Y
```

Such rules require explicit temporal evaluation, activation/deactivation, interpolation and causality semantics and are not part of V0.2.

### Territorial State adapter

A later stable contract may allow Territorial Score or GeoPlatform-derived artifacts to feed the simulator without importing those systems' internal domain models.

### Uncertainty and ensembles

Monte Carlo, uncertainty propagation and scenario ensembles require separate statistical design and provenance rules.

### Optimization

Optimization, recommendations or policy search are separate products/research questions and must not be inferred from the existence of deterministic what-if comparison.

## 39. Final Product Statement

The V0.2 product question is:

> Maintaining the same territorial state, what changes inside the simulation when an explicit operational hypothesis is modified?

The system answers through reproducible calculations and neutral deltas.

It does not answer:

> What will happen in reality?

or:

> What should an operator do?

The intended conceptual chain is:

```text
Territorial State
→ Explicit Scenario Rule
→ Deterministic Simulation
→ Scenario Comparison
```

That boundary is the defining feature of V0.2.