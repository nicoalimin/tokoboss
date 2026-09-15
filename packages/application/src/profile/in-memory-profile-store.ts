import type { ProfileRecord } from './profile-types';
import type { ProfileStore } from './profile-ports';

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

/**
 * In-memory profile store for unit tests (UTA-72). Mirrors the Postgres
 * contract: one row per opaque `user_id`, `upsert` creates on first write.
 * Never logs inputs.
 */
export class InMemoryProfileStore implements ProfileStore {
  private readonly byUser = new Map<string, ProfileRecord>();

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = this.byUser.get(userId);
    return row ? clone(row) : null;
  }

  async upsert(
    userId: string,
    patch: { displayName?: string | null; avatarUploadId?: string | null },
    now = new Date()
  ): Promise<ProfileRecord> {
    const existing = this.byUser.get(userId);
    if (!existing) {
      const created: ProfileRecord = {
        userId,
        displayName: patch.displayName ?? null,
        avatarUploadId: patch.avatarUploadId ?? null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
      this.byUser.set(userId, created);
      return clone(created);
    }
    const updated: ProfileRecord = {
      ...existing,
      displayName:
        patch.displayName !== undefined
          ? patch.displayName
          : existing.displayName,
      avatarUploadId:
        patch.avatarUploadId !== undefined
          ? patch.avatarUploadId
          : existing.avatarUploadId,
      createdAt: new Date(existing.createdAt),
      updatedAt: new Date(now),
    };
    this.byUser.set(userId, updated);
    return clone(updated);
  }
}
