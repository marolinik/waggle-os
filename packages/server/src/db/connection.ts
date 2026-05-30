import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** The transaction handle drizzle passes to `db.transaction(cb)`. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/** A query executor that is either the root db or an open transaction. */
export type DbExecutor = Db | DbTransaction;
