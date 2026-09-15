'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ProfileClientError,
  changePassword,
  getProfile,
  updateProfile,
  type ProfileView,
} from '@/lib/profile-client';
import { getProfileCopy } from '@/lib/profile-copy';
import { AuthAlert } from '../auth/AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

function initialOf(profile: ProfileView): string {
  const name = (profile.displayName ?? '').trim();
  if (name) return name.slice(0, 1).toUpperCase();
  const email = (profile.email ?? '').trim();
  if (email) return email.slice(0, 1).toUpperCase();
  return '•';
}

/**
 * Personal-profile panel (UTA-73, Story 25).
 *
 * Profile read/update + change password over the UTA-72 APIs (cookie
 * session, `credentials: "same-origin"` — no tokens in JS or logs).
 * Sessions render below via the shared `SessionsPanel` on the page, so this
 * component stays focused on profile + password.
 *
 * Edge safeguards: 401 `INVALID_SESSION` redirects to
 * `/sign-in?expired=1`; password change revokes ALL sessions and clears the
 * cookie, so success also redirects to re-auth with a notice.
 */
export function ProfilePanel() {
  const copy = getProfileCopy('en');
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const load = useCallback(async () => {
    try {
      const me = await getProfile();
      setProfile(me);
      setDisplayName(me.displayName ?? '');
      setAvatarId(me.avatarUploadId ?? '');
    } catch (err) {
      if (err instanceof ProfileClientError && err.needsReauth) {
        reauth();
        return;
      }
      setError(
        err instanceof ProfileClientError ? err.message : copy.genericError
      );
    }
  }, [copy.genericError, reauth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    const name = displayName.trim();
    const avatar = avatarId.trim();
    if (!name && !avatar) {
      setFormError(copy.validationError);
      return;
    }
    if (name && name.length > 80) {
      setFormError(copy.validationError);
      return;
    }
    setSaving(true);
    try {
      // Clearing the avatar field removes the reference (null) when one is
      // set; a blank display name is omitted (blank names are invalid).
      const updated = await updateProfile({
        ...(name ? { displayName: name } : {}),
        ...(avatar
          ? { avatarUploadId: avatar }
          : profile?.avatarUploadId
            ? { avatarUploadId: null }
            : {}),
      });
      setProfile(updated);
      setDisplayName(updated.displayName ?? '');
      setAvatarId(updated.avatarUploadId ?? '');
      setNotice(copy.profileUpdated);
    } catch (err) {
      if (err instanceof ProfileClientError && err.needsReauth) {
        reauth();
        return;
      }
      setFormError(
        err instanceof ProfileClientError ? err.message : copy.genericError
      );
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwNotice(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError(copy.validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(copy.mismatchError);
      return;
    }
    if (newPassword.length < 8) {
      setPwError(copy.validationError);
      return;
    }
    setChanging(true);
    try {
      await changePassword({ currentPassword, newPassword });
      // Secrets leave memory immediately; the API revoked every session and
      // cleared the cookie, so force re-auth with a notice.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwNotice(`${copy.passwordDone} ${copy.passwordReauthNote}`);
      router.replace('/sign-in?expired=1');
      router.refresh();
    } catch (err) {
      if (err instanceof ProfileClientError && err.needsReauth) {
        reauth();
        return;
      }
      setPwError(
        err instanceof ProfileClientError ? err.message : copy.genericError
      );
    } finally {
      setChanging(false);
    }
  }

  return (
    <div data-testid="profile-panel">
      {error ? <AuthAlert testId="profile-error">{error}</AuthAlert> : null}
      {notice ? (
        <AuthAlert tone="success" testId="profile-notice">
          {notice}
        </AuthAlert>
      ) : null}

      {profile === null && !error ? (
        <p role="status" className="text-sm text-neutral-600">
          {copy.profileLoading}
        </p>
      ) : null}

      {profile !== null ? (
        <section
          aria-labelledby="profil-heading"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div
              aria-hidden
              data-testid="profile-avatar"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-800"
            >
              {initialOf(profile)}
            </div>
            <div className="min-w-0">
              <h2
                id="profil-heading"
                data-testid="profile-name"
                className="truncate text-lg font-semibold text-neutral-900"
              >
                {profile.displayName || profile.email}
              </h2>
              <p
                data-testid="profile-email"
                className="truncate text-sm text-neutral-600"
              >
                {profile.email}
              </p>
            </div>
          </div>

          <form
            onSubmit={onSaveProfile}
            noValidate
            data-testid="profile-form"
            className="mt-5 space-y-4"
          >
            {formError ? (
              <AuthAlert testId="profile-form-error">{formError}</AuthAlert>
            ) : null}
            <div>
              <label
                htmlFor="profile-display-name"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.displayNameLabel}
              </label>
              <input
                id="profile-display-name"
                name="displayName"
                type="text"
                autoComplete="nickname"
                maxLength={80}
                placeholder={copy.displayNamePlaceholder}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-invalid={formError ? true : undefined}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="profile-avatar-id"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.avatarLabel}
              </label>
              <input
                id="profile-avatar-id"
                name="avatarUploadId"
                type="text"
                autoComplete="off"
                placeholder={copy.avatarPlaceholder}
                value={avatarId}
                onChange={(e) => setAvatarId(e.target.value)}
                aria-describedby="profile-avatar-hint"
                aria-invalid={formError ? true : undefined}
                className={inputClass}
              />
              <p
                id="profile-avatar-hint"
                className="mt-1 text-xs text-neutral-500"
              >
                {copy.avatarHint}
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
            >
              {saving ? copy.saving : copy.saveButton}
            </button>
          </form>
        </section>
      ) : null}

      <section
        aria-labelledby="password-heading"
        className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="password-heading"
          className="text-lg font-semibold text-neutral-900"
        >
          {copy.passwordTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{copy.passwordSubtitle}</p>
        <form
          onSubmit={onChangePassword}
          noValidate
          data-testid="password-form"
          className="mt-4 space-y-4"
        >
          {pwError ? (
            <AuthAlert testId="password-error">{pwError}</AuthAlert>
          ) : null}
          {pwNotice ? (
            <AuthAlert tone="success" testId="password-notice">
              {pwNotice}
            </AuthAlert>
          ) : null}
          <div>
            <label
              htmlFor="password-current"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              {copy.currentPasswordLabel}
            </label>
            <input
              id="password-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-invalid={pwError ? true : undefined}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="password-new"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.newPasswordLabel}
              </label>
              <input
                id="password-new"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-describedby="password-new-hint"
                aria-invalid={pwError ? true : undefined}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="password-confirm"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.confirmPasswordLabel}
              </label>
              <input
                id="password-confirm"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={pwError ? true : undefined}
                className={inputClass}
              />
            </div>
          </div>
          <p id="password-new-hint" className="text-xs text-neutral-500">
            {copy.newPasswordHint}
          </p>
          <button
            type="submit"
            disabled={changing}
            className="rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
          >
            {changing ? copy.changing : copy.changeButton}
          </button>
        </form>
      </section>
    </div>
  );
}
