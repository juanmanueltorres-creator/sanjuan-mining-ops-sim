export interface IntroOverlayProps {
  onStart: () => void;
}

export function IntroOverlay({ onStart }: IntroOverlayProps) {
  return (
    <section className="intro-overlay" aria-label="San Juan mining operations introduction">
      <div className="intro-card">
        <p className="eyebrow">SAN JUAN · MINING OPERATIONS</p>
        <h1>Terrain changes. Timing matters.</h1>
        <p className="intro-thesis">
          We bring territory, time and movement into one operational scene.
        </p>
        <p className="intro-detail">
          Follow synthetic mobilizations across sourced San Juan corridors and inspect the context they encounter along the day.
        </p>
        <button className="primary-action" type="button" onClick={onStart}>
          START SHIFT
        </button>
        <p className="intro-footnote">Real territory · modelled environment · synthetic operation.</p>
      </div>
    </section>
  );
}
