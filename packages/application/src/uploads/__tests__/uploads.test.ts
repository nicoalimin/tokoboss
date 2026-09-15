import { describe, expect, it } from 'vitest';
import type { ObjectStoragePort } from '@tokoboss/domain';
import {
  InMemoryUploadStore,
  UploadForbiddenError,
  UploadValidationError,
  authorizeDownload,
  completeUpload,
  deleteUpload,
  requestUploadToken,
} from '../index';

const WS_A = 'ws_upload_a';
const WS_B = 'ws_upload_b';

/** Layer-clean fake: application tests must not import @tokoboss/integrations. */
function fakeStorage(): ObjectStoragePort {
  let seq = 0;
  return {
    kind: 'fake-blob',
    access: 'private',
    issueUploadToken: async (input) => {
      seq += 1;
      return {
        pathname: input.pathname,
        uploadToken: `fake_upl_${seq}`,
        uploadUrl: `fake://upload/${encodeURIComponent(input.pathname)}`,
        expiresAt: new Date(Date.now() + 900_000),
        access: 'private',
      };
    },
    createDownloadGrant: async (pathname) => ({
      pathname,
      downloadUrl: `fake://download/${encodeURIComponent(pathname)}?grant=${(seq += 1)}`,
      expiresAt: new Date(Date.now() + 300_000),
    }),
    deleteObject: async () => {},
  };
}

async function newHarness() {
  return { store: new InMemoryUploadStore(), blob: fakeStorage() };
}

async function issueFixture(
  store: InMemoryUploadStore,
  blob: ObjectStoragePort,
  overrides: {
    workspaceId?: string;
    purpose?: string;
    filename?: string;
    contentType?: string;
    byteSize?: number;
    role?: string;
    idempotencyKey?: string;
  } = {}
) {
  return requestUploadToken(store, blob, {
    workspaceId: overrides.workspaceId ?? WS_A,
    purpose: overrides.purpose ?? 'fixture',
    filename: overrides.filename ?? 'hello.txt',
    contentType: overrides.contentType ?? 'text/plain',
    byteSize: overrides.byteSize ?? 11,
    role: overrides.role ?? 'staff',
    idempotencyKey: overrides.idempotencyKey ?? `fix-${Math.random().toString(36).slice(2)}`,
  });
}

describe('token issuance validation (before any token)', () => {
  it('rejects unknown purposes', async () => {
    const { store, blob } = await newHarness();
    await expect(
      issueFixture(store, blob, { purpose: 'invoices-evil' })
    ).rejects.toThrow(UploadValidationError);
  });

  it('rejects disallowed content types per purpose', async () => {
    const { store, blob } = await newHarness();
    await expect(
      issueFixture(store, blob, {
        purpose: 'sku-picture',
        contentType: 'application/pdf',
      })
    ).rejects.toThrow(/not allowed for purpose/);
  });

  it('rejects oversize files per purpose', async () => {
    const { store, blob } = await newHarness();
    await expect(
      issueFixture(store, blob, {
        purpose: 'fixture',
        byteSize: 2 * 1024 * 1024,
      })
    ).rejects.toThrow(/exceeds/);
    await expect(
      issueFixture(store, blob, { byteSize: 0 })
    ).rejects.toThrow(UploadValidationError);
  });

  it('rejects missing workspace, filename, and path traversal', async () => {
    const { store, blob } = await newHarness();
    await expect(
      issueFixture(store, blob, { workspaceId: '  ' })
    ).rejects.toThrow(UploadValidationError);
    await expect(
      issueFixture(store, blob, { filename: '  ' })
    ).rejects.toThrow(UploadValidationError);
    await expect(
      issueFixture(store, blob, { filename: '../evil.txt' })
    ).rejects.toThrow(/bare name/);
  });

  it('rejects roles outside owner/admin/staff', async () => {
    const { store, blob } = await newHarness();
    await expect(issueFixture(store, blob, { role: 'viewer' })).rejects.toThrow(
      UploadForbiddenError
    );
    await expect(issueFixture(store, blob, { role: '' })).rejects.toThrow(
      UploadForbiddenError
    );
  });

  it('derives the pathname server-side (never trusts client paths)', async () => {
    const { store, blob } = await newHarness();
    const result = await issueFixture(store, blob, {
      filename: 'report.txt',
      idempotencyKey: 'srv-path-1',
    });
    expect(result.pathname).toBe(
      `workspaces/${WS_A}/fixture/srv-path-1/report.txt`
    );
    expect(blob.access).toBe('private');
  });

  it('duplicate token requests resolve to the same pending record', async () => {
    const { store, blob } = await newHarness();
    const first = await issueFixture(store, blob, { idempotencyKey: 'dup-tok' });
    const second = await issueFixture(store, blob, { idempotencyKey: 'dup-tok' });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.upload.id).toBe(first.upload.id);
    expect(second.pathname).toBe(first.pathname);
  });
});

