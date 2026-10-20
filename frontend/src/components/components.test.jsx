import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination from './Pagination.jsx';
import { AsyncContent } from './States.jsx';
import StatusBadge from './StatusBadge.jsx';

describe('StatusBadge', () => {
  it('shows a text label, not just a color', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('Running')).toHaveClass('badge-running');
  });
});

describe('Pagination', () => {
  it('describes the range and disables Previous on the first page', async () => {
    const onPageChange = vi.fn();
    render(<Pagination meta={{ page: 1, per_page: 10, total: 25, pages: 3 }} onPageChange={onPageChange} noun="runs" />);
    expect(screen.getByText('Showing 1–10 of 25 runs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('AsyncContent', () => {
  it('shows loading, then error with retry', async () => {
    const reload = vi.fn();
    const { rerender } = render(
      <AsyncContent result={{ loading: true, data: null }}>{() => 'loaded'}</AsyncContent>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading');

    rerender(
      <AsyncContent result={{ loading: false, data: null, error: new Error('API down'), reload }}>{() => 'loaded'}</AsyncContent>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('API down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });
});
