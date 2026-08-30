import type {
  CorridorDefinition,
  CorridorSegment,
  VehicleDefinition,
  VehicleSnapshot,
  VehicleType,
} from '../domain/contracts';
import { positionAtDistance } from './routeMath';
import { SPEED_PROFILES, type SyntheticRoadClass } from './schedule';

function parseMinuteOfDay(value: string): number {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid departureTime: ${value}`);
  }
  return hour * 60 + minute;
}

function speedFor(type: VehicleType, roadClass: string): number {
  const speed = SPEED_PROFILES[type][roadClass as SyntheticRoadClass];
  if (!speed) throw new Error(`Unsupported synthetic road class: ${roadClass}`);
  return speed;
}

function sortedSegments(corridor: CorridorDefinition): CorridorSegment[] {
  return [...corridor.segments].sort((a, b) => a.startKm - b.startKm);
}

function routeEndKm(corridor: CorridorDefinition): number {
  const last = corridor.routeSamples.at(-1);
  if (!last) throw new Error(`Corridor ${corridor.id} has no route samples`);
  return last.distanceKm;
}

function travelMinutesBetween(
  corridor: CorridorDefinition,
  type: VehicleType,
  startKm: number,
  endKm: number,
): number {
  const low = Math.min(startKm, endKm);
  const high = Math.max(startKm, endKm);
  let minutes = 0;

  for (const segment of sortedSegments(corridor)) {
    const overlapStart = Math.max(low, segment.startKm);
    const overlapEnd = Math.min(high, segment.endKm);
    if (overlapEnd <= overlapStart) continue;
    minutes += ((overlapEnd - overlapStart) / speedFor(type, segment.roadClass)) * 60;
  }

  return minutes;
}

function distanceAfterOutboundTravel(
  corridor: CorridorDefinition,
  type: VehicleType,
  startKm: number,
  targetKm: number,
  elapsedMinutes: number,
): number {
  let currentKm = startKm;
  let remaining = Math.max(0, elapsedMinutes);

  for (const segment of sortedSegments(corridor)) {
    if (segment.endKm <= currentKm || segment.startKm >= targetKm) continue;
    const spanStart = Math.max(currentKm, segment.startKm);
    const spanEnd = Math.min(targetKm, segment.endKm);
    if (spanEnd <= spanStart) continue;
    const speed = speedFor(type, segment.roadClass);
    const spanMinutes = ((spanEnd - spanStart) / speed) * 60;
    if (remaining < spanMinutes) return spanStart + (remaining / 60) * speed;
    remaining -= spanMinutes;
    currentKm = spanEnd;
  }

  return targetKm;
}

function distanceAfterReturnTravel(
  corridor: CorridorDefinition,
  type: VehicleType,
  startKm: number,
  elapsedMinutes: number,
): number {
  let currentKm = startKm;
  let remaining = Math.max(0, elapsedMinutes);

  for (const segment of sortedSegments(corridor).reverse()) {
    if (segment.startKm >= currentKm) continue;
    const spanEnd = Math.min(currentKm, segment.endKm);
    const spanStart = segment.startKm;
    if (spanEnd <= spanStart) continue;
    const speed = speedFor(type, segment.roadClass);
    const spanMinutes = ((spanEnd - spanStart) / speed) * 60;
    if (remaining < spanMinutes) return spanEnd - (remaining / 60) * speed;
    remaining -= spanMinutes;
    currentKm = spanStart;
  }

  return 0;
}

function makeSnapshot(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  distanceKm: number,
  state: VehicleSnapshot['state'],
  direction: VehicleSnapshot['direction'],
  etaMinute: number | null,
): VehicleSnapshot {
  const point = positionAtDistance(corridor.routeSamples, distanceKm);
  return {
    id: vehicle.id,
    type: vehicle.type,
    corridorId: corridor.id,
    state,
    direction,
    position: { lon: point.lon, lat: point.lat },
    distanceKm: point.distanceKm,
    elevationM: point.elevationM,
    segmentId: point.segmentId,
    etaMinute,
  };
}

export function snapshotVehicle(
  vehicle: VehicleDefinition,
  corridor: CorridorDefinition,
  simMinute: number,
): VehicleSnapshot {
  const departureMinute = parseMinuteOfDay(vehicle.departureTime);
  const totalKm = routeEndKm(corridor);
  const nonProjectStops = vehicle.plannedStops
    .filter((stop) => stop.type !== 'PROJECT')
    .map((stop) => ({ ...stop, distanceKm: Math.min(totalKm, Math.max(0, stop.distanceKm)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const projectDwell = vehicle.plannedStops.find((stop) => stop.type === 'PROJECT')?.dwellMinutes ?? 0;
  const outboundTravelMinutes = travelMinutesBetween(corridor, vehicle.type, 0, totalKm);
  const outboundStopMinutes = nonProjectStops.reduce((sum, stop) => sum + stop.dwellMinutes, 0);
  const projectArrivalMinute = departureMinute + outboundTravelMinutes + outboundStopMinutes;
  const returnStartMinute = projectArrivalMinute + projectDwell;
  const returnTravelMinutes = travelMinutesBetween(corridor, vehicle.type, 0, totalKm);
  const baseArrivalMinute = returnStartMinute + returnTravelMinutes;

  if (simMinute < departureMinute) {
    return makeSnapshot(vehicle, corridor, 0, 'AT_BASE', 'TO_PROJECT', projectArrivalMinute);
  }

  let elapsed = simMinute - departureMinute;
  let currentKm = 0;

  for (const stop of nonProjectStops) {
    const travelMinutes = travelMinutesBetween(corridor, vehicle.type, currentKm, stop.distanceKm);
    if (elapsed < travelMinutes) {
      const distanceKm = distanceAfterOutboundTravel(corridor, vehicle.type, currentKm, stop.distanceKm, elapsed);
      return makeSnapshot(vehicle, corridor, distanceKm, 'EN_ROUTE', 'TO_PROJECT', projectArrivalMinute);
    }

    elapsed -= travelMinutes;
    currentKm = stop.distanceKm;

    if (elapsed < stop.dwellMinutes) {
      return makeSnapshot(vehicle, corridor, currentKm, 'AT_STOP', 'TO_PROJECT', projectArrivalMinute);
    }
    elapsed -= stop.dwellMinutes;
  }

  const finalOutboundMinutes = travelMinutesBetween(corridor, vehicle.type, currentKm, totalKm);
  if (elapsed < finalOutboundMinutes) {
    const distanceKm = distanceAfterOutboundTravel(corridor, vehicle.type, currentKm, totalKm, elapsed);
    return makeSnapshot(vehicle, corridor, distanceKm, 'EN_ROUTE', 'TO_PROJECT', projectArrivalMinute);
  }

  if (simMinute < returnStartMinute) {
    return makeSnapshot(vehicle, corridor, totalKm, 'AT_PROJECT', 'RETURN_TO_BASE', baseArrivalMinute);
  }

  if (simMinute < baseArrivalMinute) {
    const returnElapsed = simMinute - returnStartMinute;
    const distanceKm = distanceAfterReturnTravel(corridor, vehicle.type, totalKm, returnElapsed);
    return makeSnapshot(vehicle, corridor, distanceKm, 'RETURNING', 'RETURN_TO_BASE', baseArrivalMinute);
  }

  return makeSnapshot(vehicle, corridor, 0, 'DONE', 'RETURN_TO_BASE', null);
}
