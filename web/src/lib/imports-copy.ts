/**
 * Web product import review UI copy (UTA-78, Story 02 web).
 *
 * English + Indonesian strings for the upload → review → confirm flow over
 * the UTA-77 import APIs. Keys must stay in sync across locales (see
 * `web/src/__tests__/import-review-ui.test.ts`).
 *
 * Copy rules (UTA-77 freeze):
 * - Failures are generic where the API is: cross-workspace and Staff-write
 *   denials share one access message (no role oracle); strings never echo
 *   workspace ids, user ids, tokens, or session material.
 * - Duplicate copy points at the existing row via the opaque `existingPath`
 *   route reference (never raw ids).
 * - The marketplace Store SKU is always worded as a mapping candidate only
 *   — it never replaces the SKU TokoBoss identity.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names. No live channel calls are promised anywhere.
 */

export type ImportsLang = 'en' | 'id';

export interface ImportsCopy {
  pageTitle: string;
  pageSubtitle: string;
  importLinkLabel: string;
  backToProductsLink: string;
  backHomeLink: string;
  workspaceLabel: string;
  workspacePlaceholder: string;
  loadButton: string;
  loading: string;
  loadingBatches: string;
  uploadTitle: string;
  uploadSubtitle: string;
  filenameLabel: string;
  filenamePlaceholder: string;
  csvLabel: string;
  csvPlaceholder: string;
  csvHint: string;
  fileLabel: string;
  fileHint: string;
  rowsModeLabel: string;
  rowsJsonLabel: string;
  rowsJsonPlaceholder: string;
  rowsJsonHint: string;
  uploadButton: string;
  uploading: string;
  uploadedNotice: string;
  uploadDuplicateNotice: string;
  batchesTitle: string;
  batchesEmpty: string;
  batchOpen: string;
  batchStatusLabel: string;
  batchCountersHint: string;
  rowTableTitle: string;
  rowNumberLabel: string;
  rowProductLabel: string;
  rowSkuLabel: string;
  rowVariantLabel: string;
  rowPriceLabel: string;
  rowStoreSkuLabel: string;
  rowStoreSkuHint: string;
  rowStatusLabel: string;
  rowErrorsLabel: string;
  rowDuplicateLabel: string;
  rowAppliedLabel: string;
  rowActionsLabel: string;
  rowEditButton: string;
  rowSaveButton: string;
  rowSaving: string;
  rowCancelButton: string;
  rowRejectButton: string;
  rowRejecting: string;
  rowRejectedNotice: string;
  rowSavedNotice: string;
  editNameLabel: string;
  editSkuLabel: string;
  editPriceLabel: string;
  editNoteLabel: string;
  editNotePlaceholder: string;
  confirmTitle: string;
  confirmSubtitle: string;
  confirmButton: string;
  confirming: string;
  confirmedNotice: string;
  confirmDuplicatesTitle: string;
  confirmSkippedTitle: string;
  rejectBatchButton: string;
  rejectingBatch: string;
  reopenBatchButton: string;
  reopeningBatch: string;
  batchRejectedNotice: string;
  batchReopenedNotice: string;
  batchConfirmPrompt: string;
  batchRejectPrompt: string;
  identityFreezeNote: string;
  noLiveChannelNote: string;
  readOnlyNote: string;
  noAccessTitle: string;
  noAccessBody: string;
  validationError: string;
  rowsJsonError: string;
  genericError: string;
  forbiddenError: string;
  expiredNotice: string;
}

