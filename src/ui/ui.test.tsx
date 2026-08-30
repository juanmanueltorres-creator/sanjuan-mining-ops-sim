import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OperationalMetrics, VehicleSnapshot } from '../domain/contracts';
import { IntroOverlay } from './IntroOverlay';
import { CommandHud } from './CommandHud';
import { Timeline } from './Timeline';
import { VehiclePanel } from './VehiclePanel';

const metrics: OperationalMetrics = { activeVehicles: 7, atProject: 2, returning: 1, done: 3 };
const selected: VehicleSnapshot = {
  id: 'VEH-PERS-07',
  type: 'PERSONNEL',
  corridorId: 'veladero',
  state: 'EN_ROUTE',
  direction: 'TO_PROJECT',
  position: { lon: -69.1, lat: -30.2 },
  distanceKm: 86.2,
  elevationM: 3870,
  segmentId: 'veladero-high-mountain',
  etaMinute: 616,
};

describe('operational UI', () => {
  it('keeps the intro short, explicit about synthetic operation, and starts only on user action', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<IntroOverlay onStart={onStart} />);

    expect(screen.getByText('SAN JUAN · MINING OPERATIONS')).toBeVisible();
    expect(screen.getByText(/territory, time and movement/i)).toBeVisible();
    expect(screen.getByText(/synthetic operation/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /start shift/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a compact command HUD and delegates playback controls', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const onPlaybackChange = vi.fn();

    render(
      <CommandHud
        minuteOfDay={360}
        playback={300}
        playing={false}
        metrics={metrics}
        onToggle={onToggle}
        onReset={onReset}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    expect(screen.getByText('06:00')).toBeVisible();
    expect(screen.getByText('7 active')).toBeVisible();
    expect(screen.getByRole('button', { name: /play/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /reset/i })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /play/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /playback speed/i }), '600');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPlaybackChange).toHaveBeenCalledWith(600);
  });

  it('exposes the full 06:00–20:00 timeline without hiding its endpoints', () => {
    const onSeek = vi.fn();
    render(<Timeline minuteOfDay={600} onSeek={onSeek} />);

    expect(screen.getByText('06:00')).toBeVisible();
    expect(screen.getByText('20:00')).toBeVisible();
    const slider = screen.getByRole('slider', { name: /operational timeline/i });
    expect(slider).toHaveAttribute('min', '360');
    expect(slider).toHaveAttribute('max', '1200');

    fireEvent.change(slider, { target: { value: '720' } });
    expect(onSeek).toHaveBeenCalledWith(720);
  });

  it('shows selected vehicle detail compactly and does not invent environment context', () => {
    render(<VehiclePanel vehicle={selected} corridorName="San Juan → Veladero" />);

    expect(screen.getByText('VEH-PERS-07')).toBeVisible();
    expect(screen.getByText('San Juan → Veladero')).toBeVisible();
    expect(screen.getByText('86.2 km')).toBeVisible();
    expect(screen.getByText('3,870 m')).toBeVisible();
    expect(screen.getByText('10:16')).toBeVisible();
    expect(screen.getByText(/modelled environment pending/i)).toBeVisible();
    expect(screen.queryByText(/safe|unsafe|road closed/i)).not.toBeInTheDocument();
  });

  it('shows modelled weather-at-passage with source state when environment context exists', () => {
    const enriched: VehicleSnapshot = {
      ...selected,
      environmentContext: {
        sourceState: 'READY',
        temperatureC: -1.4,
        precipitationMm: 0.2,
        snowfallCm: 0,
        windSpeedKmh: 34.1,
        windGustKmh: 58,
        windDirectionDeg: 271,
        evidenceRefs: ['open-meteo-forecast-20260830'],
      },
    };

    render(<VehiclePanel vehicle={enriched} corridorName="San Juan → Veladero" />);

    expect(screen.getByText('MODELLED ENVIRONMENT')).toBeVisible();
    expect(screen.getByText('READY')).toBeVisible();
    expect(screen.getByText('-1.4 °C')).toBeVisible();
    expect(screen.getByText('58.0 km/h')).toBeVisible();
    expect(screen.getByText('0.2 mm')).toBeVisible();
    expect(screen.queryByText(/safe|unsafe|road closed/i)).not.toBeInTheDocument();
  });
});
