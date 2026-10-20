import { describe, expect, it } from 'vitest';
import { coerceParameter, serverFieldErrors, validateExperiment, validateResearcher, validateRun } from './validation.js';

const baseRun = {
  name: 'r01',
  status: 'completed',
  started_at: '2026-03-02T10:00',
  ended_at: '2026-03-02T11:00',
  notes: '',
  metrics: { accuracy: '0.9', loss: '', duration_seconds: '', sample_size: '500' },
  customMetrics: [],
  parameters: [],
};

describe('validateRun', () => {
  it('builds a typed request body from form strings', () => {
    const { errors, body } = validateRun({
      ...baseRun,
      customMetrics: [{ key: 'f1_macro', value: '0.8' }, { key: '', value: '' }],
      parameters: [{ key: 'lr', value: '0.001' }, { key: 'amp', value: 'true' }, { key: 'opt', value: 'adamw' }],
    });
    expect(errors).toEqual({});
    expect(body.metrics).toEqual({ accuracy: 0.9, sample_size: 500, f1_macro: 0.8 });
    expect(body.parameters).toEqual({ lr: 0.001, amp: true, opt: 'adamw' });
    expect(body.started_at).toMatch(/Z$/); // converted to UTC ISO
  });

  it('enforces status and timeline rules', () => {
    expect(validateRun({ ...baseRun, ended_at: '' }).errors.ended_at).toMatch(/required/);
    expect(validateRun({ ...baseRun, status: 'running' }).errors.ended_at).toMatch(/cannot have an end time/);
    expect(validateRun({ ...baseRun, ended_at: '2026-03-01T00:00' }).errors.ended_at).toMatch(/after the start/);
  });

  it('rejects out-of-range standard metrics and bad custom metric names', () => {
    const { errors } = validateRun({
      ...baseRun,
      metrics: { accuracy: '1.2', loss: '-1', duration_seconds: '', sample_size: '2.5' },
      customMetrics: [{ key: '1st', value: '3' }, { key: 'ok_name', value: 'abc' }, { key: 'accuracy', value: '0.5' }],
    });
    expect(Object.keys(errors).sort()).toEqual([
      'customMetrics.0', 'customMetrics.1', 'customMetrics.2', 'metrics.accuracy', 'metrics.loss', 'metrics.sample_size',
    ]);
  });
});

describe('validateExperiment', () => {
  const form = { name: 'X', description: '', hypothesis: '', owner_id: '1', start_date: '2026-01-02', end_date: '', tags: [] };
  it('accepts a minimal valid experiment', () => {
    expect(validateExperiment(form)).toEqual({});
  });
  it('requires name and owner, and orders dates', () => {
    const errors = validateExperiment({ ...form, name: ' ', owner_id: '', end_date: '2026-01-01' });
    expect(errors).toHaveProperty('name');
    expect(errors).toHaveProperty('owner_id');
    expect(errors).toHaveProperty('end_date');
  });
});

describe('helpers', () => {
  it('validates researcher emails', () => {
    expect(validateResearcher({ name: 'A', email: 'nope', role: 'r', team: 't' })).toHaveProperty('email');
  });
  it('coerces parameter values', () => {
    expect(coerceParameter('42')).toBe(42);
    expect(coerceParameter('false')).toBe(false);
    expect(coerceParameter(' adam ')).toBe('adam');
  });
  it('maps nested server errors to their top-level field too', () => {
    expect(serverFieldErrors({ details: { 'metrics.accuracy': 'bad' } })).toEqual({ 'metrics.accuracy': 'bad', metrics: 'bad' });
  });
});
