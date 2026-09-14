import { describe, expect, it } from 'vitest';
import { newCorrelationId, newRequestId } from '../correlation.js';
import { runSampleJob } from '../sample-job.js';

describe('sample job correlation', () => {
  it('shares the request correlation id end to end', async () => {
    const lines: string[] = [];
    const requestId = newRequestId();
    const correlationId = newCorrelationId();
    const result = await runSampleJob({
      correlationId,
      requestId,
      workspaceId: 'ws_demo',
      sink: (l) => lines.push(l),
    });
    expect(result.correlationId).toBe(correlationId);
    expect(result.status).toBe('completed');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(entry.correlationId).toBe(correlationId);
      expect(entry.jobId).toBe(result.jobId);
    }
  });
});
