import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaticRunArtifacts, StaticTrafficCalibration } from '../data/loadOperation';
import { AnalysisDrawer } from './AnalysisDrawer';

const runArtifacts = {
  run: {
    id: 'run-v1', targetDate: '2026-08-30', issuedAt: '2026-08-30T08:30:00Z', dataAsOf: '2026-08-30T08:30:00Z',
    timezone: 'America/Argentina/San_Juan', mode: 'SIMULATED', modelVersion: 'movement-v0.1', scenarioVersion: 'scenario-v0.1',
    seed: 'seed', environmentSnapshotId: 'environment-v1', provenance: ['weather-source'],
  },
  environment: {
    schemaVersion: 'sanjuan.environment/v1', id: 'environment-v1', issuedAt: '2026-08-30T08:30:00Z', dataAsOf: '2026-08-30T08:30:00Z',
    targetDate: '2026-08-30', timezone: 'America/Argentina/San_Juan', provider: 'Open-Meteo Forecast API · Best Match', modelKind: 'FORECAST',
    sourceState: 'READY', evidenceRefs: ['weather-source'], limitations: ['Modelled weather only; not a station observation.'], nodes: [],
  },
  evidence: [{
    id: 'weather-source', role: 'PRIMARY', sourceName: 'Open-Meteo Forecast API · Best Match', retrievedAt: '2026-08-30',
    method: 'Versioned modelled weather fixture.', limitations: ['Modelled weather only; not a station observation.'],
  }],
} as StaticRunArtifacts;

const traffic = {
  id: 'traffic-calibration-v1', baseVisibleVehicles: 20, maxVisibleVehicles: 24,
  timeBands: [{ startMinute: 360, endMinute: 1201, relativeIntensity: 1 }],
  corridorWeights: [
    { corridorId: 'hualilan', weight: 0.34 }, { corridorId: 'veladero', weight: 0.33 }, { corridorId: 'los-azules', weight: 0.33 },
  ],
  evidenceRefs: ['dnv-tmda-2017'],
  limitations: ['Synthetic background traffic only; not live San Juan traffic.'],
  evidence: [{
    id: 'dnv-tmda-2017', role: 'CALIBRATION', sourceName: 'DNV TMDA historical traffic', retrievedAt: '2026-08-30',
    method: 'Relative visual calibration only.', limitations: ['Historical reference; not live traffic.'],
  }],
} as StaticTrafficCalibration;

describe('AnalysisDrawer', () => {
  it('keeps modelled weather and synthetic traffic provenance explicit', () => {
    render(<AnalysisDrawer open onClose={vi.fn()} operation={null} runArtifacts={runArtifacts} traffic={traffic} />);

    expect(screen.getByRole('complementary', { name: /sources and limitations/i })).toBeVisible();
    expect(screen.getByText('MODELLED WEATHER')).toBeVisible();
    expect(screen.getByText('Versioned modelled weather fixture.')).toBeVisible();
    expect(screen.getByText('SYNTHETIC BACKGROUND TRAFFIC')).toBeVisible();
    expect(screen.getByText(/not live San Juan traffic/i)).toBeVisible();
    expect(screen.getByText(/limitations/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /close sources/i })).toBeVisible();
  });
});
