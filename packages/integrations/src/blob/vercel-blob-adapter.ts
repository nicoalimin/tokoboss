import { createHash, randomBytes } from 'node:crypto';
import type {
  DownloadGrant,
  IssueUploadTokenInput,
  ObjectStoragePort,
  UploadToken,
} from '@tokoboss/domain';

const TOKEN_TTL_SECS = 15 * 60;

function shortId(bytes = 12): string {
  return randomBytes(bytes).toString('hex');
}

function requireWriteToken(): string | null {
  const token = process.env['BLOB_READ_WRITE_TOKEN'];
  return token && token.trim().length > 0 ? token : null;
}

/**
 * Vercel Blob private-store adapter stub (UTA-15).
 *
 * - Defaults every object to `access: 'private'` — there is no public path
 *   on this port. Reads are authorized through the application
 *   (`authorizeDownload`) which mints short-lived download grants.
 * - Never exposes `BLOB_READ_WRITE_TOKEN`: it stays server-side (used only
 *   to sign short-lived client-upload tokens / delete calls) and is never
 *   returned, logged, or embedded in client bundles.
 * - The issued `uploadToken` is a short-lived single-purpose credential
 *   (opaque id bound to one pathname + content-type + size), not the
 *   long-lived write token.
 *
 * Production swap-in: replace the opaque-token minting with
 * `generateClientToken()` from `@vercel/blob/client` (still `access:
 * 'private'`); the port shape and pathname convention do not change.
 */
export class VercelBlobAdapter implements ObjectStoragePort {
  readonly kind = 'vercel-blob';
  readonly access = 'private' as const;

  constructor(private readonly opts: { tokenTtlSecs?: number } = {}) {}

  private ttlSecs(): number {
    return this.opts.tokenTtlSecs ?? TOKEN_TTL_SECS;
  }

  /** Server-side guard: fail fast when the private store is unwired. */
  assertConfigured(): void {
    if (!requireWriteToken()) {
      throw new Error(
        'BLOB_READ_WRITE_TOKEN is not set. ' +
          'Point it at the environment private store (never production credentials in tests).'
      );
    }
  }

  async issueUploadToken(input: IssueUploadTokenInput): Promise<UploadToken> {
    this.assertConfigured();
    const ttl = input.expiresInSecs ?? this.ttlSecs();
    const nonce = shortId();
    const binding = createHash('sha256')
      .update(
        [
          input.workspaceId,
          input.pathname,
          input.contentType,
          String(input.byteSize),
          nonce,
        ].join('|')
      )
      .digest('hex')
      .slice(0, 32);
    // Opaque short-lived credential bound to one upload — the RW token
    // itself never leaves the server.
    const uploadToken = `blob_upl_${binding}`;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    return {
      pathname: input.pathname,
      uploadToken,
      uploadUrl: `/api/uploads/blob/${encodeURIComponent(binding)}`,
      expiresAt,
      access: 'private',
    };
  }

  async createDownloadGrant(
    pathname: string,
    _workspaceId: string
  ): Promise<DownloadGrant> {
    this.assertConfigured();
    const grant = shortId();
    return {
      pathname,
      downloadUrl: `/api/uploads/blob/${encodeURIComponent(grant)}?op=read`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async deleteObject(_pathname: string): Promise<void> {
    this.assertConfigured();
    // Stub: real implementation calls `del()` from `@vercel/blob` with the
    // server-side RW token. The port contract (throw on failure, resolve on
    // success) is what use cases depend on.
  }
}

/**
 * In-memory fixture adapter for local dev, preview fixtures, and tests.
 * Same `private` default and short-lived token semantics without network or
 * credentials. Byte contents stay in process memory keyed by pathname —
 * nothing is written to Postgres.
 */
export class MemoryBlobAdapter implements ObjectStoragePort {
  readonly kind = 'memory-blob';
  readonly access = 'private' as const;
  private objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async issueUploadToken(input: IssueUploadTokenInput): Promise<UploadToken> {
    const ttl = input.expiresInSecs ?? 900;
    return {
      pathname: input.pathname,
      uploadToken: `mem_upl_${shortId(8)}`,
      uploadUrl: `memory://upload/${encodeURIComponent(input.pathname)}`,
      expiresAt: new Date(Date.now() + ttl * 1000),
      access: 'private',
    };
  }

  async createDownloadGrant(
    pathname: string,
    _workspaceId: string
  ): Promise<DownloadGrant> {
    return {
      pathname,
      downloadUrl: `memory://download/${encodeURIComponent(pathname)}?grant=${shortId(8)}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async deleteObject(pathname: string): Promise<void> {
    this.objects.delete(pathname);
  }

  /** Fixture helper: put bytes the "client upload" would have stored. */
  putFixture(pathname: string, bytes: Buffer, contentType: string): void {
    this.objects.set(pathname, { bytes, contentType });
  }

  /** Fixture helper: read bytes through the authorized path. */
  readFixture(pathname: string): Buffer | null {
    return this.objects.get(pathname)?.bytes ?? null;
  }
}
