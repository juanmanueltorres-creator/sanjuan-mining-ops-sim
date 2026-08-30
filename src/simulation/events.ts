import type { CorridorDefinition, OperationalEvent, VehicleDefinition } from '../domain/contracts';

export function sortOperationalEvents(events: OperationalEvent[]): OperationalEvent[] {
  return events;
}

export function deriveOperationalEvents(_vehicle: VehicleDefinition, _corridor: CorridorDefinition): OperationalEvent[] {
  return [];
}
