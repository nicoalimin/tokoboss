/**
 * Web Bundles/BOM UI copy (UTA-80, Story 13 web).
 *
 * English + Indonesian strings for the bundle list + BOM editor screens.
 * Keys must stay in sync across locales (see
 * `web/src/__tests__/bundles-ui.test.ts`).
 *
 * Copy rules (UTA-79 API, no contract changes):
 * - Failures are generic where the API is: cross-workspace and Staff-write
 *   denials share one access message (no role oracle); strings never echo
 *   workspace ids, user ids, tokens, or session material.
 * - Cycle / self-reference / stock errors stay honest: the API's
 *   `BUNDLE_CYCLE` (self-ref + transitive) and `BUNDLE_NO_DIRECT_STOCK`
 *   get their own sentences; nothing is invented beyond the overview.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names.
 */

export type BundlesLang = 'en' | 'id';

export interface BundlesCopy {
  pageTitle: string;
  pageSubtitle: string;
  workspaceLabel: string;
  workspacePlaceholder: string;
  loadButton: string;
  loading: string;
  listTitle: string;
  emptyTitle: string;
  emptyBody: string;
  bundleLabel: string;
  componentsLabel: string;
  qtyLabel: string;
  availabilityLabel: string;
  availableSuffix: string;
  versionLabel: string;
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  noDetailHint: string;
  createTitle: string;
  createSubtitle: string;
  bundleVariantIdLabel: string;
  bundleVariantIdHint: string;
  componentVariantIdLabel: string;
  addLineButton: string;
  removeLineButton: string;
  expectedVersionLabel: string;
  expectedVersionHint: string;
  createButton: string;
  creating: string;
  createdNotice: string;
  editTitle: string;
  editSubtitle: string;
  saveButton: string;
  saving: string;
  savedNotice: string;
  archiveButton: string;
  archiving: string;
  archiveConfirm: string;
  archivedNotice: string;
  readOnlyNote: string;
  noAccessTitle: string;
  noAccessBody: string;
  validationError: string;
  versionConflictError: string;
  conflictError: string;
  cycleError: string;
  notFoundError: string;
  noDirectStockError: string;
  genericError: string;
  forbiddenError: string;
  expiredNotice: string;
  backToProductsLink: string;
  backHomeLink: string;
}

const en: BundlesCopy = {
  pageTitle: 'Bundles & BOM',
  pageSubtitle:
    'Bundle shells with component lines (SKU TokoBoss + qty). Availability is derived per warehouse.',
  workspaceLabel: 'Workspace ID',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Load bundles',
  loading: 'Loading bundles…',
  listTitle: 'Bundles',
  emptyTitle: 'No bundles yet',
  emptyBody:
    'Create the first BOM below — pick a bundle variant, add 1–100 component lines with quantities.',
  bundleLabel: 'Bundle SKU',
  componentsLabel: 'Components',
  qtyLabel: 'Qty / bundle',
  availabilityLabel: 'Availability (per warehouse)',
  availableSuffix: 'bundles',
  versionLabel: 'Version',
  openDetail: 'Open BOM',
  closeDetail: 'Close BOM',
  detailTitle: 'BOM detail',
  noDetailHint: 'Select a bundle above to see its lines and availability.',
  createTitle: 'New BOM',
  createSubtitle:
    'The bundle shell and every component must be active variants. Nothing is hard-deleted.',
  bundleVariantIdLabel: 'Bundle variant ID',
  bundleVariantIdHint:
    'Paste the variant ID from the Produk drawer (the SKU TokoBoss row).',
  componentVariantIdLabel: 'Component variant ID',
  addLineButton: 'Add component line',
  removeLineButton: 'Remove',
  expectedVersionLabel: 'Expected version',
  expectedVersionHint:
    'Must match the bundle variant version — the detail shows the current one.',
  createButton: 'Create BOM',
  creating: 'Creating…',
  createdNotice: 'BOM created.',
  editTitle: 'Edit BOM lines',
  editSubtitle:
    'Replaces every line at once. Stale versions are rejected — reload the detail first.',
  saveButton: 'Save BOM',
  saving: 'Saving…',
  savedNotice: 'BOM saved.',
  archiveButton: 'Archive BOM',
  archiving: 'Archiving…',
  archiveConfirm:
    'Archive this BOM? Lines are cleared; the variant itself stays. History stays readable.',
  archivedNotice: 'BOM archived. Lines cleared.',
  readOnlyNote:
    'You can read bundles and availability. BOM edits need Manager or Admin.',
  noAccessTitle: 'No access to these bundles',
  noAccessBody:
    'Sign in as a member of this workspace, then load again. Details stay hidden until access is confirmed.',
  validationError: 'Check the highlighted fields and try again.',
  versionConflictError:
    'Someone else changed this bundle first. Reload the detail, then try again.',
  conflictError:
    'This bundle already has a BOM. Open it and edit the lines instead.',
  cycleError:
    'That BOM would create a cycle: a bundle cannot contain itself, directly or through another bundle.',
  notFoundError: 'That bundle BOM is gone. Reload the list and try again.',
  noDirectStockError:
    'Bundle shells hold no direct stock — adjust the component SKUs instead.',
  genericError: 'Something went wrong. Try again.',
  forbiddenError: 'You do not have access to this workspace.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
  backToProductsLink: 'Back to Produk & Stok',
  backHomeLink: 'Back to home',
};

