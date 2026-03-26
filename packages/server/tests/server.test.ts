import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';

describe('Fastify server', () => {
  const serverPromise = buildServer();

  afterAll(async () => {
    const server = await serverPromise;
    await server.close();
  });

  it('responds to health check', async () => {
    const server = await serverPromise;
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });
});
