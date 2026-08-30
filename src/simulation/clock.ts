export const START_MINUTE = 360;
export const END_MINUTE = 1200;

export type Playback = 60 | 120 | 300 | 600;

export interface OperationalClock {
  minuteOfDay: number;
  playing: boolean;
}

export function createClock(): OperationalClock {
  return { minuteOfDay: START_MINUTE, playing: false };
}

export function resetClock(): OperationalClock {
  return createClock();
}

export function advanceClock(clock: OperationalClock, elapsedRealMs: number, playback: Playback): OperationalClock {
  if (!clock.playing) return clock;
  const simulatedMinutes = (elapsedRealMs / 1000) * (playback / 60);
  return {
    ...clock,
    minuteOfDay: Math.min(END_MINUTE, clock.minuteOfDay + simulatedMinutes),
  };
}
