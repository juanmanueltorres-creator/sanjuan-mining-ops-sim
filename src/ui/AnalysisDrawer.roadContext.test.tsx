import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoadContextData } from '../data/loadRoadContext';
import { AnalysisDrawer } from './AnalysisDrawer';

const roadContext: RoadContextData = {
  metadata: {
    schemaVersion: 'sanjuan.road-context/v1',
    id: 'san-juan-ign-road-context-v1',
    provider: 'Instituto Geográfico Nacional de la República Argentina',
    authoringSource: 'Geo_Platform/web/public/data/san_juan_rutas.geojson',
    sourceCommit: 'a4812d053f4f381b9d3e1d5ff30abb9fed7d6772',
    sourceBlobSha: '1f1cc0293508bb8102c3bcd1b9255a9b68bf4a70',
    sourceUrl: 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG',
    licenseUrl: 'https://www.ign.gob.ar/descargas/tyc1.html',
    attribution: 'FUENTE: Instituto Geográfico Nacional de la República Argentina',
    selectionMethod: 'feature-bbox intersection around active-corridor route-sample bbox + 0.25 degrees',
    contextPaddingDegrees: 0.25,
    featureCount: 0,
    limitations: ['Cartographic reference only; not an operational route, access authorization, road-status or navigation dataset.'],
  },
  features: [],
};

const baseProps = {
  open: true,
  onClose: vi.fn(),
  operation: null,
  runArtifacts: null,
  traffic: null,
};

describe('AnalysisDrawer road context disclosure', () => {
  it('does not disclose ROAD CONTEXT when the optional layer is unavailable', () => {
    render(<AnalysisDrawer {...baseProps} roadContext={null} />);
    expect(screen.queryByText('ROAD CONTEXT')).not.toBeInTheDocument();
  });

  it('discloses provider, attribution, source, terms, commit and non-operational limitations when loaded', () => {
    render(<AnalysisDrawer {...baseProps} roadContext={roadContext} />);

    expect(screen.getByText('ROAD CONTEXT')).toBeVisible();
    expect(screen.getByText(roadContext.metadata.provider)).toBeVisible();
    expect(screen.getByText(roadContext.metadata.attribution)).toBeVisible();
    expect(screen.getByText(/a4812d053f4f381b9d3e1d5ff30abb9fed7d6772/)).toBeVisible();
    expect(screen.getByRole('link', { name: /road context source/i })).toHaveAttribute('href', roadContext.metadata.sourceUrl);
    expect(screen.getByRole('link', { name: /road context terms/i })).toHaveAttribute('href', roadContext.metadata.licenseUrl);
    expect(screen.getByText('Cartographic context only. This network does not drive vehicle movement, ETA, access, routing or road-status decisions.')).toBeVisible();
    expect(screen.getByText(roadContext.metadata.limitations[0])).toBeVisible();
  });
});
