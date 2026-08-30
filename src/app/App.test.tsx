import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the product shell without implying live telemetry', () => {
    render(<App />);
    expect(screen.getByText('SAN JUAN MINING OPS SIM')).toBeInTheDocument();
    expect(screen.getByText(/synthetic operation/i)).toBeInTheDocument();
  });
});
