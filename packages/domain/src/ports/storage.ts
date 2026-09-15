/**
 * Object-storage port (UTA-15).
 *
 * Domain defines the interface; infrastructure (`@tokoboss/integrations`)
 * provides the Vercel Blob adapter. Application use cases and Route Handlers
 * never import Blob SDKs directly, and no second storage stack is introduced.
 *
 * All operational files default to the **private** store. Public access is
 * not offered by this port — reads go through the application so
 * cross-workspace access can be denied.
 */

export type BlobAccess = 'private';

export const DEFAULT_BLOB_ACCESS: BlobAccess = 'private';

/** Operational file purposes — the only values accepted before token issue. */
export const FILE_UPLOAD_PURPOSES = [
  'import',
  'manual-order',
  'sku-picture',
  'label',
  'evidence',
  'return',
  'export',
  'fixture',
  'avatar',
] as const;
export type FileUploadPurpose = (typeof FILE_UPLOAD_PURPOSES)[number];

export function isFileUploadPurpose(
  value: unknown
): value is FileUploadPurpose {
  return (
    typeof value === 'string' &&
    (FILE_UPLOAD_PURPOSES as readonly string[]).includes(value)
  );
}

export interface IssueUploadTokenInput {
  workspaceId: string;
  purpose: FileUploadPurpose;
  /** Server-derived pathname (never trust client-supplied paths). */
  pathname: string;
  contentType: string;
  byteSize: number;
  /** Short-lived client-upload token TTL in seconds. */
  expiresInSecs?: number;
}

export interface UploadToken {
  /** Server-derived private pathname the client must upload to. */
  pathname: string;
  /** Short-lived single-use upload credential (never the RW token). */
  uploadToken: string;
  /** Where the client PUTs the bytes (adapter-specific). */
  uploadUrl: string;
  expiresAt: Date;
  access: BlobAccess;
}

export interface DownloadGrant {
  pathname: string;
  /** Short-lived GET credential — never logged verbatim (see redact). */
  downloadUrl: string;
  expiresAt: Date;
}

/**
 * Minimal object-storage surface for UTA-15. Implementations:
 * - `VercelBlobAdapter` (`@tokoboss/integrations`) — private store stub.
 * - `MemoryBlobAdapter` (`@tokoboss/integrations`) — fixture/local + tests.
 */
export interface ObjectStoragePort {
  readonly kind: string;
  readonly access: BlobAccess;
  issueUploadToken(input: IssueUploadTokenInput): Promise<UploadToken>;
  createDownloadGrant(
    pathname: string,
    workspaceId: string
  ): Promise<DownloadGrant>;
  deleteObject(pathname: string): Promise<void>;
}
