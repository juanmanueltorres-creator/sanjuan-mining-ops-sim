import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorridorDefinition } from '../domain/contracts';

const loaders = vi.hoisted(() => ({
  loadStaticOperationData: vi.fn(),
  loadStaticRunArtifacts: vi.fn(),
  loadTrafficCalibration: vi.fn(),
}));

vi.mock('../data/loadOperation', async () => {
  const actual = await vi.importActual<typeof import('../data/loadOperation')>('../data/loadOperation');
  return {
    ...actual,
    loadStaticOperationData: loaders.loadStaticOperationData,
    loadStaticRunArtifacts: loaders.loadStaticRunArtifacts,
    loadTrafficCalibration: loaders.loadTrafficCalibration,
  };
});

import { App } from './App';

function corridor(id: string, distanceKm: number): CorridorDefinition {
  return {
    id,
    name: `San Juan → ${id}`,
    origin: { id: 'san-juan', name: 'San Juan', lat: -31.5375, lon: -68.5364 },
    destination: { id, name: id, lat: -30.5, lon: -69.5 },
    geometry: { type: 'LineString', coordinates: [[-68.5364, -31.5375], [-69.5, -30.5]] },
    geometryClass: 'RECONSTRUCTED_ACCESS',
    segments: [{
      id: `${id}-01`, corridorId: id, startKm: 0, endKm: distanceKm, distanceKm,
      elevationMinM: 650, elevationMaxM: 1700, roadClass: 'pavedLowland',
      geometryConfidence: 'RECONSTRUCTED_ACCESS', environmentNodeIds: [],
    }],
    nodes: [],
    elevationProfile: {
      source: 'fixture', resolution: 'fixture', method: 'fixture',
      samples: [{ distanceKm: 0, elevationM: 650 }, { distanceKm, elevationM: 1700 }], limitations: [],
    },
    routeSamples: [
      { distanceKm: 0, lon: -68.5364, lat: -31.5375, elevationM: 650, segmentId: `${id}-01` },
      { distanceKm, lon: -69.5, lat: -30.5, elevationM: 1700, segmentId: `${id}-01` },
    ],
    evidenceRefs: [`${id}-evidence`], retrievedAt: '2026-08-30', limitations: [],
  };
}

const operationData = {
  projects: [],
  corridors: [corridor('hualilan', 120), corridor('veladero', 360), corridor('los-azules', 276)],
  evidence: [],
};

const runArtifacts = {
  run: {
    id: 'sanjuan-v0-run-20260830-v1',
    targetDate: '2026-08-30',
    issuedAt: '2026-08-30T08:28:42.682Z',
    dataAsOf: '2026-08-30T08:28:42.682Z',
    timezone: 'America/Argentina/San_Juan' as const,
    mode: 'SIMULATED' as const,
    modelVersion: 'movement-v0.1',
    scenarioVersion: 'sanjuan-operation-v0.1',
    seed: 'sanjuan-v0-20260830',
    environmentSnapshotId: 'environment-sj-20260830-v1',
    provenance: ['open-meteo-forecast-20260830'],
  },
  environment: {
    schemaVersion: 'sanjuan.environment/v1',
    id: 'environment-sj-20260830-v1',
    issuedAt: '2026-08-30T08:28:42.682Z',
    dataAsOf: '2026-08-30T08:28:42.682Z',
    targetDate: '2026-08-30',
    timezone: 'America/Argentina/San_Juan' as const,
    provider: 'Open-Meteo Forecast API · Best Match',
    modelKind: 'FORECAST' as const,
    nodes: [],
    sourceState: 'READY' as const,
    evidenceRefs: ['open-meteo-forecast-20260830'],
    limitations: ['Modelled weather only.'],
  },
};

const trafficCalibration = {
  id: 'traffic-calibration-v1',
  baseVisibleVehicles: 20,
  maxVisibleVehicles: 24,
  timeBands: [
    { startMinute: 360, endMinute: 540, relativeIntensity: 0.65 },
    { startMinute: 540, endMinute: 720, relativeIntensity: 1 },
    { startMinute: 720, endMinute: 960, relativeIntensity: 0.8 },
    { startMinute: 960, endMinute: 1201, relativeIntensity: 0.55 },
  ],
  corridorWeights: [
    { corridorId: 'hualilan' as const, weight: 0.34 },
    { corridorId: 'veladero' as const, weight: 0.33 },
    { corridorId: 'los-azules' as const, weight: 0.33 },
  ],
  evidenceRefs: ['dnv-tmda-2017'],
  limitations: ['Synthetic background traffic only; not live San Juan traffic.'],
  evidence: [{
    id: 'dnv-tmda-2017', role: 'CALIBRATION' as const, sourceName: 'DNV TMDA historical traffic', retrievedAt: '2026-08-30',
    limitations: ['Historical reference; not live traffic.'],
  }],
};

beforeEach(() => {
  loaders.loadStaticOperationData.mockReset();
  loaders.loadStaticRunArtifacts.mockReset();
  loaders.loadTrafficCalibration.mockReset();
  loaders.loadStaticOperationData.mockResolvedValue(operationData);
  loaders.loadStaticRunArtifacts.mockResolvedValue(runArtifacts);
  loaders.loadTrafficCalibration.mockResolvedValue(trafficCalibration);
});

describe('App', () => {
  it('enters the shift on explicit user action and stays paused at 06:00', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('SAN JUAN · MINING OPERATIONS')).toBeVisible();
    expect(screen.getByText(/synthetic operation/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(screen.queryByRole('button', { name: /start shift/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /3d operational map/i })).toBeVisible();
    expect(screen.getAllByText('06:00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /play/i })).toBeVisible();
  });

  it('loads the checked-in run/environment pair and exposes its modelled source state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(await screen.findByText('MODELLED WEATHER · READY')).toBeVisible();
    expect(loaders.loadStaticRunArtifacts).toHaveBeenCalledTimes(1);
  });

  it('loads synthetic background calibration and exposes its provenance drawer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(await screen.findByText('BACKGROUND TRAFFIC · SYNTHETIC')).toBeVisible();
    expect(loaders.loadTrafficCalibration).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /sources/i }));
    expect(screen.getByRole('complementary', { name: /sources and limitations/i })).toBeVisible();
    expect(screen.getByText(/not live San Juan traffic/i)).toBeVisible();
  });

  it('keeps compact cartographic instruments visible and fails closed without WebGL cursor data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(screen.getByLabelText(/map orientation/i)).toHaveTextContent('N');
    expect(screen.getByText('SCALE UNAVAILABLE')).toBeVisible();
    expect(screen.getByText('CURSOR · TERRAIN UNAVAILABLE')).toBeVisible();
    expect(screen.getByRole('button', { name: /regional view/i })).toBeVisible();
  });
});
