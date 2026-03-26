import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './connection.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

async function main() {
  const db = createDb(connectionString!);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
