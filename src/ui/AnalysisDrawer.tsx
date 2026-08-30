import type { EvidenceRef } from '../domain/contracts';
import type { StaticOperationData, StaticRunArtifacts, StaticTrafficCalibration } from '../data/loadOperation';
import { SourceState } from './SourceState';

export interface AnalysisDrawerProps {
  open: boolean;
  onClose: () => void;
  operation: StaticOperationData | null;
  runArtifacts: StaticRunArtifacts | null;
  traffic: StaticTrafficCalibration | null;
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

export function AnalysisDrawer({ open, onClose, operation, runArtifacts, traffic }: AnalysisDrawerProps) {
  if (!open) return null;

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
            <>
              <p className="source-note">{traffic.limitations.join(' ')}</p>
              <div className="evidence-list">
                {traffic.evidence.map((evidence) => <EvidenceCard key={evidence.id} evidence={evidence} />)}
              </div>
            </>
          ) : <p className="source-unavailable">Background calibration unavailable.</p>}
        </section>

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
