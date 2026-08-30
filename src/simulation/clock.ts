export type Playback = 60 | 120 | 300 | 600;

export interface OperationalClock {
  minuteOfDay: number;
  playing: boolean;
}

export function createClock(): OperationalClock {
  return { minuteOfDay: 0, playing: false };
}

export function resetClock(): OperationalClock {
  return createClock();
}

export function advanceClock(clock: OperationalClock, _elapsedRealMs: number, _playback: Playback): OperationalClock {
  return clock;
}
