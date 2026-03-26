import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    redisSub: Redis;
  }
}

export default fp(async function redisPlugin(fastify: FastifyInstance) {
  const redisUrl = fastify.config.redisUrl;
  const redis = new Redis(redisUrl);
  const redisSub = new Redis(redisUrl);

  fastify.decorate('redis', redis);
  fastify.decorate('redisSub', redisSub);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    await redisSub.quit();
  });
});
