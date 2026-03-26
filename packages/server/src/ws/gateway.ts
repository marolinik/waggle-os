import type { FastifyInstance } from 'fastify';
import type { WsClientEvent, WsServerEvent } from '@waggle/shared';
import { createClerkClient } from '@clerk/fastify';
import { ConnectionManager } from './connection-manager.js';
import { teams, messages, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const connectionManager = new ConnectionManager();

/**
 * Validate that a string looks like a JWT (3 dot-separated base64url segments).
 * This is a structural check, not a cryptographic verification.
 */
function isJwtStructure(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  // Each segment should be non-empty and valid base64url
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => part.length > 0 && base64urlRegex.test(part));
}

/**
 * Decode the payload segment of a JWT without verification.
 * Used as a fallback when Clerk secret key is not configured.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url -> base64 -> decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Overridable verifier for testing — allows tests to swap in a mock
export type WsTokenVerifier = (token: string) => Promise<{ sub: string }>;
let _wsTokenVerifier: WsTokenVerifier | null = null;

/** Override the WS token verifier (for testing only) */
export function setWsTokenVerifier(verifier: WsTokenVerifier | null): void {
  _wsTokenVerifier = verifier;
}

export async function wsGateway(fastify: FastifyInstance) {
  // Create Clerk client for JWT verification if secret key is available
  const clerkSecretKey = fastify.config.clerkSecretKey;
  const clerk = clerkSecretKey
    ? createClerkClient({ secretKey: clerkSecretKey })
    : null;

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    let userId: string | null = null;
    let teamId: string | null = null;

    socket.on('message', async (raw: Buffer | string) => {
      try {
        const event = JSON.parse(raw.toString()) as WsClientEvent;

        switch (event.type) {
          case 'authenticate': {
            const token = event.token;

            // Reject tokens that are not JWTs (plain userIds, random strings)
            if (!isJwtStructure(token)) {
              socket.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Invalid token: must be a valid JWT',
                }),
              );
              return;
            }

            try {
              let sub: string;

              if (_wsTokenVerifier) {
                // Test override path
                const result = await _wsTokenVerifier(token);
                sub = result.sub;
              } else if (clerk) {
                // Production path: full Clerk JWT verification
                const payload = await (clerk as any).verifyToken(token);
                sub = payload.sub;
              } else {
                // Fallback: decode JWT payload and extract sub
                // TODO: Replace with full Clerk verification once CLERK_SECRET_KEY is always configured
                const payload = decodeJwtPayload(token);
                if (!payload || typeof payload.sub !== 'string') {
                  socket.send(
                    JSON.stringify({
                      type: 'error',
                      message: 'Invalid token: missing sub claim',
                    }),
                  );
                  return;
                }
                sub = payload.sub;
              }

              // Look up internal user by Clerk ID
              const [user] = await fastify.db
                .select()
                .from(users)
                .where(eq(users.clerkId, sub));

              if (!user) {
                socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'User not found',
                  }),
                );
                return;
              }

              userId = user.id;
              socket.send(JSON.stringify({ type: 'authenticated', userId }));
            } catch {
              socket.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Token verification failed',
                }),
              );
            }
            break;
          }

          case 'join_team': {
            if (!userId) {
              socket.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }

            const [team] = await fastify.db
              .select()
              .from(teams)
              .where(eq(teams.slug, event.teamSlug));

            if (!team) {
              socket.send(JSON.stringify({ type: 'error', message: 'Team not found' }));
              return;
            }

            // Leave previous team if any
            if (teamId && userId) {
              connectionManager.remove(teamId, userId);
            }

            teamId = team.id;
            connectionManager.add(teamId, userId, socket);

            // Subscribe to Redis channel for this team
            const channel = `team:${teamId}:waggle`;
            try {
              const existingChannels = await fastify.redisSub.call('PUBSUB', 'CHANNELS', channel) as string[];
              // Only subscribe if not already subscribed (redisSub is shared)
              if (!existingChannels || !existingChannels.includes(channel)) {
                await fastify.redisSub.subscribe(channel);
              }
            } catch {
              // Redis subscribe failure is non-fatal — real-time updates won't work
              // but join should still succeed
            }

            socket.send(JSON.stringify({ type: 'joined_team', teamSlug: event.teamSlug }));
            break;
          }

          case 'send_message': {
            if (!userId || !teamId) {
              socket.send(JSON.stringify({ type: 'error', message: 'Not in a team' }));
              return;
            }

            // Persist message
            const [msg] = await fastify.db
              .insert(messages)
              .values({
                teamId,
                senderId: userId,
                type: event.messageType,
                subtype: event.subtype,
                content: event.content,
              })
              .returning();

            // Publish to Redis for cross-process delivery
            await fastify.redis.publish(
              `team:${teamId}:waggle`,
              JSON.stringify(msg),
            );
            break;
          }
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    socket.on('close', () => {
      if (teamId && userId) {
        connectionManager.remove(teamId, userId);
      }
    });
  });

  // Forward Redis pub/sub messages to WebSocket clients
  fastify.redisSub.on('message', (channel: string, data: string) => {
    const match = channel.match(/^team:(.+):waggle$/);
    if (!match) return;
    const tId = match[1];
    try {
      const event: WsServerEvent = { type: 'waggle_message', message: JSON.parse(data) };
      connectionManager.broadcast(tId, event);
    } catch {
      // Ignore malformed messages from Redis
    }
  });

  // Subscribe to job progress channels via pattern matching
  await fastify.redisSub.psubscribe('job:*:progress');

  // Forward job progress events to WebSocket clients
  fastify.redisSub.on('pmessage', (_pattern: string, channel: string, data: string) => {
    const jobMatch = channel.match(/^job:(.+):progress$/);
    if (!jobMatch) return;
    try {
      const parsed = JSON.parse(data);
      const event: WsServerEvent = {
        type: 'job_progress',
        jobId: jobMatch[1],
        progress: parsed,
      };
      // Route to the team that owns this job
      if (parsed.teamId) {
        connectionManager.broadcast(parsed.teamId, event);
      }
    } catch {
      // Ignore malformed messages from Redis
    }
  });
}
