import type { ContextEvent, ContextSignalType, EnvironmentContext, VehicleSnapshot } from '../domain/contracts';

export interface ContextRule {
  id: string;
  type: ContextSignalType;
  metric: 'elevationM' | 'windGustKmh' | 'temperatureC' | 'precipitationMm' | 'travelMinutes';
  operator: '>=' | '>' | '<=' | '<';
  threshold: number;
  sourceKind: 'SCENARIO_DISPLAY_RULE';
  evidenceRefs: string[];
}

export const V0_CONTEXT_RULES: ContextRule[] = [];

export function deriveContextEvents(
  _vehicle: VehicleSnapshot,
  _environment: EnvironmentContext,
  _rules: ContextRule[],
  _time: string,
  _travelMinutes?: number,
): ContextEvent[] {
  return [];
}
