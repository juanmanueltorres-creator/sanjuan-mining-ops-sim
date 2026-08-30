export interface TimelineProps {
  minuteOfDay: number;
  onSeek: (minuteOfDay: number) => void;
}

const START_MINUTE = 360;
const END_MINUTE = 1200;

export function Timeline({ minuteOfDay, onSeek }: TimelineProps) {
  const value = Math.max(START_MINUTE, Math.min(END_MINUTE, Math.round(minuteOfDay)));

  return (
    <div className="timeline" aria-label="Shift timeline">
      <span className="timeline-endpoint">06:00</span>
      <input
        aria-label="Operational timeline"
        type="range"
        min={START_MINUTE}
        max={END_MINUTE}
        step={1}
        value={value}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="timeline-endpoint">20:00</span>
    </div>
  );
}
