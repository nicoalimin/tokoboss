/**
 * Web Tim & Akses UI copy (UTA-71, Story 19).
 *
 * English + Indonesian strings for the team-management screens. Keys must
 * stay in sync across locales (see `web/src/__tests__/team-ui.test.ts`).
 *
 * Copy rules (UTA-17 freeze + UTA-70 API):
 * - Idle-only sessions: re-auth wording describes the session ending, never
 *   an absolute "valid for N minutes" message.
 * - Failures are generic where the API is: unknown/consumed invite tickets
 *   share one message (no enumeration oracle); sign-in-style user
 *   enumeration never leaks through these strings.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names.
 */

export type TeamLang = 'en' | 'id';

export interface TeamCopy {
  teamTitle: string;
  teamSubtitle: string;
  workspaceLabel: string;
  workspaceHint: string;
  workspacePlaceholder: string;
  loadButton: string;
  loading: string;
  inviteTitle: string;
  inviteSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  roleLabel: string;
  roleAdmin: string;
  roleManager: string;
  roleStaff: string;
  scopeLabel: string;
  scopeHint: string;
  scopePlaceholder: string;
  adminScopeNote: string;
  inviteButton: string;
  inviting: string;
  inviteCreated: string;
  inviteTokenLabel: string;
  inviteTokenHint: string;
  copyTokenButton: string;
  tokenCopied: string;
  membersTitle: string;
  membersSubtitle: string;
  membersEmpty: string;
  invitesTitle: string;
  invitesSubtitle: string;
  invitesEmpty: string;
  statusActive: string;
  statusDeactivated: string;
  statusPending: string;
  statusAccepted: string;
  statusRevoked: string;
  statusExpired: string;
  updateButton: string;
  updating: string;
  deactivateButton: string;
  deactivating: string;
  confirmDeactivate: string;
  cancelButton: string;
  revokeButton: string;
  revoking: string;
  lastAdminWarning: string;
  updatedNotice: string;
  deactivatedNotice: string;
  revokedNotice: string;
  genericError: string;
  validationError: string;
  forbiddenError: string;
  lastAdminError: string;
  inviteConflictError: string;
  inviteInvalidError: string;
  inviteExpiredError: string;
  expiredNotice: string;
  acceptTitle: string;
  acceptSubtitle: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  newPasswordLabel: string;
  newPasswordHint: string;
  acceptButton: string;
  accepting: string;
  acceptDone: string;
  backToTeamLink: string;
}

const en: TeamCopy = {
  teamTitle: 'Team & Access',
  teamSubtitle:
    'Invite teammates, set roles and warehouse scope, and deactivate members.',
  workspaceLabel: 'Workspace ID',
  workspaceHint: 'Ask your admin for the workspace ID. It is case-sensitive.',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Load team',
  loading: 'Loading team…',
  inviteTitle: 'Invite a teammate',
  inviteSubtitle:
    'They receive a single-use ticket. Admins are never warehouse-scoped.',
  emailLabel: 'Email',
  emailPlaceholder: 'clerk@toko.id',
  roleLabel: 'Role',
  roleAdmin: 'Admin — full access',
  roleManager: 'Manager — scoped warehouse',
  roleStaff: 'Staff — scoped warehouse',
  scopeLabel: 'Warehouse scope (optional)',
  scopeHint: 'Leave empty for all-warehouse access. Admins stay unscoped.',
  scopePlaceholder: 'wh_jkt_1',
  adminScopeNote: 'Admins always cover every warehouse — scope stays empty.',
  inviteButton: 'Send invite',
  inviting: 'Sending…',
  inviteCreated: 'Invite created. Share the ticket below — it shows once.',
  inviteTokenLabel: 'Invite ticket (shows once)',
  inviteTokenHint:
    'Send it to the teammate out of band. It is never shown again.',
  copyTokenButton: 'Copy ticket',
  tokenCopied: 'Copied.',
  membersTitle: 'Members',
  membersSubtitle: 'Role and warehouse scope changes apply immediately.',
  membersEmpty: 'No members yet.',
  invitesTitle: 'Pending invites',
  invitesSubtitle: 'Revoke a ticket to block it before it is accepted.',
  invitesEmpty: 'No pending invites.',
  statusActive: 'Active',
  statusDeactivated: 'Deactivated',
  statusPending: 'Pending',
  statusAccepted: 'Accepted',
  statusRevoked: 'Revoked',
  statusExpired: 'Expired',
  updateButton: 'Save',
  updating: 'Saving…',
  deactivateButton: 'Deactivate',
  deactivating: 'Deactivating…',
  confirmDeactivate:
    'Deactivate this member now? Their sessions end immediately.',
  cancelButton: 'Cancel',
  revokeButton: 'Revoke',
  revoking: 'Revoking…',
  lastAdminWarning:
    'This workspace has one active Admin. That Admin cannot be demoted or deactivated.',
  updatedNotice: 'Member updated.',
  deactivatedNotice: 'Member deactivated. Their sessions ended.',
  revokedNotice: 'Invite revoked.',
  genericError: 'Something went wrong. Try again.',
  validationError: 'Check the highlighted fields and try again.',
  forbiddenError: 'You do not have access to this workspace.',
  lastAdminError: 'Cannot remove or deactivate the last active Admin.',
  inviteConflictError:
    'There is already a pending invite or an active member for this email.',
  inviteInvalidError: 'This invite ticket is invalid.',
  inviteExpiredError: 'This invite ticket has expired.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
  acceptTitle: 'Accept your invite',
  acceptSubtitle:
    'Paste the ticket your admin shared, then choose a password if this is your first sign-in.',
  tokenLabel: 'Invite ticket',
  tokenPlaceholder: 'Paste the ticket…',
  newPasswordLabel: 'New password (optional)',
  newPasswordHint: 'Minimum 8 characters. Skip when you already sign in.',
  acceptButton: 'Accept invite',
  accepting: 'Accepting…',
  acceptDone: 'Invite accepted. You can now sign in.',
  backToTeamLink: 'Back to Team & Access',
};

