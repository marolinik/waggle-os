import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export interface ClerkUserData {
  clerkId: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
}

export class UserService {
  constructor(private db: Db) {}

  async getByClerkId(clerkId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
    return user ?? null;
  }

  async getById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  /**
   * Create or update a user from Clerk JWT claims.
   * Used by auth plugin for auto-provisioning on first auth,
   * and by webhook for ongoing sync.
   */
  async upsertFromClerk(data: ClerkUserData) {
    const existing = await this.getByClerkId(data.clerkId);

    if (existing) {
      // Update display name / email / avatar if changed
      await this.db.update(users)
        .set({
          displayName: data.displayName,
          email: data.email,
          avatarUrl: data.avatarUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.clerkId, data.clerkId));
      // Return fresh copy
      return (await this.getByClerkId(data.clerkId))!;
    }

    // Insert new user
    const [created] = await this.db.insert(users)
      .values({
        clerkId: data.clerkId,
        displayName: data.displayName,
        email: data.email,
        avatarUrl: data.avatarUrl ?? null,
      })
      .returning();

    return created;
  }
}
