import { describe, expect, it } from 'vitest';
import { advanceClock, createClock, resetClock } from './clock';

describe('operational clock', () => {
  it('starts paused at 06:00', () => {
    expect(createClock()).toEqual({ minuteOfDay: 360, playing: false });
  });

  it('advances five simulated minutes in one real second at 300x', () => {
    expect(advanceClock({ minuteOfDay: 360, playing: true }, 1000, 300).minuteOfDay).toBe(365);
  });

  it('clamps at 20:00', () => {
    expect(advanceClock({ minuteOfDay: 1199, playing: true }, 1000, 600).minuteOfDay).toBe(1200);
  });

  it('does not advance while paused', () => {
    expect(advanceClock({ minuteOfDay: 500, playing: false }, 1000, 600).minuteOfDay).toBe(500);
  });

  it('resets to the operational start', () => {
    expect(resetClock()).toEqual({ minuteOfDay: 360, playing: false });
  });
});