const id: BundlesCopy = {
  pageTitle: 'Bundel & BOM',
  pageSubtitle:
    'Varian bundel dengan lini komponen (SKU TokoBoss + qty). Ketersediaan dihitung per gudang.',
  workspaceLabel: 'ID Workspace',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Muat bundel',
  loading: 'Memuat bundel…',
  listTitle: 'Bundel',
  emptyTitle: 'Belum ada bundel',
  emptyBody:
    'Buat BOM pertama di bawah — pilih varian bundel, tambah 1–100 lini komponen beserta qty.',
  bundleLabel: 'SKU Bundel',
  componentsLabel: 'Komponen',
  qtyLabel: 'Qty / bundel',
  availabilityLabel: 'Ketersediaan (per gudang)',
  availableSuffix: 'bundel',
  versionLabel: 'Versi',
  openDetail: 'Buka BOM',
  closeDetail: 'Tutup BOM',
  detailTitle: 'Detail BOM',
  noDetailHint: 'Pilih bundel di atas untuk melihat lini dan ketersediaan.',
  createTitle: 'BOM baru',
  createSubtitle:
    'Varian bundel dan setiap komponen harus aktif. Tidak ada yang dihapus permanen.',
  bundleVariantIdLabel: 'ID varian bundel',
  bundleVariantIdHint:
    'Tempel ID varian dari drawer Produk (baris SKU TokoBoss).',
  componentVariantIdLabel: 'ID varian komponen',
  addLineButton: 'Tambah lini komponen',
  removeLineButton: 'Hapus',
  expectedVersionLabel: 'Versi yang diharapkan',
  expectedVersionHint:
    'Harus sama dengan versi varian bundel — detail menunjukkan yang terbaru.',
  createButton: 'Buat BOM',
  creating: 'Membuat…',
  createdNotice: 'BOM dibuat.',
  editTitle: 'Ubah lini BOM',
  editSubtitle:
    'Mengganti semua lini sekaligus. Versi basi ditolak — muat ulang detail dulu.',
  saveButton: 'Simpan BOM',
  saving: 'Menyimpan…',
  savedNotice: 'BOM tersimpan.',
  archiveButton: 'Arsipkan BOM',
  archiving: 'Mengarsipkan…',
  archiveConfirm:
    'Arsipkan BOM ini? Lini dihapus; variannya tetap ada. Riwayat tetap bisa dibaca.',
  archivedNotice: 'BOM diarsipkan. Lini dihapus.',
  readOnlyNote:
    'Anda bisa membaca bundel dan ketersediaan. Ubah BOM butuh Manager atau Admin.',
  noAccessTitle: 'Tidak ada akses ke bundel ini',
  noAccessBody:
    'Masuk sebagai anggota workspace ini, lalu muat lagi. Detail disembunyikan sampai akses dikonfirmasi.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  versionConflictError:
    'Orang lain mengubah bundel ini lebih dulu. Muat ulang detail, lalu coba lagi.',
  conflictError:
    'Bundel ini sudah punya BOM. Buka lalu ubah lininya saja.',
  cycleError:
    'BOM itu akan membuat siklus: bundel tidak boleh memuat dirinya sendiri, langsung maupun lewat bundel lain.',
  notFoundError: 'BOM bundel itu sudah hilang. Muat ulang daftar lalu coba lagi.',
  noDirectStockError:
    'Varian bundel tidak menyimpan stok langsung — sesuaikan SKU komponennya.',
  genericError: 'Terjadi kesalahan. Coba lagi.',
  forbiddenError: 'Anda tidak punya akses ke workspace ini.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
  backToProductsLink: 'Kembali ke Produk & Stok',
  backHomeLink: 'Kembali ke beranda',
};

const COPIES: Record<BundlesLang, BundlesCopy> = { en, id };

export function getBundlesCopy(lang: BundlesLang = 'en'): BundlesCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function bundlesCopyKeys(): Array<keyof BundlesCopy> {
  return Object.keys(en) as Array<keyof BundlesCopy>;
}
