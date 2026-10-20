import { vi } from 'vitest';

/** Replace global fetch with a router: { 'GET /experiments': body | (url) => body }. */
export function mockApi(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = new URL(url, 'http://localhost').pathname.replace('/api/v1', '');
    const handler = routes[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not mocked' } }), { status: 404 });
    const result = typeof handler === 'function' ? handler(url, options) : handler;
    const { status = 200, body } = result.status ? result : { body: result };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}
