import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaders = vi.hoisted(() => ({
  loadStaticOperationData: vi.fn(),
  loadStaticRunArtifacts: vi.fn(),
  loadTrafficCalibration: vi.fn(),
  loadRoadContext: vi.fn(),
}));

vi.mock('../data/loadOperation', () => ({
  loadStaticOperationData: loaders.loadStaticOperationData,
  loadStaticRunArtifacts: loaders.loadStaticRunArtifacts,
  loadTrafficCalibration: loaders.loadTrafficCalibration,
}));

vi.mock('../data/loadRoadContext', async () => {
  const actual = await vi.importActual<typeof import('../data/loadRoadContext')>('../data/loadRoadContext');
  return { ...actual, loadRoadContext: loaders.loadRoadContext };
});

vi.mock('../data/buildOperationSpec', () => ({
  buildV0OperationSpec: () => ({ fleet: [], corridors: [] }),
}));

vi.mock('../simulation/backgroundTraffic', () => ({
  backgroundTrafficAt: () => [],
}));

vi.mock('../simulation/engine', () => ({
  getOperationalSnapshot: () => ({
    simTime: 360,
    vehicles: [],
    corridorStates: [],
    operationalEvents: [],
    contextEvents: [],
    metrics: { activeVehicles: 0, atProject: 0, returning: 0, done: 0 },
  }),
}));

vi.mock('../map/CesiumStage', () => ({ CesiumStage: () => <div data-testid="cesium-stage" /> }));
vi.mock('../ui/CommandHud', () => ({ CommandHud: () => <div /> }));
vi.mock('../ui/Timeline', () => ({ Timeline: () => <div /> }));
vi.mock('../ui/VehiclePanel', () => ({ VehiclePanel: () => <div /> }));
vi.mock('../ui/AnalysisDrawer', () => ({ AnalysisDrawer: () => null }));
vi.mock('../ui/IntroOverlay', () => ({
  IntroOverlay: ({ onStart }: { onStart: () => void }) => <button type="button" onClick={onStart}>Start Shift</button>,
}));

import { App } from './App';

beforeEach(() => {
  loaders.loadStaticOperationData.mockReset();
  loaders.loadStaticRunArtifacts.mockReset();
  loaders.loadTrafficCalibration.mockReset();
  loaders.loadRoadContext.mockReset();

  loaders.loadStaticOperationData.mockResolvedValue({ projects: [], corridors: [], evidence: [], geometrySources: [] });
  loaders.loadStaticRunArtifacts.mockResolvedValue({
    run: { seed: 'fixture-seed' },
    environment: { sourceState: 'READY' },
    evidence: [],
  });
  loaders.loadTrafficCalibration.mockResolvedValue({ maxVisibleVehicles: 0 });
});

describe('App optional road context', () => {
  it('keeps required operational data available when road context fails independently', async () => {
    const user = userEvent.setup();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loaders.loadRoadContext.mockRejectedValue(new Error('road context fixture unavailable'));

    render(<App />);
    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(await screen.findByText('10 projects · 3 operational corridors · 24 synthetic units')).toBeVisible();
    expect(screen.getByText('MODELLED WEATHER · READY')).toBeVisible();
    expect(screen.queryByText('Operational data unavailable')).not.toBeInTheDocument();
    expect(loaders.loadRoadContext).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Road context unavailable; continuing without contextual roads.',
      expect.any(Error),
    );

    warning.mockRestore();
  });
});
