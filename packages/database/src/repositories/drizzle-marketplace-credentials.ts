import { eq, sql } from 'drizzle-orm';
import type { CredentialKind } from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { marketplaceCredentials } from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

/**
 * Sealed credential blob for one connection. Structurally matches
 * `SealedSecret` from `@tokoboss/integrations` plus the credential kind.
 * This repository never sees plaintext; the vault seals and opens.
 */
export interface SealedCredentialBlob {
  readonly kind: CredentialKind;
  readonly keyId: string;
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
}

const toBase64 = (value: Buffer): string => value.toString('base64');
const fromBase64 = (value: string): Buffer => Buffer.from(value, 'base64');

/**
 * Postgres repository for `marketplace_credentials` (UTA-39 / US20,
 * RFC 04 task 68). Stores sealed blobs only, one row per connection,
 * with byte fields as base64 text. `shred` deletes the row for good.
 */
export class DrizzleCredentialRepository {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleCredentialRepository {
    return new DrizzleCredentialRepository(tx);
  }

  async put(connectionId: string, blob: SealedCredentialBlob): Promise<void> {
    const values = {
      kind: blob.kind,
      keyId: blob.keyId,
      nonce: toBase64(blob.nonce),
      ciphertext: toBase64(blob.ciphertext),
      authTag: toBase64(blob.authTag),
    };
    await this.db
      .insert(marketplaceCredentials)
      .values({ connectionId, ...values })
      .onConflictDoUpdate({
        target: marketplaceCredentials.connectionId,
        set: {
          ...values,
          version: sql`${marketplaceCredentials.version} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  async get(connectionId: string): Promise<SealedCredentialBlob | null> {
    const rows = await this.db
      .select()
      .from(marketplaceCredentials)
      .where(eq(marketplaceCredentials.connectionId, connectionId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      kind: row.kind as CredentialKind,
      keyId: row.keyId,
      nonce: fromBase64(row.nonce),
      ciphertext: fromBase64(row.ciphertext),
      authTag: fromBase64(row.authTag),
    };
  }

  async shred(connectionId: string): Promise<void> {
    await this.db
      .delete(marketplaceCredentials)
      .where(eq(marketplaceCredentials.connectionId, connectionId));
  }
}
