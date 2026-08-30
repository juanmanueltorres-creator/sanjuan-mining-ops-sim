import type { EnvironmentContext, VehicleSnapshot } from '../domain/contracts';

export interface VehiclePanelProps {
  vehicle: VehicleSnapshot | null;
  corridorName?: string;
}

function formatMinuteOfDay(value: number | null): string {
  if (value === null) return '—';
  const minuteOfDay = Math.max(0, Math.min(1439, Math.round(value)));
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

      <p className="vehicle-corridor">{corridorName ?? vehicle.corridorId}</p>

      <dl className="vehicle-stats">
        <div><dt>Type</dt><dd>{vehicle.type}</dd></div>
        <div><dt>Distance</dt><dd>{vehicle.distanceKm.toFixed(1)} km</dd></div>
        <div><dt>Elevation</dt><dd>{Math.round(vehicle.elevationM).toLocaleString('en-US')} m</dd></div>
        <div><dt>ETA</dt><dd>{formatMinuteOfDay(vehicle.etaMinute)}</dd></div>
      </dl>

      <EnvironmentBlock context={vehicle.environmentContext} />
    </aside>
  );
}