const id: TeamCopy = {
  teamTitle: 'Tim & Akses',
  teamSubtitle:
    'Undang rekan tim, atur peran dan cakupan gudang, serta nonaktifkan anggota.',
  workspaceLabel: 'ID Workspace',
  workspaceHint: 'Minta ID workspace ke admin. Huruf besar/kecil berpengaruh.',
  workspacePlaceholder: 'ws_…',
  loadButton: 'Muat tim',
  loading: 'Memuat tim…',
  inviteTitle: 'Undang rekan tim',
  inviteSubtitle:
    'Mereka menerima tiket sekali pakai. Admin tidak pernah dibatasi gudang.',
  emailLabel: 'Email',
  emailPlaceholder: 'kasir@toko.id',
  roleLabel: 'Peran',
  roleAdmin: 'Admin — akses penuh',
  roleManager: 'Manajer — cakupan gudang',
  roleStaff: 'Staf — cakupan gudang',
  scopeLabel: 'Cakupan gudang (opsional)',
  scopeHint: 'Kosongkan untuk semua gudang. Admin tetap tanpa cakupan.',
  scopePlaceholder: 'wh_jkt_1',
  adminScopeNote: 'Admin selalu mencakup semua gudang — cakupan tetap kosong.',
  inviteButton: 'Kirim undangan',
  inviting: 'Mengirim…',
  inviteCreated:
    'Undangan dibuat. Bagikan tiket di bawah — hanya tampil sekali.',
  inviteTokenLabel: 'Tiket undangan (tampil sekali)',
  inviteTokenHint:
    'Kirim ke rekan tim lewat jalur lain. Tiket tidak ditampilkan lagi.',
  copyTokenButton: 'Salin tiket',
  tokenCopied: 'Tersalin.',
  membersTitle: 'Anggota',
  membersSubtitle: 'Perubahan peran dan cakupan gudang berlaku segera.',
  membersEmpty: 'Belum ada anggota.',
  invitesTitle: 'Undangan tertunda',
  invitesSubtitle: 'Cabut tiket untuk memblokirnya sebelum diterima.',
  invitesEmpty: 'Tidak ada undangan tertunda.',
  statusActive: 'Aktif',
  statusDeactivated: 'Dinonaktifkan',
  statusPending: 'Tertunda',
  statusAccepted: 'Diterima',
  statusRevoked: 'Dicabut',
  statusExpired: 'Kedaluwarsa',
  updateButton: 'Simpan',
  updating: 'Menyimpan…',
  deactivateButton: 'Nonaktifkan',
  deactivating: 'Menonaktifkan…',
  confirmDeactivate:
    'Nonaktifkan anggota ini sekarang? Sesi mereka langsung berakhir.',
  cancelButton: 'Batal',
  revokeButton: 'Cabut',
  revoking: 'Mencabut…',
  lastAdminWarning:
    'Workspace ini hanya punya satu Admin aktif. Admin tersebut tidak bisa diturunkan atau dinonaktifkan.',
  updatedNotice: 'Anggota diperbarui.',
  deactivatedNotice: 'Anggota dinonaktifkan. Sesi mereka berakhir.',
  revokedNotice: 'Undangan dicabut.',
  genericError: 'Terjadi kesalahan. Coba lagi.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  forbiddenError: 'Anda tidak punya akses ke workspace ini.',
  lastAdminError: 'Admin aktif terakhir tidak bisa dihapus atau dinonaktifkan.',
  inviteConflictError:
    'Sudah ada undangan tertunda atau anggota aktif untuk email ini.',
  inviteInvalidError: 'Tiket undangan ini tidak valid.',
  inviteExpiredError: 'Tiket undangan ini sudah kedaluwarsa.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
  acceptTitle: 'Terima undangan Anda',
  acceptSubtitle:
    'Tempel tiket dari admin, lalu pilih kata sandi jika ini pertama kali Anda masuk.',
  tokenLabel: 'Tiket undangan',
  tokenPlaceholder: 'Tempel tiket…',
  newPasswordLabel: 'Kata sandi baru (opsional)',
  newPasswordHint: 'Minimal 8 karakter. Lewati jika Anda sudah bisa masuk.',
  acceptButton: 'Terima undangan',
  accepting: 'Memproses…',
  acceptDone: 'Undangan diterima. Anda sekarang bisa masuk.',
  backToTeamLink: 'Kembali ke Tim & Akses',
};

const COPIES: Record<TeamLang, TeamCopy> = { en, id };

export function getTeamCopy(lang: TeamLang = 'en'): TeamCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function teamCopyKeys(): Array<keyof TeamCopy> {
  return Object.keys(en) as Array<keyof TeamCopy>;
}
