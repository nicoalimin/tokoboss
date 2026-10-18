/**
 * Stock Opname count-screen copy, Bahasa Indonesia first (US12 / RFC 03 task
 * 41b): count panel (scan, search, entry, blind mode, progress) and the
 * duplicate-scan dialog. Uncounted lines are never called zero; an explicit
 * zero is labelled as such. The system quantity is never shown here.
 */
import type { StockCountLang } from './stock-count-copy';

export interface StockCountCountCopy {
  scanLabel: string;
  scanPlaceholder: string;
  cameraButton: string;
  searchLabel: string;
  qtyLabel: string;
  saveEntry: string;
  saving: string;
  savedNote: string;
  blindNote: string;
  progress: (counted: number, total: number) => string;
  uncounted: string;
  countedScans: (scans: number) => string;
  explicitZero: string;
  notInSession: string;
  qtyInvalid: string;
  onlineRequired: string;
  dupTitle: string;
  dupBody: string;
  dupAdd: string;
  dupReplace: string;
  dupRemember: string;
}

const id: StockCountCountCopy = {
  scanLabel: 'Pindai barcode atau ketik SKU',
  scanPlaceholder: 'Barcode atau kode SKU',
  cameraButton: 'Pindai dengan kamera',
  searchLabel: 'Cari SKU atau nama produk',
  qtyLabel: 'Jumlah dihitung',
  saveEntry: 'Simpan',
  saving: 'Menyimpan…',
  savedNote: 'Tersimpan otomatis per entri.',
  blindNote: 'Mode buta: jumlah sistem disembunyikan sampai tinjauan.',
  progress: (counted, total) => `${counted} dari ${total} SKU dihitung`,
  uncounted: 'Belum dihitung',
  countedScans: (scans) => `Dihitung · ${scans} pindai`,
  explicitZero: 'Dihitung = 0 (eksplisit)',
  notInSession: 'SKU tidak termasuk sesi ini',
  qtyInvalid: 'Masukkan bilangan bulat 0 sampai 1.000.000.',
  onlineRequired: 'Perlu koneksi internet untuk menghitung.',
  dupTitle: 'Pindai ganda terdeteksi',
  dupBody: 'SKU ini sudah dihitung. Tambahkan ke jumlah sebelumnya atau ganti?',
  dupAdd: 'Tambahkan',
  dupReplace: 'Ganti',
  dupRemember: 'Ingat pilihan untuk sesi ini',
};

const en: StockCountCountCopy = {
  scanLabel: 'Scan a barcode or type a SKU',
  scanPlaceholder: 'Barcode or SKU code',
  cameraButton: 'Scan with camera',
  searchLabel: 'Search SKU or product name',
  qtyLabel: 'Counted quantity',
  saveEntry: 'Save',
  saving: 'Saving…',
  savedNote: 'Each entry saves automatically.',
  blindNote: 'Blind mode: the system quantity stays hidden until review.',
  progress: (counted, total) => `${counted} of ${total} SKUs counted`,
  uncounted: 'Not counted yet',
  countedScans: (scans) => `Counted · ${scans} scans`,
  explicitZero: 'Counted = 0 (explicit)',
  notInSession: 'This SKU is not part of this session',
  qtyInvalid: 'Enter a whole number from 0 to 1,000,000.',
  onlineRequired: 'Counting needs an internet connection.',
  dupTitle: 'Duplicate scan detected',
  dupBody: 'This SKU is already counted. Add to the earlier count or replace?',
  dupAdd: 'Add',
  dupReplace: 'Replace',
  dupRemember: 'Remember my choice for this session',
};

const COPIES: Record<StockCountLang, StockCountCountCopy> = { id, en };

export function getStockCountCountCopy(
  lang: StockCountLang = 'id'
): StockCountCountCopy {
  return COPIES[lang] ?? COPIES.id;
}