describe('completion callback idempotency', () => {
  it('duplicate completions produce one finalized record', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'dup-complete',
    });
    const first = await completeUpload(store, {
      workspaceId: WS_A,
      uploadId: upload.id,
      pathname,
      byteSize: 11,
      checksum: 'abc123',
    });
    expect(first.duplicate).toBe(false);
    expect(first.upload.status).toBe('completed');

    const second = await completeUpload(store, {
      workspaceId: WS_A,
      uploadId: upload.id,
      pathname,
      byteSize: 11,
      checksum: 'abc123',
    });
    expect(second.duplicate).toBe(true);
    expect(second.upload.id).toBe(first.upload.id);
    expect(second.upload.status).toBe('completed');

    // Exactly one finalized row in the workspace.
    const rows = await store.listByWorkspace(WS_A);
    expect(rows.filter((r) => r.status === 'completed')).toHaveLength(1);
  });

  it('completion with a mismatched pathname or size is rejected', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'mismatch-1',
    });
    await expect(
      completeUpload(store, {
        workspaceId: WS_A,
        uploadId: upload.id,
        pathname: 'workspaces/other/fixture/x/y.txt',
        byteSize: 11,
      })
    ).rejects.toThrow(/does not match/);
    await expect(
      completeUpload(store, {
        workspaceId: WS_A,
        uploadId: upload.id,
        pathname,
        byteSize: 99 * 1024 * 1024,
      })
    ).rejects.toThrow(/exceeds/);
  });
});

describe('cross-workspace isolation', () => {
  it('one workspace cannot complete another workspace upload', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'xws-complete',
    });
    await expect(
      completeUpload(store, {
        workspaceId: WS_B,
        uploadId: upload.id,
        pathname,
        byteSize: 11,
      })
    ).rejects.toThrow();
  });

  it('one workspace cannot download another workspace file', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'xws-read',
    });
    await completeUpload(store, {
      workspaceId: WS_A,
      uploadId: upload.id,
      pathname,
      byteSize: 11,
    });
    await expect(
      authorizeDownload(store, blob, { workspaceId: WS_B, uploadId: upload.id })
    ).rejects.toThrow(UploadForbiddenError);
    // The rightful workspace succeeds.
    const grant = await authorizeDownload(store, blob, {
      workspaceId: WS_A,
      uploadId: upload.id,
    });
    expect(grant.downloadUrl.length).toBeGreaterThan(0);
  });

  it('one workspace cannot delete another workspace file', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'xws-delete',
    });
    await completeUpload(store, {
      workspaceId: WS_A,
      uploadId: upload.id,
      pathname,
      byteSize: 11,
    });
    await expect(
      deleteUpload(store, blob, { workspaceId: WS_B, uploadId: upload.id })
    ).rejects.toThrow(UploadForbiddenError);
  });

  it('pending uploads are not readable', async () => {
    const { store, blob } = await newHarness();
    const { upload } = await issueFixture(store, blob, {
      idempotencyKey: 'pending-read',
    });
    await expect(
      authorizeDownload(store, blob, { workspaceId: WS_A, uploadId: upload.id })
    ).rejects.toThrow(/not readable/);
  });
});

describe('metadata-only + secret safety', () => {
  it('rejects file contents / secrets / PII in metadata', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'safe-meta',
    });
    // Base64-looking "checksum" (contents) is rejected.
    await expect(
      completeUpload(store, {
        workspaceId: WS_A,
        uploadId: upload.id,
        pathname,
        byteSize: 11,
        checksum: Buffer.from('x'.repeat(2048)).toString('base64'),
      })
    ).rejects.toThrow(/file contents/);
    // Secret-bearing related-entity refs are rejected at token time.
    await expect(
      requestUploadToken(store, blob, {
        workspaceId: WS_A,
        purpose: 'fixture',
        filename: 'ok.txt',
        contentType: 'text/plain',
        byteSize: 3,
        role: 'staff',
        relatedEntityId: 'buyer@example.com',
      })
    ).rejects.toThrow(UploadValidationError);
  });

  it('records only references (pathname/url), never bytes', async () => {
    const { store, blob } = await newHarness();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'meta-only',
    });
    const done = await completeUpload(store, {
      workspaceId: WS_A,
      uploadId: upload.id,
      pathname,
      byteSize: 11,
      checksum:
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    });
    const serialized = JSON.stringify(done.upload);
    expect(serialized).not.toMatch(/data:/);
    expect(serialized).not.toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(done.upload.pathname).toBe(pathname);
  });

  it('deletion tombstones the row and emits audit events', async () => {
    const store = new InMemoryUploadStore();
    const blob = fakeStorage();
    const { upload, pathname } = await issueFixture(store, blob, {
      idempotencyKey: 'del-audit',
    });
    await completeUpload(store, { workspaceId: WS_A, uploadId: upload.id, pathname, byteSize: 11 }, store.audit);
    const deleted = await deleteUpload(
      store,
      blob,
      { workspaceId: WS_A, uploadId: upload.id },
      store.audit
    );
    expect(deleted.status).toBe('deleted');
    expect(
      store.auditEvents.map((e) => e.action)
    ).toContain('file_upload.deleted');
    // Deleted uploads are no longer readable.
    await expect(
      authorizeDownload(store, blob, { workspaceId: WS_A, uploadId: upload.id })
    ).rejects.toThrow();
  });
});

describe('private store default', () => {
  it('adapters default to private access', async () => {
    const { blob } = await newHarness();
    expect(blob.access).toBe('private');
    const token = await blob.issueUploadToken({
      workspaceId: WS_A,
      purpose: 'fixture',
      pathname: 'workspaces/ws/fixture/k/f.txt',
      contentType: 'text/plain',
      byteSize: 3,
    });
    expect(token.access).toBe('private');
  });
});
