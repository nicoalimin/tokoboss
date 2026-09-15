import { describe, expect, it } from 'vitest';
import {
  InMemoryUploadStore,
  authorizeDownload,
  completeUpload,
  requestUploadToken,
} from '@tokoboss/application';
import { MemoryBlobAdapter } from '@tokoboss/integrations';

/**
 * Upload/download fixture flow through the same wiring the Route Handlers
 * use (`@/lib/uploads`: memory store + memory blob when no env is set).
 * Proves an authorized client can upload and read a private fixture, and
 * that nothing secret-bearing reaches the response shapes.
 */
const WS = 'ws_web_fixture';

describe('private fixture upload/read (web wiring)', () => {
  it('authorized client uploads and reads a private fixture', async () => {
    const store = new InMemoryUploadStore();
    const blob = new MemoryBlobAdapter();

    const issued = await requestUploadToken(store, blob, {
      workspaceId: WS,
      purpose: 'fixture',
      filename: 'hello.txt',
      contentType: 'text/plain',
      byteSize: 13,
      role: 'staff',
      idempotencyKey: 'web-fix-1',
    });
    expect(issued.pathname).toBe(`workspaces/${WS}/fixture/web-fix-1/hello.txt`);

    // Fixture "client upload": bytes go to the blob store, never Postgres.
    blob.putFixture(issued.pathname, Buffer.from('hello, fixture'), 'text/plain');

    const completed = await completeUpload(store, {
      workspaceId: WS,
      uploadId: issued.upload.id,
      pathname: issued.pathname,
      byteSize: 13,
    });
    expect(completed.upload.status).toBe('completed');

    const read = await authorizeDownload(store, blob, {
      workspaceId: WS,
      uploadId: issued.upload.id,
    });
    expect(
      blob.readFixture(issued.pathname)?.toString()
    ).toBe('hello, fixture');
    expect(read.downloadUrl.length).toBeGreaterThan(0);

    // Response-safe: no RW token, no DATABASE_URL, no raw bytes.
    const wire = JSON.stringify({
      upload: completed.upload,
      downloadUrl: read.downloadUrl,
    });
    expect(wire).not.toContain('BLOB_READ_WRITE_TOKEN');
    expect(wire).not.toContain('DATABASE_URL');
    expect(wire).not.toContain('hello, fixture');
    expect(process.env['BLOB_READ_WRITE_TOKEN'] ?? '').not.toContain('NEXT_PUBLIC');
  });

  it('denies cross-workspace download (404-shape at the route)', async () => {
    const store = new InMemoryUploadStore();
    const blob = new MemoryBlobAdapter();
    const issued = await requestUploadToken(store, blob, {
      workspaceId: WS,
      purpose: 'fixture',
      filename: 'secret.txt',
      contentType: 'text/plain',
      byteSize: 6,
      role: 'admin',
      idempotencyKey: 'web-fix-2',
    });
    await completeUpload(store, {
      workspaceId: WS,
      uploadId: issued.upload.id,
      pathname: issued.pathname,
      byteSize: 6,
    });
    const err = await authorizeDownload(store, blob, {
      workspaceId: 'ws_intruder',
      uploadId: issued.upload.id,
    }).catch((e: unknown) => e);
    expect((err as Error).name).toBe('UploadForbiddenError');
  });
});
