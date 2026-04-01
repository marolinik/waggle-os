/**
 * Shared CORS configuration for the local Waggle server.
 * Used by both the Fastify CORS plugin and SSE endpoints that bypass it via reply.hijack().
 */

export const ALLOWED_ORIGINS = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'tauri://localhost',
  'https://tauri.localhost',
  'http://localhost:3333',  // web mode (self)
  'http://127.0.0.1:3333',
  'http://localhost:8080',  // waggle-os web frontend (Vite dev)
  'http://127.0.0.1:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * Validate and return the origin for SSE responses.
 * Returns the origin if allowed, otherwise returns the first allowed origin.
 * SSE endpoints that use reply.hijack() bypass Fastify's CORS plugin,
 * so they must validate origins themselves.
 */
export function validateOrigin(requestOrigin: string | undefined): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.some(o => requestOrigin.startsWith(o))) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}
