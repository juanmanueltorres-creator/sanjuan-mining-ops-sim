import { useEffect, useMemo, useState } from 'react';
import type {
  EvidenceRef,
  OperationalRun,
  OperationalSnapshot,
  SanJuanOperationSpec,
} from '../domain/contracts';
import { loadStaticOperationData, type StaticOperationData } from '../data/loadOperation';
import { CesiumStage } from '../map/CesiumStage';
import { advanceClock, createClock, END_MINUTE, type Playback } from '../simulation/clock';
import { getOperationalSnapshot } from '../simulation/engine';
import { buildV0Schedule } from '../simulation/schedule';
import { CommandHud } from '../ui/CommandHud';
import { IntroOverlay } from '../ui/IntroOverlay';
import { Timeline } from '../ui/Timeline';
import { VehiclePanel } from '../ui/VehiclePanel';
import './app.css';

const EMPTY_SNAPSHOT: OperationalSnapshot = {
  simTime: 360,
  vehicles: [],
  corridorStates: [],
  operationalEvents: [],
  contextEvents: [],
  metrics: { activeVehicles: 0, atProject: 0, returning: 0, done: 0 },
};

const SYNTHETIC_PLAN_EVIDENCE: EvidenceRef = {
  id: 'synthetic-operating-plan-v1',
  role: 'SYNTHETIC_ASSUMPTION',
  sourceName: 'San Juan Mining Ops Sim — V0 operating plan',
  retrievedAt: '2026-08-30',
  method: 'Seeded deterministic schedule for demonstration and software validation.',
  limitations: [
    'Vehicle assignments, departure times, dwell times and speed profiles are synthetic.',
    'The scenario does not represent operator dispatch, live telemetry or a safety recommendation.',
  ],
};

const V0_RUN: OperationalRun = {
  id: 'sanjuan-v0-demo-run',
  targetDate: '2026-08-30',
  issuedAt: '2026-08-30T06:00:00-03:00',
  dataAsOf: '2026-08-30T06:00:00-03:00',
  timezone: 'America/Argentina/San_Juan',
  mode: 'SIMULATED',
  modelVersion: 'movement-v0.1',
  scenarioVersion: 'sanjuan-operation-v0.1',
  environmentSnapshotId: 'pending-task-8',
  provenance: ['synthetic-operating-plan-v1'],
};

function buildOperationSpec(data: StaticOperationData): SanJuanOperationSpec {
  return {
    schemaVersion: 'sanjuan.operation/v1',
    scenarioId: 'sanjuan-mining-ops-v0',
    timezone: 'America/Argentina/San_Juan',
    seed: 'sanjuan-v0-20260830',
    territory: { projects: data.projects },
    corridors: data.corridors,
    fleet: buildV0Schedule('sanjuan-v0-20260830'),
    schedule: {
      startMinute: 360,
      endMinute: 1200,
      defaultPlayback: 300,
      playbackOptions: [60, 120, 300, 600],
    },
    calibration: { evidenceRefs: [] },
    provenance: [...data.evidence, SYNTHETIC_PLAN_EVIDENCE],
  };
}

export function App() {
  const [started, setStarted] = useState(false);
  const [data, setData] = useState<StaticOperationData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [clock, setClock] = useState(createClock);
  const [playback, setPlayback] = useState<Playback>(300);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadStaticOperationData((url) => fetch(url))
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setDataError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDataError(error instanceof Error ? error.message : 'Operational data unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const spec = useMemo(() => (data ? buildOperationSpec(data) : null), [data]);
  const snapshot = useMemo(
    () => (spec ? getOperationalSnapshot(spec, V0_RUN, clock.minuteOfDay) : { ...EMPTY_SNAPSHOT, simTime: clock.minuteOfDay }),
    [spec, clock.minuteOfDay],
  );

  const fleetIds = useMemo(() => spec?.fleet.map((vehicle) => vehicle.id) ?? [], [spec]);
  const selectedVehicle = useMemo(
    () => snapshot.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [snapshot, selectedVehicleId],
  );
  const selectedCorridorName = useMemo(() => {
    if (!selectedVehicle || !spec) return undefined;
    return spec.corridors.find((corridor) => corridor.id === selectedVehicle.corridorId)?.name;
  }, [selectedVehicle, spec]);

  useEffect(() => {
    if (!clock.playing) return;

    let animationFrame = 0;
    let previousFrame = performance.now();
    let accumulatedMs = 0;

    const tick = (now: number) => {
      accumulatedMs += Math.max(0, now - previousFrame);
      previousFrame = now;

      if (accumulatedMs >= 100) {
        const elapsedMs = accumulatedMs;
        accumulatedMs = 0;
        setClock((current) => {
          const next = advanceClock(current, elapsedMs, playback);
          return next.minuteOfDay >= END_MINUTE ? { ...next, playing: false } : next;
        });
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [clock.playing, playback]);

  const reset = () => {
    setClock(createClock());
    setSelectedVehicleId(null);
  };

  return (
    <main className="app-shell">
      <CesiumStage
        data={data}
        snapshot={snapshot}
        fleetIds={fleetIds}
        onVehicleSelect={setSelectedVehicleId}
      />

      {started && (
        <div className="operational-ui">
          <CommandHud
            minuteOfDay={clock.minuteOfDay}
            playback={playback}
            playing={clock.playing}
            metrics={snapshot.metrics}
            onToggle={() => setClock((current) => ({ ...current, playing: !current.playing }))}
            onReset={reset}
            onPlaybackChange={setPlayback}
          />

          <div className="map-status" role="status">
            {data ? '10 projects · 3 operational corridors · 24 synthetic units' : dataError ? 'Territorial data unavailable' : 'Loading territorial data…'}
          </div>

          <VehiclePanel vehicle={selectedVehicle} corridorName={selectedCorridorName} />
          <Timeline
            minuteOfDay={clock.minuteOfDay}
            onSeek={(minuteOfDay) => setClock((current) => ({ ...current, minuteOfDay }))}
          />
        </div>
      )}

      {!started && <IntroOverlay onStart={() => setStarted(true)} />}
    </main>
  );
}
