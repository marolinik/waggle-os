/**
 * validateBody — a small zod preHandler for Fastify routes.
 *
 * Parses `request.body` with the given zod schema BEFORE the route handler runs.
 * On failure it returns a clean 400 with the zod issues (path + message) instead
 * of letting a malformed body reach the handler — which today either casts it
 * (`request.body as {...}`) and silently persists bad data, or throws and 500s.
 * On success it replaces `request.body` with the parsed (validated + defaulted)
 * value so the handler reads a trustworthy object.
 *
 * This is the shared boundary-validation pattern (zod at system boundaries,
 * per CLAUDE.md coding-style). Apply it as a `preHandler` on mutating routes;
 * reuse `@waggle/shared` schemas where one already exists for the payload.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';

export interface BodyValidationIssue {
  /** Dot-joined path to the offending field (empty string = the body root). */
  path: string;
  message: string;
}

/**
 * Build a Fastify preHandler that validates the request body against `schema`.
 * Returns 400 `{ error, issues }` on a malformed body; otherwise narrows
 * `request.body` to the parsed value and continues to the handler.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return async function validateBodyPreHandler(request: FastifyRequest, reply: FastifyReply) {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const issues: BodyValidationIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      // Returning the reply after send() short-circuits the route handler
      // (Fastify preHandler contract) — the handler never runs on a bad body.
      return reply.code(400).send({ error: 'Invalid request body', issues });
    }
    // Hand the handler the parsed value (defaults applied, unknown keys stripped).
    request.body = result.data;
  };
}
