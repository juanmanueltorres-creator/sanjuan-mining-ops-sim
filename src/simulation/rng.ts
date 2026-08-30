export function createNamedRng(seed: string | number, name: string): () => number {
  let hash = 2166136261;
  for (const ch of `${seed}:${name}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }

  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