const en: ImportsCopy = {
  pageTitle: 'Impor Produk',
  pageSubtitle:
    'Upload CSV, review every row before anything is created, then confirm. Nothing touches the catalog until you confirm.',
  importLinkLabel: 'Review product imports',
  backToProductsLink: 'Back to Produk & Stok',
  backHomeLink: 'Back to home',
  workspaceLabel: 'Workspace ID',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Load imports',
  loading: 'Loading…',
  loadingBatches: 'Loading batches…',
  uploadTitle: 'New import batch',
  uploadSubtitle:
    'Paste CSV text or pick a .csv file (read in your browser, sent as text). xlsx / photo / PDF converters submit pre-parsed rows as JSON.',
  filenameLabel: 'Filename',
  filenamePlaceholder: 'produk.csv',
  csvLabel: 'CSV text',
  csvPlaceholder:
    'product_name,sku_tokoboss,variant_name,price,store_sku,channel,shop_id,platform_sku_id',
  csvHint:
    'Required columns: product_name + price. sku_tokoboss optional (server fills IMP-… when blank). Max 500 rows.',
  fileLabel: 'Or pick a .csv file',
  fileHint: 'Read locally in your browser — only text is sent to the API.',
  rowsModeLabel: 'Submit pre-parsed rows (JSON) instead of CSV',
  rowsJsonLabel: 'Rows JSON',
  rowsJsonPlaceholder: '[{"product_name": "Kaos Polos", "price": 99000}]',
  rowsJsonHint:
    'JSON array of 1–500 row objects using the same column vocabulary. The server never parses binary formats.',
  uploadButton: 'Upload for review',
  uploading: 'Uploading…',
  uploadedNotice: 'Batch uploaded — review the rows below before confirming.',
  uploadDuplicateNotice:
    'That upload was already received — opened the existing batch instead of creating a duplicate.',
  batchesTitle: 'Batches',
  batchesEmpty: 'No import batches yet. Upload the first CSV above.',
  batchOpen: 'Open review',
  batchStatusLabel: 'Status',
  batchCountersHint: 'ready / total · applied · rejected',
  rowTableTitle: 'Review rows',
  rowNumberLabel: 'Row',
  rowProductLabel: 'Product',
  rowSkuLabel: 'SKU TokoBoss',
  rowVariantLabel: 'Variant',
  rowPriceLabel: 'Price',
  rowStoreSkuLabel: 'Store SKU (mapping candidate)',
  rowStoreSkuHint:
    'Marketplace hint only — stored as a mapping on confirm, never as the TokoBoss identity.',
  rowStatusLabel: 'Status',
  rowErrorsLabel: 'Needs attention',
  rowDuplicateLabel: 'Already exists',
  rowAppliedLabel: 'Created',
  rowActionsLabel: 'Actions',
  rowEditButton: 'Edit',
  rowSaveButton: 'Save row',
  rowSaving: 'Saving…',
  rowCancelButton: 'Cancel',
  rowRejectButton: 'Reject',
  rowRejecting: 'Rejecting…',
  rowRejectedNotice: 'Row rejected — it will be skipped on confirm.',
  rowSavedNotice: 'Row saved and re-validated.',
  editNameLabel: 'Product name',
  editSkuLabel: 'SKU TokoBoss',
  editPriceLabel: 'Price (IDR)',
  editNoteLabel: 'Note (optional)',
  editNotePlaceholder: 'out of scope…',
  confirmTitle: 'Confirm before create',
  confirmSubtitle:
    'Confirm creates catalog products + SKU TokoBoss rows. Rejected and invalid rows are skipped. Duplicates are never overwritten.',
  confirmButton: 'Confirm ready rows',
  confirming: 'Confirming…',
  confirmedNotice:
    'Confirm finished — see applied, duplicates, and skipped below.',
  confirmDuplicatesTitle: 'Duplicates (kept honest — existing catalog kept)',
  confirmSkippedTitle: 'Skipped',
  rejectBatchButton: 'Reject batch',
  rejectingBatch: 'Rejecting…',
  reopenBatchButton: 'Reopen batch',
  reopeningBatch: 'Reopening…',
  batchRejectedNotice: 'Batch rejected. Nothing was created.',
  batchReopenedNotice: 'Batch reopened for review.',
  batchConfirmPrompt:
    'Confirm all ready rows? This creates catalog products and cannot be undone row-by-row — rejected rows stay skipped.',
  batchRejectPrompt:
    'Reject this whole batch? Rows stay readable but nothing can be confirmed.',
  identityFreezeNote:
    'Store SKU text is a mapping candidate only. The SKU TokoBoss identity is the only catalog identity.',
  noLiveChannelNote:
    'No live marketplace calls — candidates are read from this batch only.',
  readOnlyNote:
    'You can read batches and rows. Upload, edits, and confirm need Manager or Admin.',
  noAccessTitle: 'No access to these imports',
  noAccessBody:
    'Sign in as a member of this workspace, then load again. Details stay hidden until access is confirmed.',
  validationError: 'Check the highlighted fields and try again.',
  rowsJsonError: 'Rows must be a JSON array of 1–500 row objects.',
  genericError: 'Something went wrong. Try again.',
  forbiddenError: 'You do not have access to this workspace.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
};

