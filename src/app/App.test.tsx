import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('enters the shift on explicit user action and stays paused at 06:00', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('SAN JUAN · MINING OPERATIONS')).toBeVisible();
    expect(screen.getByText(/synthetic operation/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /start shift/i }));

    expect(screen.queryByRole('button', { name: /start shift/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /3d operational map/i })).toBeVisible();
    expect(screen.getAllByText('06:00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /play/i })).toBeVisible();
  });
});
