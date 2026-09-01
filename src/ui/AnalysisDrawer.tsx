import type { RoadContextData } from '../data/loadRoadContext';
import type { EvidenceRef, GeometrySourceRecord } from '../domain/contracts';
import type { StaticOperationData, StaticRunArtifacts, StaticTrafficCalibration } from '../data/loadOperation';
import { SourceState } from './SourceState';

export interface AnalysisDrawerProps {
  open: boolean;
  onClose: () => void;
  operation: StaticOperationData | null;
  runArtifacts: StaticRunArtifacts | null;
  traffic: StaticTrafficCalibration | null;
  roadContext: RoadContextData | null;
}

function EvidenceCard({ evidence }: { evidence: EvidenceRef }) {
  return (
    <article className="evidence-card">
      <div className="evidence-card-heading">
        <strong>{evidence.sourceName}</strong>
        <span>{evidence.role}</span>
      </div>
      {evidence.method ? <p>{evidence.method}</p> : null}
      {evidence.sourceUrl ? (
        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>
      ) : null}
      {evidence.limitations.length > 0 ? (
        <ul>
          {evidence.limitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </article>
  );
}

function usedGeometrySources(operation: StaticOperationData | null): GeometrySourceRecord[] {
  if (!operation) return [];
  const usedSourceIds = new Set(
    operation.corridors.flatMap((corridor) =>
      (corridor.geometrySegments ?? []).map((segment) => segment.sourceDatasetId),
    ),
  );
  return (operation.geometrySources ?? []).filter((source) => usedSourceIds.has(source.id));
}

function GeometrySourceCard({ source }: { source: GeometrySourceRecord }) {
  return (
    <article className="evidence-card">
      <div className="evidence-card-heading">
        <strong>{source.datasetName}</strong>
        <span>{source.role}</span>
      </div>
      <p>{source.provider}</p>
      <dl className="source-metadata">
        <div><dt>Format</dt><dd>{source.format}</dd></div>
        <div><dt>Retrieved</dt><dd>{source.retrievedAt}</dd></div>
        {source.license ? <div><dt>License</dt><dd>{source.license}</dd></div> : null}
      </dl>
      <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>
      {source.attribution ? <p>{source.attribution}</p> : null}
      {source.limitations.length > 0 ? (
        <ul>
          {source.limitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </article>
  );
}

export function AnalysisDrawer({ open, onClose, operation, runArtifacts, traffic, roadContext }: AnalysisDrawerProps) {
  if (!open) return null;
  const geometrySources = usedGeometrySources(operation);

  return (
    <aside className="analysis-drawer" aria-label="Sources and limitations">
      <header className="analysis-drawer-header">
        <div>
          <p className="eyebrow">EVIDENCE</p>
          <h2>Sources</h2>
        </div>
        <button type="button" aria-label="Close sources" onClick={onClose}>Close</button>
      </header>

      <div className="analysis-drawer-scroll">
        <section className="source-section">
          <div className="source-section-heading">
            <strong>MODELLED WEATHER</strong>
            {runArtifacts ? <SourceState state={runArtifacts.environment.sourceState} /> : null}
          </div>
          {runArtifacts ? (
            <>
              <p className="source-primary">{runArtifacts.environment.provider}</p>
              <dl className="source-metadata">
                <div><dt>Model</dt><dd>{runArtifacts.environment.modelKind}</dd></div>
                <div><dt>Data as of</dt><dd>{runArtifacts.environment.dataAsOf}</dd></div>
              </dl>
              <div className="evidence-list">
                {runArtifacts.evidence.map((evidence) => <EvidenceCard key={evidence.id} evidence={evidence} />)}
              </div>
            </>
          ) : <p className="source-unavailable">Environment source unavailable.</p>}
        </section>

        <section className="source-section">
          <div className="source-section-heading">
            <strong>SYNTHETIC BACKGROUND TRAFFIC</strong>
            <span className="source-state source-state-synthetic">CALIBRATED</span>
          </div>
          <p className="source-primary">Synthetic civilian movement used only as subdued territorial context.</p>
          {traffic ? (
            <div className="evidence-list">
              {traffic.evidence.map((evidence) => <EvidenceCard key={evidence.id} evidence={evidence} />)}
            </div>
          ) : <p className="source-unavailable">Background calibration unavailable.</p>}
        </section>

        {geometrySources.length > 0 ? (
          <section className="source-section">
            <div className="source-section-heading"><strong>ROAD GEOMETRY</strong></div>
            <p className="source-primary">
              Geometry provenance shown here is limited to datasets actually used by rendered V2 road segments.
            </p>
            <div className="evidence-list">
              {geometrySources.map((source) => <GeometrySourceCard key={source.id} source={source} />)}
            </div>
            <p className="source-note">
              Public, reconstructed and approximate geometry are evidence classes, not operator navigation, access authorization or current road-status claims.
            </p>
          </section>
        ) : null}

        {roadContext ? (
          <section className="source-section">
            <div className="source-section-heading"><strong>ROAD CONTEXT</strong></div>
            <p className="source-primary">{roadContext.metadata.provider}</p>
            <dl className="source-metadata">
              <div><dt>Features</dt><dd>{roadContext.metadata.featureCount}</dd></div>
              <div><dt>Source commit</dt><dd>{roadContext.metadata.sourceCommit}</dd></div>
              <div><dt>Authoring source</dt><dd>{roadContext.metadata.authoringSource}</dd></div>
            </dl>
            <p>{roadContext.metadata.attribution}</p>
            <div className="evidence-list">
              <a href={roadContext.metadata.sourceUrl} target="_blank" rel="noreferrer">Road context source ↗</a>
              <a href={roadContext.metadata.licenseUrl} target="_blank" rel="noreferrer">Road context terms ↗</a>
            </div>
            <p className="source-note">
              Cartographic context only. This network does not drive vehicle movement, ETA, access, routing or road-status decisions.
            </p>
            <ul>
              {roadContext.metadata.limitations.map((item) => <li key={`road-context:${item}`}>{item}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="source-section">
          <div className="source-section-heading"><strong>TERRITORIAL EVIDENCE</strong></div>
          <p className="source-primary">
            {operation
              ? `${operation.projects.length} project locations · ${operation.corridors.length} corridor bundles · ${operation.evidence.length} evidence records`
              : 'Territorial evidence unavailable.'}
          </p>
          <p className="source-note">Reconstructed or approximate access remains labelled as such; it is not operator-verified routing.</p>
        </section>

        <section className="limitations-block">
          <strong>LIMITATIONS</strong>
          <ul>
            {runArtifacts?.environment.limitations.map((item) => <li key={`environment:${item}`}>{item}</li>)}
            {traffic?.limitations.map((item) => <li key={`traffic:${item}`}>{item}</li>)}
            <li>Vehicle schedules, departures, stops and movement are synthetic operational assumptions.</li>
            <li>No live GPS, operator dispatch, road closure, transitability or safety decision is represented.</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
