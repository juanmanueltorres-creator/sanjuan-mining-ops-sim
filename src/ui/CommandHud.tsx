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

export function CommandHud(_props: CommandHudProps) {
  return <div />;
}
