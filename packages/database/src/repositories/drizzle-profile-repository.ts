import { eq } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { userProfiles, type UserProfileRow } from '../schema/index';
import type { ProfileRecord, ProfileStore } from '@tokoboss/application';

type DbOrTx = Transaction | DatabaseHandle;

function toProfile(row: UserProfileRow): ProfileRecord {
  return {
    userId: row.userId,
    displayName: row.displayName,
    avatarUploadId: row.avatarUploadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Postgres-backed profile store (UTA-72). One row per opaque `user_id`;
 * `upsert` creates on first update so reads stay side-effect free.
 */
export class DrizzleProfileStore implements ProfileStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleProfileStore {
    return new DrizzleProfileStore(tx);
  }

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const rows = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? toProfile(row) : null;
  }

  async upsert(
    userId: string,
    patch: { displayName?: string | null; avatarUploadId?: string | null },
    now = new Date()
  ): Promise<ProfileRecord> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      const inserted = await this.db
        .insert(userProfiles)
        .values({
          userId,
          displayName: patch.displayName ?? null,
          avatarUploadId: patch.avatarUploadId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert profile');
      return toProfile(row);
    }
    const updated = await this.db
      .update(userProfiles)
      .set({
        ...(patch.displayName !== undefined
          ? { displayName: patch.displayName }
          : {}),
        ...(patch.avatarUploadId !== undefined
          ? { avatarUploadId: patch.avatarUploadId }
          : {}),
        updatedAt: now,
      })
      .where(eq(userProfiles.userId, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error('Failed to update profile');
    return toProfile(row);
  }
}
