/**
 * Web Produk & Stok UI copy (UTA-76, Story 01 web).
 *
 * English + Indonesian strings for the product list + SKU drawer screens.
 * Keys must stay in sync across locales (see
 * `web/src/__tests__/produk-ui.test.ts`).
 *
 * Copy rules (UTA-75 API + UTA-17 RBAC freeze):
 * - Failures are generic where the API is: cross-workspace and Staff-write
 *   denials share one access message (no role oracle); strings never echo
 *   workspace ids, user ids, tokens, or session material.
 * - Duplicate-SKU copy points at the existing row without echoing raw ids.
 * - Adjustment copy always names warehouse + reason as required.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names.
 */

export type CatalogLang = 'en' | 'id';

export interface CatalogCopy {
  pageTitle: string;
  pageSubtitle: string;
  navProducts: string;
  workspaceLabel: string;
  workspacePlaceholder: string;
  loadButton: string;
  loading: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchHint: string;
  searching: string;
  emptyTitle: string;
  emptyBody: string;
  listTitle: string;
  skuLabel: string;
  stockLabel: string;
  priceLabel: string;
  statusLabel: string;
  statusActive: string;
  statusArchived: string;
  openDetail: string;
  createTitle: string;
  createSubtitle: string;
  productNameLabel: string;
  productNamePlaceholder: string;
  unitLabel: string;
  variantSkuLabel: string;
  variantSkuPlaceholder: string;
  variantNameLabel: string;
  variantNamePlaceholder: string;
  priceInputLabel: string;
  priceInputHint: string;
  createButton: string;
  creating: string;
  createdNotice: string;
  duplicateError: string;
  archiveButton: string;
  archiveConfirm: string;
  archiving: string;
  archivedNotice: string;
  drawerTitle: string;
  drawerClose: string;
  variantPickerLabel: string;
  editTitle: string;
  nameLabel: string;
  barcodeLabel: string;
  barcodePlaceholder: string;
  hppLabel: string;
  hppHint: string;
  costSourceLabel: string;
  costSourcePlaceholder: string;
  listingNameLabel: string;
  listingNamePlaceholder: string;
  picturesLabel: string;
  picturesHint: string;
  picturesPlaceholder: string;
  saveButton: string;
  saving: string;
  savedNotice: string;
  skuLockedNote: string;
  skuAdminOnlyNote: string;
  mappingsTitle: string;
  mappingsSubtitle: string;
  mappingsEmpty: string;
  mappingChannelLabel: string;
  mappingShopLabel: string;
  mappingPlatformLabel: string;
  stockTitle: string;
  stockSubtitle: string;
  warehouseLabel: string;
  deltaLabel: string;
  deltaHint: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  adjustButton: string;
  adjusting: string;
  adjustedNotice: string;
  reasonRequiredError: string;
  ledgerTitle: string;
  ledgerEmpty: string;
  readOnlyNote: string;
  noAccessTitle: string;
  noAccessBody: string;
  validationError: string;
  versionConflictError: string;
  lockError: string;
  genericError: string;
  forbiddenError: string;
  expiredNotice: string;
  backHomeLink: string;
}

