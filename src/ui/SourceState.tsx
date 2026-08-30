import type { SourceState as SourceStateValue } from '../domain/contracts';

export interface SourceStateProps {
  state: SourceStateValue;
}

export function SourceState({ state }: SourceStateProps) {
  return <span className={`source-state source-state-${state.toLowerCase()}`}>{state}</span>;
}
