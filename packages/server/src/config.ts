export interface ServerConfig {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
  corsOrigin: string[];
}

export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT ?? '3100', 10),
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl: (() => {
      const url = process.env.DATABASE_URL;
      if (!url) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('DATABASE_URL environment variable is required');
        }
        return 'postgres://localhost:5434/waggle';
      }
      return url;
    })(),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6381',
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
    corsOrigin: (() => {
      const origins = process.env.CORS_ORIGIN;
      if (!origins) {
        // Fail closed in production: a missing CORS_ORIGIN must not silently
        // fall back to a localhost dev origin (which both blocks the real prod
        // frontend AND leaves an unintended localhost origin allowed).
        if (process.env.NODE_ENV === 'production') {
          throw new Error('CORS_ORIGIN environment variable is required in production');
        }
        return ['http://localhost:5173'];
      }
      return origins.split(',').map((o) => o.trim()).filter(Boolean);
    })(),
  };
}
