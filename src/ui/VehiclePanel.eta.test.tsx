import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VehicleSnapshot } from '../domain/contracts';
import { VehiclePanel } from './VehiclePanel';

function vehicle(overrides: Partial<VehicleSnapshot>): VehicleSnapshot {
  return {
    id: 'VEH-PERS-08',
    type: 'PERSONNEL',
    corridorId: 'veladero',
    state: 'EN_ROUTE',
    direction: 'TO_PROJECT',
    position: { lon: -69.4, lat: -30.8 },
    distanceKm: 127.4,
    elevationM: 4300,
    segmentId: 'veladero-fixture',
    etaMinute: 775,
    ...overrides,
  };
}

describe('VehiclePanel ETA semantics', () => {
  it('labels outbound ETA as project arrival', () => {
    render(<VehiclePanel vehicle={vehicle({ state: 'EN_ROUTE', direction: 'TO_PROJECT', etaMinute: 775 })} />);

    expect(screen.getByText('Project ETA')).toBeVisible();
    expect(screen.getByText('12:55')).toBeVisible();
  });

  it('labels return ETA as base arrival and preserves next-day time instead of clamping to 23:59', () => {
    render(<VehiclePanel vehicle={vehicle({ state: 'AT_PROJECT', direction: 'RETURN_TO_BASE', etaMinute: 1475 })} />);

    expect(screen.getByText('Base ETA')).toBeVisible();
    expect(screen.getByText('00:35 +1d')).toBeVisible();
    expect(screen.queryByText('23:59')).not.toBeInTheDocument();
  });

  it('keeps the outbound corridor label in project-bound order', () => {
    render(
      <VehiclePanel
        vehicle={vehicle({ state: 'EN_ROUTE', direction: 'TO_PROJECT' })}
        corridorName="San Juan → Calingasta → Los Azules"
      />,
    );

    expect(screen.getByText('San Juan → Calingasta → Los Azules')).toBeVisible();
  });

  it('reverses the corridor label when the vehicle is returning to base', () => {
    render(
      <VehiclePanel
        vehicle={vehicle({ state: 'RETURNING', direction: 'RETURN_TO_BASE' })}
        corridorName="San Juan → Calingasta → Los Azules"
      />,
    );

    expect(screen.getByText('Los Azules → Calingasta → San Juan')).toBeVisible();
    expect(screen.queryByText('San Juan → Calingasta → Los Azules')).not.toBeInTheDocument();
  });
});
