import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapInstrumentation } from './MapInstrumentation';

describe('MapInstrumentation', () => {
  it('fails closed when WebGL-derived map readouts are unavailable', () => {
    const onRegionalView = vi.fn();
    render(
      <MapInstrumentation
        headingDeg={15}
        scaleLabel={null}
        scaleWidthPx={null}
        cursorText={null}
        webGlAvailable={false}
        onRegionalView={onRegionalView}
      />,
    );

    expect(screen.getByLabelText(/map orientation/i)).toHaveTextContent('N');
    expect(screen.getByText('SCALE UNAVAILABLE')).toBeVisible();
    expect(screen.getByText('CURSOR · TERRAIN UNAVAILABLE')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /regional view/i }));
    expect(onRegionalView).toHaveBeenCalledTimes(1);
  });

  it('renders measured scale and cursor text when available', () => {
    render(
      <MapInstrumentation
        headingDeg={0}
        scaleLabel="5 km"
        scaleWidthPx={80}
        cursorText="31.5376° S · 68.5364° W · ELEV 650 m"
        webGlAvailable
        onRegionalView={vi.fn()}
      />,
    );

    expect(screen.getByText('5 km')).toBeVisible();
    expect(screen.getByText(/31\.5376° S/)).toBeVisible();
  });
});