const id: ImportsCopy = {
  pageTitle: 'Impor Produk',
  pageSubtitle:
    'Unggah CSV, periksa setiap baris sebelum ada yang dibuat, lalu konfirmasi. Tidak ada yang menyentuh katalog sebelum Anda konfirmasi.',
  importLinkLabel: 'Tinjau impor produk',
  backToProductsLink: 'Kembali ke Produk & Stok',
  backHomeLink: 'Kembali ke beranda',
  workspaceLabel: 'ID Workspace',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Muat impor',
  loading: 'Memuat…',
  loadingBatches: 'Memuat batch…',
  uploadTitle: 'Batch impor baru',
  uploadSubtitle:
    'Tempel teks CSV atau pilih berkas .csv (dibaca di browser, dikirim sebagai teks). Konverter xlsx / foto / PDF mengirim baris jadi sebagai JSON.',
  filenameLabel: 'Nama berkas',
  filenamePlaceholder: 'produk.csv',
  csvLabel: 'Teks CSV',
  csvPlaceholder:
    'product_name,sku_tokoboss,variant_name,price,store_sku,channel,shop_id,platform_sku_id',
  csvHint:
    'Kolom wajib: product_name + price. sku_tokoboss opsional (server mengisi IMP-… bila kosong). Maks 500 baris.',
  fileLabel: 'Atau pilih berkas .csv',
  fileHint: 'Dibaca lokal di browser — hanya teks yang dikirim ke API.',
  rowsModeLabel: 'Kirim baris jadi (JSON) sebagai ganti CSV',
  rowsJsonLabel: 'JSON baris',
  rowsJsonPlaceholder: '[{"product_name": "Kaos Polos", "price": 99000}]',
  rowsJsonHint:
    'Array JSON berisi 1–500 objek baris dengan kosakata kolom yang sama. Server tidak pernah mem-parsing format biner.',
  uploadButton: 'Unggah untuk ditinjau',
  uploading: 'Mengunggah…',
  uploadedNotice:
    'Batch terunggah — periksa baris di bawah sebelum konfirmasi.',
  uploadDuplicateNotice:
    'Unggahan itu sudah pernah diterima — batch yang sudah ada dibuka agar tidak ganda.',
  batchesTitle: 'Batch',
  batchesEmpty: 'Belum ada batch impor. Unggah CSV pertama di atas.',
  batchOpen: 'Buka tinjauan',
  batchStatusLabel: 'Status',
  batchCountersHint: 'siap / total · dibuat · ditolak',
  rowTableTitle: 'Tinjau baris',
  rowNumberLabel: 'Baris',
  rowProductLabel: 'Produk',
  rowSkuLabel: 'SKU TokoBoss',
  rowVariantLabel: 'Varian',
  rowPriceLabel: 'Harga',
  rowStoreSkuLabel: 'SKU Toko (kandidat pemetaan)',
  rowStoreSkuHint:
    'Hanya petunjuk marketplace — disimpan sebagai pemetaan saat konfirmasi, bukan sebagai identitas TokoBoss.',
  rowStatusLabel: 'Status',
  rowErrorsLabel: 'Perlu perhatian',
  rowDuplicateLabel: 'Sudah ada',
  rowAppliedLabel: 'Terbuat',
  rowActionsLabel: 'Aksi',
  rowEditButton: 'Ubah',
  rowSaveButton: 'Simpan baris',
  rowSaving: 'Menyimpan…',
  rowCancelButton: 'Batal',
  rowRejectButton: 'Tolak',
  rowRejecting: 'Menolak…',
  rowRejectedNotice: 'Baris ditolak — akan dilewati saat konfirmasi.',
  rowSavedNotice: 'Baris tersimpan dan divalidasi ulang.',
  editNameLabel: 'Nama produk',
  editSkuLabel: 'SKU TokoBoss',
  editPriceLabel: 'Harga (IDR)',
  editNoteLabel: 'Catatan (opsional)',
  editNotePlaceholder: 'di luar cakupan…',
  confirmTitle: 'Konfirmasi sebelum dibuat',
  confirmSubtitle:
    'Konfirmasi membuat produk katalog + baris SKU TokoBoss. Baris yang ditolak dan tidak valid dilewati. Duplikat tidak pernah ditimpa.',
  confirmButton: 'Konfirmasi baris siap',
  confirming: 'Mengonfirmasi…',
  confirmedNotice:
    'Konfirmasi selesai — lihat yang dibuat, duplikat, dan dilewati di bawah.',
  confirmDuplicatesTitle: 'Duplikat (jujur — katalog yang ada dipertahankan)',
  confirmSkippedTitle: 'Dilewati',
  rejectBatchButton: 'Tolak batch',
  rejectingBatch: 'Menolak…',
  reopenBatchButton: 'Buka lagi batch',
  reopeningBatch: 'Membuka lagi…',
  batchRejectedNotice: 'Batch ditolak. Tidak ada yang dibuat.',
  batchReopenedNotice: 'Batch dibuka lagi untuk ditinjau.',
  batchConfirmPrompt:
    'Konfirmasi semua baris siap? Ini membuat produk katalog dan tidak bisa dibatalkan per baris — baris yang ditolak tetap dilewati.',
  batchRejectPrompt:
    'Tolak seluruh batch ini? Baris tetap bisa dibaca tetapi tidak bisa dikonfirmasi.',
  identityFreezeNote:
    'Teks SKU Toko hanya kandidat pemetaan. Identitas SKU TokoBoss adalah satu-satunya identitas katalog.',
  noLiveChannelNote:
    'Tanpa panggilan marketplace live — kandidat hanya dibaca dari batch ini.',
  readOnlyNote:
    'Anda bisa membaca batch dan baris. Unggah, ubah, dan konfirmasi butuh Manager atau Admin.',
  noAccessTitle: 'Tidak ada akses ke impor ini',
  noAccessBody:
    'Masuk sebagai anggota workspace ini, lalu muat lagi. Detail disembunyikan sampai akses dikonfirmasi.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  rowsJsonError: 'Baris harus berupa array JSON berisi 1–500 objek baris.',
  genericError: 'Terjadi kesalahan. Coba lagi.',
  forbiddenError: 'Anda tidak punya akses ke workspace ini.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
};

const COPIES: Record<ImportsLang, ImportsCopy> = { en, id };

export function getImportsCopy(lang: ImportsLang = 'en'): ImportsCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function importsCopyKeys(): Array<keyof ImportsCopy> {
  return Object.keys(en) as Array<keyof ImportsCopy>;
}