const en: CatalogCopy = {
  pageTitle: 'Produk & Stok',
  pageSubtitle:
    'TokoBoss SKUs with per-warehouse stock. The list stays open while the SKU drawer is on the right.',
  navProducts: 'Produk & Stok',
  workspaceLabel: 'Workspace ID',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Load products',
  loading: 'Loading products…',
  searchLabel: 'Search products',
  searchPlaceholder: 'Name, SKU TokoBoss, barcode, Store SKU…',
  searchHint:
    'One query across name, SKU TokoBoss, barcode, Store SKU hint, and listing name.',
  searching: 'Searching…',
  emptyTitle: 'No products yet',
  emptyBody:
    'Create the first product below — every product needs at least one variant with a SKU TokoBoss.',
  listTitle: 'Products',
  skuLabel: 'SKU TokoBoss',
  stockLabel: 'Stock',
  priceLabel: 'Price',
  statusLabel: 'Status',
  statusActive: 'Active',
  statusArchived: 'Archived',
  openDetail: 'Open SKU drawer',
  createTitle: 'New product',
  createSubtitle: 'Product with at least one variant. Nothing is deleted.',
  productNameLabel: 'Product name',
  productNamePlaceholder: 'Kaos Polos',
  unitLabel: 'Unit',
  variantSkuLabel: 'SKU TokoBoss (variant 1)',
  variantSkuPlaceholder: 'KAOS-MERAH-M',
  variantNameLabel: 'Variant name (optional)',
  variantNamePlaceholder: 'Merah / M',
  priceInputLabel: 'Selling price (IDR)',
  priceInputHint: 'Whole rupiah, e.g. 99000. HPP stays editable in the drawer.',
  createButton: 'Create product',
  creating: 'Creating…',
  createdNotice: 'Product created.',
  duplicateError:
    'That SKU TokoBoss already exists. Open the existing product shown below — nothing was created twice.',
  archiveButton: 'Archive',
  archiveConfirm:
    'Archive this product and all its variants? Stock history stays.',
  archiving: 'Archiving…',
  archivedNotice: 'Product archived. History stays readable.',
  drawerTitle: 'SKU drawer',
  drawerClose: 'Close drawer',
  variantPickerLabel: 'Variant',
  editTitle: 'SKU TokoBoss details',
  nameLabel: 'Variant name',
  barcodeLabel: 'Barcode (optional)',
  barcodePlaceholder: '899…',
  hppLabel: 'HPP / cost (IDR, optional)',
  hppHint: 'Whole rupiah. Leave empty when unknown.',
  costSourceLabel: 'Cost source label',
  costSourcePlaceholder: 'manual, invoice INV-…, average',
  listingNameLabel: 'Listing name (optional)',
  listingNamePlaceholder: 'Kaos Polos Merah M',
  picturesLabel: 'Pictures (product level)',
  picturesHint: 'Completed upload IDs, comma-separated. Never bytes or URLs.',
  picturesPlaceholder: 'upl_…, upl_…',
  saveButton: 'Save changes',
  saving: 'Saving…',
  savedNotice: 'Saved.',
  skuLockedNote:
    'SKU code is locked: this variant already has stock movements or Store mappings.',
  skuAdminOnlyNote: 'Only Admins can edit the SKU code, before any movement.',
  mappingsTitle: 'Mapped Store SKUs',
  mappingsSubtitle: 'Read from the mappings API. No live channel calls.',
  mappingsEmpty: 'No Store SKUs mapped to this variant yet.',
  mappingChannelLabel: 'Channel',
  mappingShopLabel: 'Shop',
  mappingPlatformLabel: 'Platform SKU',
  stockTitle: 'Warehouse stock',
  stockSubtitle: 'Per-warehouse quantities from the variant detail.',
  warehouseLabel: 'Warehouse',
  deltaLabel: 'Change (+ in / − out)',
  deltaHint: 'Non-zero whole units, e.g. 10 or -2.',
  reasonLabel: 'Reason (required)',
  reasonPlaceholder: 'initial stock, sale correction, damaged…',
  adjustButton: 'Save adjustment',
  adjusting: 'Saving…',
  adjustedNotice: 'Adjustment saved to the ledger.',
  reasonRequiredError:
    'A reason is required — pick a warehouse and explain why.',
  ledgerTitle: 'Stock ledger',
  ledgerEmpty: 'No ledger entries for this variant yet.',
  readOnlyNote:
    'You can read products and adjust stock. Product edits need Manager or Admin.',
  noAccessTitle: 'No access to these products',
  noAccessBody:
    'Sign in as a member of this workspace, then load again. Details stay hidden until access is confirmed.',
  validationError: 'Check the highlighted fields and try again.',
  versionConflictError:
    'Someone else changed this row first. Close and reopen the drawer, then try again.',
  lockError:
    'That change is locked by earlier stock or mappings. The drawer shows what can still be edited.',
  genericError: 'Something went wrong. Try again.',
  forbiddenError: 'You do not have access to this workspace.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
  backHomeLink: 'Back to home',
};

