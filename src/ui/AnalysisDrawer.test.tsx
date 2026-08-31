import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaticOperationData, StaticRunArtifacts, StaticTrafficCalibration } from '../data/loadOperation';
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

function operationWithGeometrySources(usedSourceIds: string[]): StaticOperationData {
  return {
    projects: [],
    evidence: [],
    geometrySources: [
      {
        id: 'official', provider: 'Dirección Nacional de Vialidad', datasetName: 'Rutas Nacionales', sourceUrl: 'https://example.test/dnv',
        retrievedAt: '2026-08-30', role: 'PRIMARY', format: 'GeoJSON', featureIds: ['official-1'], limitations: ['Reference geometry only.'],
      },
      {
        id: 'osm', provider: 'OpenStreetMap via Overpass API', datasetName: 'Publicly mapped high-mountain access ways', sourceUrl: 'https://example.test/osm',
        retrievedAt: '2026-08-30', role: 'FALLBACK', format: 'OSM', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors',
        featureIds: ['osm-way-1'], limitations: ['Publicly mapped access only.'],
      },
    ],
    corridors: [{
      id: 'veladero', name: 'Veladero',
      origin: { id: 'origin', name: 'Origin', lon: -68.5, lat: -31.5 },
      destination: { id: 'destination', name: 'Destination', lon: -69.9, lat: -29.3 },
      geometry: { type: 'LineString', coordinates: [[-68.5, -31.5], [-69.9, -29.3]] },
      geometryClass: 'RECONSTRUCTED_ACCESS',
      geometrySegments: usedSourceIds.map((sourceDatasetId, index) => ({
        id: `geometry-${index}`,
        corridorId: 'veladero',
        geometryClass: sourceDatasetId === 'official' ? 'PUBLIC_ROAD' : 'RECONSTRUCTED_ACCESS',
        geometry: { type: 'LineString', coordinates: [[-68.5 - index * 0.1, -31.5], [-68.6 - index * 0.1, -31.4]] },
        sourceFeatureIds: sourceDatasetId === 'official' ? ['official-1'] : ['osm-way-1'],
        evidenceRefs: [], sourceDatasetId, sourceRetrievedAt: '2026-08-30', limitations: [],
      })),
      segments: [], nodes: [],
      elevationProfile: { source: 'fixture', resolution: 'fixture', method: 'fixture', samples: [], limitations: [] },
      routeSamples: [
        { distanceKm: 0, lon: -68.5, lat: -31.5, elevationM: 650, segmentId: 'veladero-01' },
        { distanceKm: 360, lon: -69.9, lat: -29.3, elevationM: 4300, segmentId: 'veladero-06' },
      ],
      evidenceRefs: [], retrievedAt: '2026-08-30', limitations: [],
    }],
  };
}

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

  it('lists only geometry sources used by physical V2 segments and exposes required attribution', () => {
    render(
      <AnalysisDrawer
        open
        onClose={vi.fn()}
        operation={operationWithGeometrySources(['official', 'osm'])}
        runArtifacts={runArtifacts}
        traffic={traffic}
      />,
    );

    expect(screen.getByText('ROAD GEOMETRY')).toBeVisible();
    expect(screen.getByText('Rutas Nacionales')).toBeVisible();
    expect(screen.getByText('Publicly mapped high-mountain access ways')).toBeVisible();
    expect(screen.getByText('© OpenStreetMap contributors')).toBeVisible();
  });

  it('does not expose OSM geometry attribution when no physical segment uses the OSM source', () => {
    render(
      <AnalysisDrawer
        open
        onClose={vi.fn()}
        operation={operationWithGeometrySources(['official'])}
        runArtifacts={runArtifacts}
        traffic={traffic}
      />,
    );

    expect(screen.getByText('Rutas Nacionales')).toBeVisible();
    expect(screen.queryByText('Publicly mapped high-mountain access ways')).not.toBeInTheDocument();
    expect(screen.queryByText('© OpenStreetMap contributors')).not.toBeInTheDocument();
  });
});
