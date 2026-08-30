import type {
  ContextEvent,
  ContextSeverity,
  ContextSignalType,
  EnvironmentContext,
  VehicleSnapshot,
} from '../domain/contracts';

export interface ContextRule {
  id: string;
  type: ContextSignalType;
  metric: 'elevationM' | 'windGustKmh' | 'temperatureC' | 'precipitationMm' | 'travelMinutes';
  operator: '>=' | '>' | '<=' | '<';
  threshold: number;
  sourceKind: 'SCENARIO_DISPLAY_RULE';
  evidenceRefs: string[];
}

export const V0_CONTEXT_RULES: ContextRule[] = [
  {
    id: 'display-high-elevation-v1',
    type: 'HIGH_ELEVATION',
    metric: 'elevationM',
    operator: '>=',
    threshold: 3500,
    sourceKind: 'SCENARIO_DISPLAY_RULE',
    evidenceRefs: ['scenario-display-rules-v1'],
  },
  {
    id: 'display-strong-gust-v1',
    type: 'STRONG_GUST',
    metric: 'windGustKmh',
    operator: '>=',
    threshold: 50,
    sourceKind: 'SCENARIO_DISPLAY_RULE',
    evidenceRefs: ['scenario-display-rules-v1'],
  },
  {
    id: 'display-freezing-temperature-v1',
    type: 'FREEZING_TEMPERATURE',
    metric: 'temperatureC',
    operator: '<=',
    threshold: 0,
    sourceKind: 'SCENARIO_DISPLAY_RULE',
    evidenceRefs: ['scenario-display-rules-v1'],
  },
  {
    id: 'display-precipitation-v1',
    type: 'PRECIPITATION_SIGNAL',
    metric: 'precipitationMm',
    operator: '>',
    threshold: 0,
    sourceKind: 'SCENARIO_DISPLAY_RULE',
    evidenceRefs: ['scenario-display-rules-v1'],
  },
  {
    id: 'display-long-travel-window-v1',
    type: 'LONG_TRAVEL_WINDOW',
    metric: 'travelMinutes',
    operator: '>=',
    threshold: 240,
    sourceKind: 'SCENARIO_DISPLAY_RULE',
    evidenceRefs: ['scenario-display-rules-v1'],
  },
];

function compare(value: number, operator: ContextRule['operator'], threshold: number): boolean {
  switch (operator) {
    case '>=': return value >= threshold;
    case '>': return value > threshold;
    case '<=': return value <= threshold;
    case '<': return value < threshold;
  }
}

function metricValue(
  rule: ContextRule,
  vehicle: VehicleSnapshot,
  environment: EnvironmentContext,
  travelMinutes?: number,
): number | null {
  switch (rule.metric) {
    case 'elevationM': return vehicle.elevationM;
    case 'windGustKmh': return environment.windGustKmh;
    case 'temperatureC': return environment.temperatureC;
    case 'precipitationMm': return environment.precipitationMm;
    case 'travelMinutes': return travelMinutes ?? null;
  }
}

function unitForMetric(metric: ContextRule['metric']): string {
  switch (metric) {
    case 'elevationM': return 'm';
    case 'windGustKmh': return 'km/h';
    case 'temperatureC': return '°C';
    case 'precipitationMm': return 'mm';
    case 'travelMinutes': return 'min';
  }
}

function severityFor(type: ContextSignalType): ContextSeverity {
  return type === 'LONG_TRAVEL_WINDOW' ? 'INFO' : 'ATTENTION';
}

function isEnvironmentMetric(metric: ContextRule['metric']): boolean {
  return metric === 'windGustKmh' || metric === 'temperatureC' || metric === 'precipitationMm';
}

export function deriveContextEvents(
  vehicle: VehicleSnapshot,
  environment: EnvironmentContext,
  rules: ContextRule[],
  time: string,
  travelMinutes?: number,
): ContextEvent[] {
  return rules.flatMap((rule) => {
    if (isEnvironmentMetric(rule.metric) && environment.sourceState === 'UNAVAILABLE') return [];

    const value = metricValue(rule, vehicle, environment, travelMinutes);
    if (value === null || !Number.isFinite(value) || !compare(value, rule.operator, rule.threshold)) return [];

    const evidenceRefs = [
      ...rule.evidenceRefs,
      ...(isEnvironmentMetric(rule.metric) ? environment.evidenceRefs : []),
    ].filter((value, index, all) => all.indexOf(value) === index);

    return [{
      id: `${vehicle.id}:${rule.id}:${vehicle.segmentId}:${time}`,
      vehicleId: vehicle.id,
      corridorId: vehicle.corridorId,
      segmentId: vehicle.segmentId,
      time,
      type: rule.type,
      value,
      unit: unitForMetric(rule.metric),
      ruleId: rule.id,
      severity: severityFor(rule.type),
      evidenceRefs,
    } satisfies ContextEvent];
  });
}
