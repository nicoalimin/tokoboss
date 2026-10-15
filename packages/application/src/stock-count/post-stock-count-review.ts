import { stockCountValidation } from './stock-count-errors';
import { computeVariance, flagReasons } from './stock-count-rules';
import {
  STOCK_COUNT_VARIANCE_REASON_CODES,
  type StockCountLineRecord,
  type StockCountVarianceReasonCode,
} from './stock-count-types';

/**
 * Pre-post review check (US12 / RFC 03 task 15a). Pure. Merges the poster's
 * per-line review (reason, note, re-verification tick) over the stored
 * line, then enforces: a counted line with a non-zero variance needs a
 * reason ('other' needs a note); a D4-flagged line must be re-verified.
 * Uncounted lines are excluded (never zero); zero variance = matched.
 */
export interface StockCountLineReviewInput {
  lineId: string;
  varianceReasonCode?: StockCountVarianceReasonCode | null;
  varianceNote?: string | null;
  flagVerified?: boolean;
}

export interface StockCountReviewedLine {
  line: StockCountLineRecord;
  varianceReasonCode: StockCountVarianceReasonCode | null;
  varianceNote: string | null;
  flagVerified: boolean;
  changed: boolean;
}

export interface StockCountPostSummary {
  postedLines: number;
  matchedLines: number;
  excludedLines: number;
  flaggedLines: number;
  totalDelta: number;
}

/** liveQtyByLine: live balance per counted line id (missing = 0). */
export function reviewLinesForPost(
  lines: StockCountLineRecord[],
  reviews: StockCountLineReviewInput[],
  liveQtyByLine: Map<string, number>
): { reviewed: StockCountReviewedLine[]; summary: StockCountPostSummary } {
  const lineIds = new Set(lines.map((l) => l.id));
  const byId = new Map<string, StockCountLineReviewInput>();
  for (const r of reviews) {
    if (!lineIds.has(r.lineId)) {
      throw stockCountValidation('Baris tinjauan tidak termasuk sesi ini.');
    }
    byId.set(r.lineId, r);
  }
  const summary: StockCountPostSummary = {
    postedLines: 0,
    matchedLines: 0,
    excludedLines: 0,
    flaggedLines: 0,
    totalDelta: 0,
  };
  const reviewed = lines.map((line): StockCountReviewedLine => {
    const r = byId.get(line.id);
    const code =
      r?.varianceReasonCode !== undefined
        ? r.varianceReasonCode
        : line.varianceReasonCode;
    if (code !== null && !STOCK_COUNT_VARIANCE_REASON_CODES.includes(code)) {
      throw stockCountValidation('Alasan selisih tidak valid.');
    }
    const rawNote =
      r?.varianceNote !== undefined ? r.varianceNote : line.varianceNote;
    const note = (rawNote ?? '').trim();
    if (note.length > 500) {
      throw stockCountValidation('Catatan maks. 500 karakter.');
    }
    const verified = r?.flagVerified ?? line.flagVerified;
    const variance = computeVariance(line);
    const flags = flagReasons(line, liveQtyByLine.get(line.id) ?? 0);
    if (flags.length > 0) summary.flaggedLines += 1;
    if (variance === null) summary.excludedLines += 1;
    else if (variance === 0) summary.matchedLines += 1;
    else {
      summary.postedLines += 1;
      summary.totalDelta += variance;
      if (code === null) throw stockCountValidation('Alasan selisih wajib.');
      if (code === 'other' && note.length === 0) {
        throw stockCountValidation('Catatan wajib untuk alasan Lainnya.');
      }
    }
    if (flags.length > 0 && !verified) {
      throw stockCountValidation('Baris bertanda wajib diverifikasi ulang.');
    }
    const varianceNote = note.length === 0 ? null : note;
    const changed =
      code !== line.varianceReasonCode ||
      varianceNote !== line.varianceNote ||
      verified !== line.flagVerified;
    return {
      line,
      varianceReasonCode: code,
      varianceNote,
      flagVerified: verified,
      changed,
    };
  });
  return { reviewed, summary };
}
