import type {
  EnvironmentContext,
  EnvironmentHour,
  EnvironmentNode,
  EnvironmentSnapshot,
  SourceState,
} from '../domain/contracts';

type NodeWeather = Omit<EnvironmentContext, 'sourceState' | 'evidenceRefs'>;

function unavailableEnvironmentContext(): EnvironmentContext {
  return {
    sourceState: 'UNAVAILABLE',
    temperatureC: null,
    precipitationMm: null,
    snowfallCm: null,
    windSpeedKmh: null,
    windGustKmh: null,
    windDirectionDeg: null,
    evidenceRefs: [],
  };
}

function lerpNullable(a: number | null, b: number | null, fraction: number): number | null {
  if (a === null || b === null) return null;
  return a + (b - a) * fraction;
}

function lerpDirection(a: number | null, b: number | null, fraction: number): number | null {
  if (a === null || b === null) return null;
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * fraction + 360) % 360;
}

function asEpoch(time: string): number | null {
  const value = Date.parse(time);
  return Number.isFinite(value) ? value : null;
}

function weatherAtTime(node: EnvironmentNode, time: string): NodeWeather | null {
  const target = asEpoch(time);
  if (target === null) return null;

  const hours = [...node.hourly]
    .map((hour) => ({ hour, epoch: asEpoch(hour.time) }))
    .filter((entry): entry is { hour: EnvironmentHour; epoch: number } => entry.epoch !== null)
    .sort((a, b) => a.epoch - b.epoch);

  if (hours.length === 0 || target < hours[0].epoch || target > hours.at(-1)!.epoch) return null;

  const upperIndex = hours.findIndex((entry) => entry.epoch >= target);
  const upper = hours[upperIndex];
  if (upper.epoch === target || upperIndex === 0) {
    return {
      temperatureC: upper.hour.temperatureC,
      precipitationMm: upper.hour.precipitationMm,
      snowfallCm: upper.hour.snowfallCm,
      windSpeedKmh: upper.hour.windSpeedKmh,
      windGustKmh: upper.hour.windGustKmh,
      windDirectionDeg: upper.hour.windDirectionDeg,
    };
  }

  const lower = hours[upperIndex - 1];
  const fraction = (target - lower.epoch) / (upper.epoch - lower.epoch);
  return {
    temperatureC: lerpNullable(lower.hour.temperatureC, upper.hour.temperatureC, fraction),
    precipitationMm: lower.hour.precipitationMm,
    snowfallCm: lower.hour.snowfallCm,
    windSpeedKmh: lerpNullable(lower.hour.windSpeedKmh, upper.hour.windSpeedKmh, fraction),
    windGustKmh: lerpNullable(lower.hour.windGustKmh, upper.hour.windGustKmh, fraction),
    windDirectionDeg: lerpDirection(lower.hour.windDirectionDeg, upper.hour.windDirectionDeg, fraction),
  };
}

function contextState(snapshotState: SourceState, weather: NodeWeather): SourceState {
  const values = [
    weather.temperatureC,
    weather.precipitationMm,
    weather.snowfallCm,
    weather.windSpeedKmh,
    weather.windGustKmh,
    weather.windDirectionDeg,
  ];
  if (values.every((value) => value === null)) return 'UNAVAILABLE';
  if (values.some((value) => value === null) && snapshotState === 'READY') return 'PARTIAL';
  return snapshotState;
}

export function environmentAtPassage(
  snapshot: EnvironmentSnapshot,
  corridorId: string,
  distanceKm: number,
  time: string,
): EnvironmentContext {
  if (snapshot.sourceState === 'UNAVAILABLE') return unavailableEnvironmentContext();

  const nodes = snapshot.nodes
    .filter((node) => node.corridorId === corridorId)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (nodes.length === 0) return unavailableEnvironmentContext();

  const boundedDistance = Math.max(nodes[0].distanceKm, Math.min(nodes.at(-1)!.distanceKm, distanceKm));
  let lower = nodes[0];
  let upper = nodes.at(-1)!;

  for (const node of nodes) {
    if (node.distanceKm <= boundedDistance) lower = node;
    if (node.distanceKm >= boundedDistance) {
      upper = node;
      break;
    }
  }

  const lowerWeather = weatherAtTime(lower, time);
  const upperWeather = weatherAtTime(upper, time);
  if (!lowerWeather || !upperWeather) return unavailableEnvironmentContext();

  const distanceSpan = upper.distanceKm - lower.distanceKm;
  const fraction = distanceSpan === 0 ? 0 : (boundedDistance - lower.distanceKm) / distanceSpan;
  const nearestWeather = fraction <= 0.5 ? lowerWeather : upperWeather;
  const weather: NodeWeather = {
    temperatureC: lerpNullable(lowerWeather.temperatureC, upperWeather.temperatureC, fraction),
    precipitationMm: nearestWeather.precipitationMm,
    snowfallCm: nearestWeather.snowfallCm,
    windSpeedKmh: lerpNullable(lowerWeather.windSpeedKmh, upperWeather.windSpeedKmh, fraction),
    windGustKmh: lerpNullable(lowerWeather.windGustKmh, upperWeather.windGustKmh, fraction),
    windDirectionDeg: lerpDirection(lowerWeather.windDirectionDeg, upperWeather.windDirectionDeg, fraction),
  };

  return {
    sourceState: contextState(snapshot.sourceState, weather),
    ...weather,
    evidenceRefs: [...snapshot.evidenceRefs],
  };
}
