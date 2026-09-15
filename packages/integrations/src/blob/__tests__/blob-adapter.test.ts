import { describe, expect, it } from 'vitest';
import { MemoryBlobAdapter, VercelBlobAdapter } from '../vercel-blob-adapter';

/**
 * Blob adapter stub tests (UTA-15 acceptance: private default, short-lived
 * tokens, secrets never reach client bundles/logs).
 */
describe('vercel blob adapter stub', () => {
  it('defaults every object to the private store', () => {
    const adapter = new VercelBlobAdapter();
    expect(adapter.kind).toBe('vercel-blob');
    expect(adapter.access).toBe('private');
  });

  it('refuses to mint tokens without the server-side write token', async () => {
    const adapter = new VercelBlobAdapter();
    const saved = process.env['BLOB_READ_WRITE_TOKEN'];
    delete process.env['BLOB_READ_WRITE_TOKEN'];
    try {
      await expect(
        adapter.issueUploadToken({
          workspaceId: 'ws_1',
          purpose: 'fixture',
          pathname: 'workspaces/ws_1/fixture/k/f.txt',
          contentType: 'text/plain',
          byteSize: 3,
        })
      ).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);
    } finally {
      if (saved !== undefined) process.env['BLOB_READ_WRITE_TOKEN'] = saved;
    }
  });

  it('mints short-lived single-use tokens that never contain the RW token', async () => {
    process.env['BLOB_READ_WRITE_TOKEN'] = 'vercel_blob_rw_test_stub_value';
    const adapter = new VercelBlobAdapter();
    try {
      const first = await adapter.issueUploadToken({
        workspaceId: 'ws_1',
        purpose: 'fixture',
        pathname: 'workspaces/ws_1/fixture/k/f.txt',
        contentType: 'text/plain',
        byteSize: 3,
      });
      const second = await adapter.issueUploadToken({
        workspaceId: 'ws_1',
        purpose: 'fixture',
        pathname: 'workspaces/ws_1/fixture/k/f.txt',
        contentType: 'text/plain',
        byteSize: 3,
      });
      expect(first.access).toBe('private');
      expect(first.uploadToken).not.toContain('vercel_blob_rw_test_stub_value');
      expect(first.uploadUrl).not.toContain('vercel_blob_rw_test_stub_value');
      // Single-use: every issuance binds a fresh nonce.
      expect(first.uploadToken).not.toBe(second.uploadToken);
      // Short-lived: ~15 minutes, not days.
      const ttlMs = first.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(16 * 60 * 1000);
    } finally {
      delete process.env['BLOB_READ_WRITE_TOKEN'];
    }
  });

  it('redacts adapter outputs for logs (no secret/token leak)', async () => {
    process.env['BLOB_READ_WRITE_TOKEN'] = 'vercel_blob_rw_test_stub_value';
    const adapter = new VercelBlobAdapter();
    try {
      const token = await adapter.issueUploadToken({
        workspaceId: 'ws_1',
        purpose: 'fixture',
        pathname: 'workspaces/ws_1/fixture/k/f.txt',
        contentType: 'text/plain',
        byteSize: 3,
      });
      // Only references cross the boundary — the RW secret never appears in
      // anything the handler could log or return.
      expect(JSON.stringify(token)).not.toContain(
        'vercel_blob_rw_test_stub_value'
      );
    } finally {
      delete process.env['BLOB_READ_WRITE_TOKEN'];
    }
  });
});

describe('memory blob fixture adapter', () => {
  it('round-trips fixture bytes through the authorized path', async () => {
    const adapter = new MemoryBlobAdapter();
    expect(adapter.access).toBe('private');
    const bytes = Buffer.from('hello fixture');
    adapter.putFixture('workspaces/ws/fixture/k/f.txt', bytes, 'text/plain');
    expect(adapter.readFixture('workspaces/ws/fixture/k/f.txt')?.toString()).toBe(
      'hello fixture'
    );
    await adapter.deleteObject('workspaces/ws/fixture/k/f.txt');
    expect(adapter.readFixture('workspaces/ws/fixture/k/f.txt')).toBeNull();
  });

  it('isolates pathnames (no cross-key reads)', () => {
    const adapter = new MemoryBlobAdapter();
    adapter.putFixture('workspaces/a/fixture/k/f.txt', Buffer.from('A'), 'text/plain');
    expect(adapter.readFixture('workspaces/b/fixture/k/f.txt')).toBeNull();
  });
});
