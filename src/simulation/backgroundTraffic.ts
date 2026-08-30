export type BackgroundCorridorId = 'hualilan' | 'veladero' | 'los-azules';

export interface TrafficTimeBand {
  startMinute: number;
  endMinute: number;
  relativeIntensity: number;
}

export interface TrafficCorridorWeight {
  corridorId: BackgroundCorridorId;
  weight: number;
}

export interface TrafficCalibration {
  baseVisibleVehicles: number;
  maxVisibleVehicles: number;
  timeBands: TrafficTimeBand[];
  corridorWeights: TrafficCorridorWeight[];
}

export interface BackgroundTrafficVehicle {
  id: string;
  corridorId: BackgroundCorridorId;
  direction: 'OUTBOUND' | 'INBOUND';
  progress: number;
  visualWeight: 'BACKGROUND';
}

export function backgroundTrafficAt(
  _seed: string | number,
  _minuteOfDay: number,
  _calibration: TrafficCalibration,
): BackgroundTrafficVehicle[] {
  return [];
}
