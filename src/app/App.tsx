import { useEffect, useMemo, useState } from 'react';
import type {
  EvidenceRef,
  OperationalSnapshot,
  SanJuanOperationSpec,
} from '../domain/contracts';
import {
  loadStaticOperationData,
  loadStaticRunArtifacts,
  loadTrafficCalibration,
  type StaticOperationData,
  type StaticRunArtifacts,
  type StaticTrafficCalibration,
} from '../data/loadOperation';
import { CesiumStage } from '../map/CesiumStage';
import { backgroundTrafficAt } from '../simulation/backgroundTraffic';
import { advanceClock, createClock, END_MINUTE, type Playback } from '../simulation/clock';
import { getOperationalSnapshot } from '../simulation/engine';
import { buildV0Schedule } from '../simulation/schedule';
import { AnalysisDrawer } from '../ui/AnalysisDrawer';
import { CommandHud } from '../ui/CommandHud';
import { IntroOverlay } from '../ui/IntroOverlay';
import { Timeline } from '../ui/Timeline';
import { VehiclePanel } from '../ui/VehiclePanel';
import '../ui/task9.css';
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

function buildOperationSpec(
  data: StaticOperationData,
  seed: string | number,
  traffic: StaticTrafficCalibration,
): SanJuanOperationSpec {
  return {
    schemaVersion: 'sanjuan.operation/v1',
    scenarioId: 'sanjuan-mining-ops-v0',
    timezone: 'America/Argentina/San_Juan',
    seed,
    territory: { projects: data.projects },
    corridors: data.corridors,
    fleet: buildV0Schedule(seed),
    schedule: {
      startMinute: 360,
      endMinute: 1200,
      defaultPlayback: 300,
      playbackOptions: [60, 120, 300, 600],
    },
    calibration: { evidenceRefs: traffic.evidenceRefs },
    provenance: [...data.evidence, ...traffic.evidence, SYNTHETIC_PLAN_EVIDENCE],
  };
}

export function App() {
  const [started, setStarted] = useState(false);
  const [data, setData] = useState<StaticOperationData | null>(null);
  const [runArtifacts, setRunArtifacts] = useState<StaticRunArtifacts | null>(null);
  const [trafficCalibration, setTrafficCalibration] = useState<StaticTrafficCalibration | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [clock, setClock] = useState(createClock);
  const [playback, setPlayback] = useState<Playback>(300);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetcher = (url: string) => fetch(url);

    void Promise.all([
      loadStaticOperationData(fetcher),
      loadStaticRunArtifacts(fetcher),
      loadTrafficCalibration(fetcher),
    ])
      .then(([loadedData, loadedRunArtifacts, loadedTrafficCalibration]) => {
        if (cancelled) return;
        setData(loadedData);
        setRunArtifacts(loadedRunArtifacts);
        setTrafficCalibration(loadedTrafficCalibration);
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

  const spec = useMemo(
    () => (
      data && runArtifacts && trafficCalibration
        ? buildOperationSpec(data, runArtifacts.run.seed, trafficCalibration)
        : null
    ),
    [data, runArtifacts, trafficCalibration],
  );
  const snapshot = useMemo(
    () => (
      spec && runArtifacts
        ? getOperationalSnapshot(spec, runArtifacts.run, clock.minuteOfDay, runArtifacts.environment)
        : { ...EMPTY_SNAPSHOT, simTime: clock.minuteOfDay }
    ),
    [spec, runArtifacts, clock.minuteOfDay],
  );

  const fleetIds = useMemo(() => spec?.fleet.map((vehicle) => vehicle.id) ?? [], [spec]);
  const backgroundIds = useMemo(
    () => trafficCalibration
      ? Array.from({ length: trafficCalibration.maxVisibleVehicles }, (_, index) => `BG-${String(index + 1).padStart(3, '0')}`)
      : [],
    [trafficCalibration],
  );
  const backgroundTraffic = useMemo(
    () => (
      trafficCalibration && runArtifacts
        ? backgroundTrafficAt(runArtifacts.run.seed, clock.minuteOfDay, trafficCalibration)
        : []
    ),
    [trafficCalibration, runArtifacts, clock.minuteOfDay],
  );

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
        backgroundIds={backgroundIds}
        backgroundTraffic={backgroundTraffic}
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
            {data ? <span>10 projects · 3 operational corridors · 24 synthetic units</span> : null}
            {runArtifacts ? <span>MODELLED WEATHER · {runArtifacts.environment.sourceState}</span> : null}
            {trafficCalibration ? <span>BACKGROUND TRAFFIC · SYNTHETIC</span> : null}
            {!data && !runArtifacts && !trafficCalibration && (
              <span>{dataError ? 'Operational data unavailable' : 'Loading operational data…'}</span>
            )}
          </div>

          <button className="sources-button" type="button" onClick={() => setSourcesOpen(true)}>Sources</button>

          <VehiclePanel vehicle={selectedVehicle} corridorName={selectedCorridorName} />
          <Timeline
            minuteOfDay={clock.minuteOfDay}
            onSeek={(minuteOfDay) => setClock((current) => ({ ...current, minuteOfDay }))}
          />
        </div>
      )}

      <AnalysisDrawer
        open={started && sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        operation={data}
        runArtifacts={runArtifacts}
        traffic={trafficCalibration}
      />

      {!started && <IntroOverlay onStart={() => setStarted(true)} />}
    </main>
  );
}
