import './terrainObservability.css';

export interface MapInstrumentationProps {
  headingDeg: number;
  scaleLabel: string | null;
  scaleWidthPx: number | null;
  cursorText: string | null;
  webGlAvailable: boolean;
  terrainState: 'READY' | 'ELLIPSOID' | 'FAILED';
  onRegionalView: () => void;
  onVeladeroView?: () => void;
}

export function MapInstrumentation({
  headingDeg,
  scaleLabel,
  scaleWidthPx,
  cursorText,
  webGlAvailable,
  terrainState,
  onRegionalView,
  onVeladeroView,
}: MapInstrumentationProps) {
  const terrainReady = terrainState === 'READY';

  return (
    <div className="map-instruments" aria-label="Cartographic instruments">
      <div className="north-indicator" aria-label="Map orientation">
        <span
          className="north-arrow"
          aria-hidden="true"
          style={{ transform: `rotate(${-headingDeg}deg)` }}
        >
          ↑
        </span>
        <strong>N</strong>
      </div>

      <div className="scale-indicator" aria-label="Map scale">
        {webGlAvailable && scaleLabel && scaleWidthPx ? (
          <>
            <span className="scale-line" style={{ width: `${scaleWidthPx}px` }} aria-hidden="true" />
            <span>{scaleLabel}</span>
          </>
        ) : (
          <span>SCALE UNAVAILABLE</span>
        )}
      </div>

      <div
        className="terrain-state"
        aria-label="Terrain state"
        data-terrain-state={terrainReady ? 'ready' : 'fallback'}
      >
        {terrainReady ? 'WORLD TERRAIN · 3D' : 'ELLIPSOID FALLBACK'}
      </div>

      <div className="cursor-readout" aria-label="Cursor coordinates and elevation">
        {webGlAvailable && cursorText ? cursorText : 'CURSOR · TERRAIN UNAVAILABLE'}
      </div>

      <button className="regional-view-button" type="button" aria-label="Regional view" onClick={onRegionalView}>
        REGIONAL VIEW
      </button>
      {onVeladeroView && (
        <button className="regional-view-button" type="button" aria-label="Veladero 3D" onClick={onVeladeroView}>
          VELADERO 3D
        </button>
      )}
    </div>
  );
}
