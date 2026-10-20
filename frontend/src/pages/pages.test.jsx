import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App.jsx';
import { mockApi } from '../test/helpers.js';

const owner = { id: 1, name: 'Ada Example', role: 'Scientist', team: 'NLP' };
const experiment = {
  id: 7, name: 'Tokenizer sweep', description: 'Sweep vocab sizes', hypothesis: '32k is best', status: 'running',
  owner, members: [], tags: ['nlp'], start_date: '2026-03-01', end_date: null, run_count: 2,
};
const page = (data) => ({ data, meta: { page: 1, per_page: 15, total: data.length, pages: data.length ? 1 : 0 } });

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('Experiments page', () => {
  it('renders experiments from the API', async () => {
    mockApi({
      'GET /experiments': page([experiment]),
      'GET /experiments/tags': { data: ['nlp'] },
      'GET /researchers': page([owner]),
    });
    renderAt('/experiments');
    const link = await screen.findByRole('link', { name: 'Tokenizer sweep' });
    const row = link.closest('tr');
    expect(within(row).getByText('Running')).toBeInTheDocument();
    expect(within(row).getByText('Ada Example')).toBeInTheDocument();
  });

  it('shows an empty state when filters match nothing', async () => {
    mockApi({
      'GET /experiments': page([]),
      'GET /experiments/tags': { data: [] },
      'GET /researchers': page([]),
    });
    renderAt('/experiments?status=archived');
    expect(await screen.findByText('No experiments match these filters')).toBeInTheDocument();
  });

  it('shows an error state when the API is unreachable', async () => {
    mockApi({
      'GET /experiments': { status: 503, body: { error: { code: 'service_unavailable', message: 'Database unavailable' } } },
      'GET /experiments/tags': { data: [] },
      'GET /researchers': page([]),
    });
    renderAt('/experiments');
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });
});

describe('New experiment form', () => {
  it('validates on the client before calling the API', async () => {
    const fetchSpy = mockApi({ 'GET /researchers': page([owner]) });
    renderAt('/experiments/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Create experiment' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Choose an owner.')).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([, opts]) => opts?.method === 'POST')).toBe(false);
  });

  it('shows server-side validation errors next to the field', async () => {
    mockApi({
      'GET /researchers': page([owner]),
      'POST /experiments': {
        status: 400,
        body: { error: { code: 'validation_error', message: 'Request validation failed.', details: { name: 'already taken' } } },
      },
    });
    renderAt('/experiments/new');
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Duplicate');
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Create experiment' }));
    await waitFor(() => expect(screen.getByText('already taken')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Request validation failed.');
  });
});
