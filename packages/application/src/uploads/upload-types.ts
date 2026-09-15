/**
 * File-upload domain model for the application layer (UTA-15).
 *
 * `file_uploads` is metadata only: workspace, purpose, related entity,
 * pathname/URL reference, MIME type, byte size, checksum, creator,
 * retention, status, timestamps (+ tenancy helpers). Blob **contents** are
 * never stored in Postgres — only the private pathname/URL reference.
 */

import type { FileUploadPurpose } from '@tokoboss/domain';

export { FILE_UPLOAD_PURPOSES, isFileUploadPurpose } from '@tokoboss/domain';
export type { FileUploadPurpose } from '@tokoboss/domain';

export const FILE_UPLOAD_STATUSES = [
  'pending',
  'completed',
  'deleted',
] as const;
export type FileUploadStatus = (typeof FILE_UPLOAD_STATUSES)[number];

export function isFileUploadStatus(value: unknown): value is FileUploadStatus {
  return (
    typeof value === 'string' &&
    (FILE_UPLOAD_STATUSES as readonly string[]).includes(value)
  );
}

/** Roles allowed to request upload tokens (validated before issuance). */
export const UPLOAD_ALLOWED_ROLES = ['owner', 'admin', 'staff'] as const;
export type UploadRole = (typeof UPLOAD_ALLOWED_ROLES)[number];

export function isUploadAllowedRole(value: unknown): value is UploadRole {
  return (
    typeof value === 'string' &&
    (UPLOAD_ALLOWED_ROLES as readonly string[]).includes(value)
  );
}

/** MIME allowlist per purpose — rejected before any token is issued. */
export const PURPOSE_MIME_ALLOWLIST: Record<
  FileUploadPurpose,
  readonly string[]
> = {
  import: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  'manual-order': ['text/csv', 'application/pdf', 'image/png', 'image/jpeg'],
  'sku-picture': ['image/png', 'image/jpeg', 'image/webp'],
  label: ['application/pdf', 'image/png'],
  evidence: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  return: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  export: ['text/csv', 'application/pdf'],
  fixture: ['text/plain', 'application/octet-stream', 'image/png'],
  avatar: ['image/png', 'image/jpeg', 'image/webp'],
};

/** Max accepted bytes per purpose (validated before token issuance). */
export const PURPOSE_MAX_BYTES: Record<FileUploadPurpose, number> = {
  import: 10 * 1024 * 1024,
  'manual-order': 10 * 1024 * 1024,
  'sku-picture': 5 * 1024 * 1024,
  label: 5 * 1024 * 1024,
  evidence: 10 * 1024 * 1024,
  return: 10 * 1024 * 1024,
  export: 25 * 1024 * 1024,
  fixture: 1 * 1024 * 1024,
  avatar: 5 * 1024 * 1024,
};

export const MAX_FILENAME_LEN = 255;

export interface FileUploadRecord {
  id: string;
  workspaceId: string;
  purpose: FileUploadPurpose;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  pathname: string;
  url: string | null;
  contentType: string;
  byteSize: number;
  checksum: string | null;
  idempotencyKey: string;
  createdByType: string | null;
  createdById: string | null;
  status: FileUploadStatus;
  retentionUntil: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewFileUploadInput {
  workspaceId: string;
  purpose: FileUploadPurpose;
  relatedEntityType?: string;
  relatedEntityId?: string;
  pathname: string;
  url?: string;
  contentType: string;
  byteSize: number;
  checksum?: string;
  idempotencyKey: string;
  createdByType?: string;
  createdById?: string;
  retentionUntil?: Date;
}

export type FileUploadPatch = Partial<
  Pick<
    FileUploadRecord,
    | 'relatedEntityType'
    | 'relatedEntityId'
    | 'url'
    | 'checksum'
    | 'createdByType'
    | 'createdById'
    | 'status'
    | 'retentionUntil'
    | 'completedAt'
    | 'byteSize'
    | 'contentType'
  >
>;
