/**
 * Problem screen copy, Bahasa Indonesia first (US20 / RFC 04 task 100c-ii):
 * mockup v2 screen 4 chrome, the Diblokir chip, Coba lagi and the blocked
 * card's next steps, history note, back button and audit line. The
 * Perlu otorisasi ulang chip is status.needs_reauth in integration-copy.ts.
 * Never names or hints at the owning workspace; no scheduled-retry wording.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationBlockedAuditContext {
  actor: string;
  role: string;
  provider: string;
  /** Already masked by the caller, e.g. 7495…0213. */
  storeId: string;
  time: string;
}

export interface IntegrationProblemScreenCopy {
  navLabel: string;
  heading: string;
  intro: string;
  blockedChip: string;
  retry: string;
  nextStepsTitle: string;
  nextSteps: readonly string[];
  supportPrefix: string;
  supportLink: string;
  historyNote: string;
  backToCenter: string;
  auditLabel: string;
  blockedAudit: (ctx: IntegrationBlockedAuditContext) => string;
}

const id: IntegrationProblemScreenCopy = {
  navLabel: 'Masalah koneksi',
  heading: 'Gagal / perlu otorisasi ulang',
  intro:
    'Setiap kegagalan menjelaskan penyebab dan langkah pemulihan. Tidak ada koneksi yang dibuat setengah jadi.',
  blockedChip: 'Diblokir',
  retry: 'Coba lagi',
  nextStepsTitle: 'Langkah berikutnya',
  nextSteps: [
    'Minta Admin workspace pemilik untuk memutus toko ini di workspace tersebut, lalu hubungkan dari awal di sini.',
  ],
  supportPrefix: 'Atau',
  supportLink: 'hubungi support',
  historyNote:
    'Pemetaan SKU, order, dan riwayat ledger tetap di workspace lama dan tidak ikut pindah. Workspace ini akan mulai tanpa pemetaan.',
  backToCenter: 'Kembali ke Pusat integrasi',
  auditLabel: 'Log audit (workspace ini)',
  blockedAudit: (c) =>
    `${c.actor} (${c.role}) mencoba menghubungkan ${c.provider} · ID toko ${c.storeId} — diblokir: sudah terhubung ke workspace lain · ${c.time}`,
};

const en: IntegrationProblemScreenCopy = {
  navLabel: 'Connection problems',
  heading: 'Failed / needs reauthorization',
  intro:
    'Every failure explains the cause and how to recover. No connection is ever left half-made.',
  blockedChip: 'Blocked',
  retry: 'Try again',
  nextStepsTitle: 'Next steps',
  nextSteps: [
    'Ask an Admin of the owning workspace to disconnect this store there, then connect it from scratch here.',
  ],
  supportPrefix: 'Or',
  supportLink: 'contact support',
  historyNote:
    'SKU mappings, orders and ledger history stay in the old workspace and do not move. This workspace starts without mappings.',
  backToCenter: 'Back to Integration center',
  auditLabel: 'Audit log (this workspace)',
  blockedAudit: (c) =>
    `${c.actor} (${c.role}) tried to connect ${c.provider} · store ID ${c.storeId} — blocked: already connected to another workspace · ${c.time}`,
};

const COPIES: Record<IntegrationLang, IntegrationProblemScreenCopy> = {
  id,
  en,
};

export function getIntegrationProblemScreenCopy(
  lang: IntegrationLang = 'id'
): IntegrationProblemScreenCopy {
  return COPIES[lang] ?? COPIES.id;
}