const id: CatalogCopy = {
  pageTitle: 'Produk & Stok',
  pageSubtitle:
    'SKU TokoBoss dengan stok per gudang. Daftar tetap terbuka saat drawer SKU tampil di kanan.',
  navProducts: 'Produk & Stok',
  workspaceLabel: 'ID Workspace',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Muat produk',
  loading: 'Memuat produk…',
  searchLabel: 'Cari produk',
  searchPlaceholder: 'Nama, SKU TokoBoss, barcode, SKU Toko…',
  searchHint:
    'Satu kueri untuk nama, SKU TokoBoss, barcode, petunjuk SKU Toko, dan nama listing.',
  searching: 'Mencari…',
  emptyTitle: 'Belum ada produk',
  emptyBody:
    'Buat produk pertama di bawah — setiap produk butuh minimal satu varian dengan SKU TokoBoss.',
  listTitle: 'Produk',
  skuLabel: 'SKU TokoBoss',
  stockLabel: 'Stok',
  priceLabel: 'Harga',
  statusLabel: 'Status',
  statusActive: 'Aktif',
  statusArchived: 'Diarsipkan',
  openDetail: 'Buka drawer SKU',
  createTitle: 'Produk baru',
  createSubtitle: 'Produk dengan minimal satu varian. Tidak ada yang dihapus.',
  productNameLabel: 'Nama produk',
  productNamePlaceholder: 'Kaos Polos',
  unitLabel: 'Satuan',
  variantSkuLabel: 'SKU TokoBoss (varian 1)',
  variantSkuPlaceholder: 'KAOS-MERAH-M',
  variantNameLabel: 'Nama varian (opsional)',
  variantNamePlaceholder: 'Merah / M',
  priceInputLabel: 'Harga jual (IDR)',
  priceInputHint: 'Rupiah utuh, mis. 99000. HPP tetap bisa diubah di drawer.',
  createButton: 'Buat produk',
  creating: 'Membuat…',
  createdNotice: 'Produk dibuat.',
  duplicateError:
    'SKU TokoBoss itu sudah ada. Buka produk yang sudah ada di bawah — tidak ada yang dibuat ganda.',
  archiveButton: 'Arsipkan',
  archiveConfirm:
    'Arsipkan produk ini beserta semua variannya? Riwayat stok tetap ada.',
  archiving: 'Mengarsipkan…',
  archivedNotice: 'Produk diarsipkan. Riwayat tetap bisa dibaca.',
  drawerTitle: 'Drawer SKU',
  drawerClose: 'Tutup drawer',
  variantPickerLabel: 'Varian',
  editTitle: 'Detail SKU TokoBoss',
  nameLabel: 'Nama varian',
  barcodeLabel: 'Barcode (opsional)',
  barcodePlaceholder: '899…',
  hppLabel: 'HPP / biaya (IDR, opsional)',
  hppHint: 'Rupiah utuh. Kosongkan bila belum tahu.',
  costSourceLabel: 'Label sumber biaya',
  costSourcePlaceholder: 'manual, invoice INV-…, rata-rata',
  listingNameLabel: 'Nama listing (opsional)',
  listingNamePlaceholder: 'Kaos Polos Merah M',
  picturesLabel: 'Gambar (level produk)',
  picturesHint:
    'ID unggahan yang sudah selesai, pisahkan koma. Bukan bita atau URL.',
  picturesPlaceholder: 'upl_…, upl_…',
  saveButton: 'Simpan perubahan',
  saving: 'Menyimpan…',
  savedNotice: 'Tersimpan.',
  skuLockedNote:
    'Kode SKU terkunci: varian ini sudah punya pergerakan stok atau pemetaan Toko.',
  skuAdminOnlyNote:
    'Hanya Admin yang bisa mengubah kode SKU, sebelum ada pergerakan.',
  mappingsTitle: 'SKU Toko yang dipetakan',
  mappingsSubtitle: 'Dibaca dari API pemetaan. Tanpa panggilan channel live.',
  mappingsEmpty: 'Belum ada SKU Toko yang dipetakan ke varian ini.',
  mappingChannelLabel: 'Channel',
  mappingShopLabel: 'Toko',
  mappingPlatformLabel: 'SKU platform',
  stockTitle: 'Stok gudang',
  stockSubtitle: 'Jumlah per gudang dari detail varian.',
  warehouseLabel: 'Gudang',
  deltaLabel: 'Perubahan (+ masuk / − keluar)',
  deltaHint: 'Satuan utuh bukan nol, mis. 10 atau -2.',
  reasonLabel: 'Alasan (wajib)',
  reasonPlaceholder: 'stok awal, koreksi jual, rusak…',
  adjustButton: 'Simpan penyesuaian',
  adjusting: 'Menyimpan…',
  adjustedNotice: 'Penyesuaian tersimpan ke ledger.',
  reasonRequiredError:
    'Alasan wajib diisi — pilih gudang dan jelaskan alasannya.',
  ledgerTitle: 'Ledger stok',
  ledgerEmpty: 'Belum ada entri ledger untuk varian ini.',
  readOnlyNote:
    'Anda bisa membaca produk dan menyesuaikan stok. Ubah produk butuh Manager atau Admin.',
  noAccessTitle: 'Tidak ada akses ke produk ini',
  noAccessBody:
    'Masuk sebagai anggota workspace ini, lalu muat lagi. Detail disembunyikan sampai akses dikonfirmasi.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  versionConflictError:
    'Orang lain mengubah baris ini lebih dulu. Tutup dan buka lagi drawer-nya, lalu coba lagi.',
  lockError:
    'Perubahan itu terkunci oleh stok atau pemetaan sebelumnya. Drawer menunjukkan yang masih bisa diubah.',
  genericError: 'Terjadi kesalahan. Coba lagi.',
  forbiddenError: 'Anda tidak punya akses ke workspace ini.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
  backHomeLink: 'Kembali ke beranda',
};

const COPIES: Record<CatalogLang, CatalogCopy> = { en, id };

export function getCatalogCopy(lang: CatalogLang = 'en'): CatalogCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function catalogCopyKeys(): Array<keyof CatalogCopy> {
  return Object.keys(en) as Array<keyof CatalogCopy>;
}
