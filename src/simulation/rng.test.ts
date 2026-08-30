import { describe, expect, it } from 'vitest';
import { createNamedRng } from './rng';

describe('named rng', () => {
  it('replays the same sequence for the same seed and stream name', () => {
    const a = createNamedRng('20260830', 'departures');
    const b = createNamedRng('20260830', 'departures');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('separates independent named streams', () => {
    const departures = createNamedRng('20260830', 'departures');
    const dwellTimes = createNamedRng('20260830', 'dwellTimes');
    expect([departures(), departures()]).not.toEqual([dwellTimes(), dwellTimes()]);
  });
});
