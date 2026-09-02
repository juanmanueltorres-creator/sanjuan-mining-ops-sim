import type { EnvironmentContext, VehicleSnapshot } from '../domain/contracts';

export interface VehiclePanelProps {
  vehicle: VehicleSnapshot | null;
  corridorName?: string;
}

function formatMinuteOfDay(value: number | null): string {
  if (value === null) return '—';
  const totalMinutes = Math.max(0, Math.round(value));
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minuteOfDay = totalMinutes % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return dayOffset > 0 ? `${time} +${dayOffset}d` : time;
}

function etaLabel(vehicle: VehicleSnapshot): string {
  if (vehicle.etaMinute === null) return 'ETA';
  return vehicle.direction === 'TO_PROJECT' ? 'Project ETA' : 'Base ETA';
}

function operationalCorridorLabel(vehicle: VehicleSnapshot, corridorName?: string): string {
  const label = corridorName ?? vehicle.corridorId;
  if (vehicle.direction !== 'RETURN_TO_BASE' || !label.includes('→')) return label;

  const stops = label.split('→').map((stop) => stop.trim()).filter(Boolean);
  return stops.length > 1 ? stops.reverse().join(' → ') : label;
}

function formatValue(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toFixed(1)} ${unit}`;
}

function EnvironmentBlock({ context }: { context?: EnvironmentContext }) {
  if (!context) {
    return (
      <div className="environment-placeholder" role="status">
        <span>MODELLED ENVIRONMENT PENDING</span>
        <small>Weather-at-passage requires the versioned environment snapshot for this run.</small>
      </div>
    );
  }

  return (
    <section className="environment-context" aria-label="Modelled environment at passage">
      <div className="environment-context-header">
        <span>MODELLED ENVIRONMENT</span>
        <span className="source-state">{context.sourceState}</span>
      </div>
      <dl className="environment-stats">
        <div><dt>Temperature</dt><dd>{formatValue(context.temperatureC, '°C')}</dd></div>
        <div><dt>Wind gust</dt><dd>{formatValue(context.windGustKmh, 'km/h')}</dd></div>
        <div><dt>Precipitation</dt><dd>{formatValue(context.precipitationMm, 'mm')}</dd></div>
      </dl>
      <small>Modelled context only · no road-condition or transitability inference.</small>
    </section>
  );
}

export function VehiclePanel({ vehicle, corridorName }: VehiclePanelProps) {
  if (!vehicle) return null;

  return (
    <aside className="vehicle-panel" aria-label={`Vehicle ${vehicle.id}`}>
      <div className="vehicle-panel-header">
        <div>
          <p className="eyebrow">SELECTED MOBILIZATION</p>
          <h2>{vehicle.id}</h2>
        </div>
        <span className="state-chip">{vehicle.state.replaceAll('_', ' ')}</span>
      </div>

      <p className="vehicle-corridor">{operationalCorridorLabel(vehicle, corridorName)}</p>

      <dl className="vehicle-stats">
        <div><dt>Type</dt><dd>{vehicle.type}</dd></div>
        <div><dt>Distance</dt><dd>{vehicle.distanceKm.toFixed(1)} km</dd></div>
        <div><dt>Elevation</dt><dd>{Math.round(vehicle.elevationM).toLocaleString('en-US')} m</dd></div>
        <div><dt>{etaLabel(vehicle)}</dt><dd>{formatMinuteOfDay(vehicle.etaMinute)}</dd></div>
      </dl>

      <EnvironmentBlock context={vehicle.environmentContext} />
    </aside>
  );
}
