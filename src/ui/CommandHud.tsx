import type { OperationalMetrics } from '../domain/contracts';
import type { Playback } from '../simulation/clock';

export interface CommandHudProps {
  minuteOfDay: number;
  playback: Playback;
  playing: boolean;
  metrics: OperationalMetrics;
  onToggle: () => void;
  onReset: () => void;
  onPlaybackChange: (playback: Playback) => void;
}

function formatMinuteOfDay(minuteOfDay: number): string {
  const bounded = Math.max(0, Math.min(1439, Math.round(minuteOfDay)));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function CommandHud({
  minuteOfDay,
  playback,
  playing,
  metrics,
  onToggle,
  onReset,
  onPlaybackChange,
}: CommandHudProps) {
  return (
    <header className="command-hud" aria-label="Operational command bar">
      <div className="command-identity">
        <span className="command-kicker">SAN JUAN OPS</span>
        <strong className="command-time">{formatMinuteOfDay(minuteOfDay)}</strong>
      </div>

      <div className="command-metrics" aria-label="Operational metrics">
        <span>{metrics.activeVehicles} active</span>
        <span>{metrics.atProject} at project</span>
        <span>{metrics.returning} returning</span>
      </div>

      <div className="command-controls">
        <button type="button" onClick={onToggle}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={onReset}>Reset</button>
        <label className="playback-control">
          <span>Speed</span>
          <select
            aria-label="Playback speed"
            value={playback}
            onChange={(event) => onPlaybackChange(Number(event.target.value) as Playback)}
          >
            <option value={60}>60×</option>
            <option value={120}>120×</option>
            <option value={300}>300×</option>
            <option value={600}>600×</option>
          </select>
        </label>
      </div>
    </header>
  );
}
