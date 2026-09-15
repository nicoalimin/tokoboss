'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TeamClientError,
  createInvite,
  deactivateMember,
  listInvites,
  listMembers,
  normalizeScope,
  revokeInvite,
  updateMember,
  validateScopeForRole,
  type InviteView,
  type MemberView,
  type WorkspaceRole,
} from '@/lib/team-client';
import { getTeamCopy } from '@/lib/team-copy';
import { AuthAlert } from '../auth/AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

const smallInputClass =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]';

const WORKSPACE_KEY = 'tb_workspace_id';

function loadStoredWorkspace(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(WORKSPACE_KEY) ?? '';
  } catch {
    return '';
  }
}

function roleBadge(role: WorkspaceRole): string {
  if (role === 'admin') return 'bg-primary-100 text-primary-800';
  if (role === 'manager') return 'bg-info-100 text-info-800';
  return 'bg-neutral-100 text-neutral-700';
}

function statusBadge(status: string): string {
  if (status === 'active' || status === 'pending')
    return 'bg-success-100 text-success-700';
  if (status === 'deactivated' || status === 'expired' || status === 'revoked')
    return 'bg-neutral-100 text-neutral-600';
  return 'bg-info-100 text-info-700';
}

/**
 * Tim & Akses management panel (UTA-71).
 *
 * Admin-only UI over the UTA-70 APIs (cookie session, workspace taken from
 * the path workspace the Admin types — server resolves membership, never
 * the client). Covers: invite create (email + role + warehouse scope),
 * member list with role/scope update, deactivate with confirm, pending
 * invites with revoke, and last-Admin + Admin-scope safeguards in UX copy.
 * No secrets are logged; the create-response ticket renders once only.
 */
export function TeamPanel() {
  const copy = getTeamCopy('en');
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState('');
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [invites, setInvites] = useState<InviteView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Invite form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('staff');
  const [scope, setScope] = useState('');
  const [inviting, setInviting] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-row edit state
  const [edits, setEdits] = useState<
    Record<string, { role: WorkspaceRole; scope: string }>
  >({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaceId(loadStoredWorkspace());
  }, []);

  const activeAdminCount = useMemo(
    () =>
      (members ?? []).filter(
        (m) => m.role === 'admin' && m.status === 'active'
      ).length,
    [members]
  );

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const handleClientError = useCallback(
    (err: unknown): void => {
      if (err instanceof TeamClientError && err.needsReauth) {
        reauth();
        return;
      }
      setError(
        err instanceof TeamClientError ? err.message : copy.genericError
      );
    },
    [copy.genericError, reauth]
  );

  const load = useCallback(
    async (ws: string) => {
      const target = ws.trim();
      if (!target) {
        setError(copy.validationError);
        return;
      }
      setError(null);
      setNotice(null);
      setLoading(true);
      try {
        const [m, i] = await Promise.all([
          listMembers(target),
          listInvites(target),
        ]);
        setMembers(m);
        setInvites(i);
        try {
          window.localStorage.setItem(WORKSPACE_KEY, target);
        } catch {
          // Storage is a convenience only — ignore.
        }
      } catch (err) {
        handleClientError(err);
        setMembers(null);
        setInvites(null);
      } finally {
        setLoading(false);
      }
    },
    [copy.validationError, handleClientError]
  );

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    setCreatedToken(null);
    setCopied(false);
    const ws = workspaceId.trim();
    if (!ws || !email.trim()) {
      setFormError(copy.validationError);
      return;
    }
    const normalizedScope = normalizeScope(scope);
    if (!validateScopeForRole(role, normalizedScope)) {
      setFormError(copy.adminScopeNote);
      return;
    }
    setInviting(true);
    try {
      const result = await createInvite(ws, {
        email: email.trim(),
        role,
        warehouseScope: role === 'admin' ? null : normalizedScope,
      });
      setCreatedToken(result.token);
      setNotice(copy.inviteCreated);
      setEmail('');
      setScope('');
      setInvites((prev) =>
        prev ? [result.invite, ...prev] : [result.invite]
      );
    } catch (err) {
      if (err instanceof TeamClientError && err.needsReauth) {
        reauth();
        return;
      }
      setFormError(
        err instanceof TeamClientError ? err.message : copy.genericError
      );
    } finally {
      setInviting(false);
    }
  }

  function editFor(m: MemberView): { role: WorkspaceRole; scope: string } {
    return (
      edits[m.userId] ?? { role: m.role, scope: m.warehouseScope ?? '' }
    );
  }

  async function onSaveMember(m: MemberView) {
    const ws = workspaceId.trim();
    const edit = editFor(m);
    const nextScope = normalizeScope(edit.scope);
    if (!validateScopeForRole(edit.role, nextScope)) {
      setError(copy.adminScopeNote);
      return;
    }
    setError(null);
    setNotice(null);
    setRowBusy(m.userId);
    try {
      const updated = await updateMember(ws, m.userId, {
        role: edit.role,
        warehouseScope: edit.role === 'admin' ? null : nextScope,
      });
      setMembers((prev) =>
        (prev ?? []).map((row) => (row.userId === m.userId ? updated : row))
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[m.userId];
        return next;
      });
      setNotice(copy.updatedNotice);
    } catch (err) {
      handleClientError(err);
    } finally {
      setRowBusy(null);
    }
  }

  async function onDeactivate(m: MemberView) {
    const ws = workspaceId.trim();
    setError(null);
    setNotice(null);
    setRowBusy(m.userId);
    try {
      const updated = await deactivateMember(ws, m.userId);
      setMembers((prev) =>
        (prev ?? []).map((row) => (row.userId === m.userId ? updated : row))
      );
      setConfirmTarget(null);
      setNotice(copy.deactivatedNotice);
    } catch (err) {
      handleClientError(err);
    } finally {
      setRowBusy(null);
    }
  }

  async function onRevoke(invite: InviteView) {
    const ws = workspaceId.trim();
    setError(null);
    setNotice(null);
    setRowBusy(invite.id);
    try {
      await revokeInvite(ws, invite.id);
      setInvites((prev) =>
        (prev ?? []).map((row) =>
          row.id === invite.id ? { ...row, status: 'revoked' as const } : row
        )
      );
      setNotice(copy.revokedNotice);
    } catch (err) {
      handleClientError(err);
    } finally {
      setRowBusy(null);
    }
  }

  async function onCopyToken() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const pendingInvites = useMemo(
    () => (invites ?? []).filter((i) => i.status === 'pending'),
    [invites]
  );

  return (
    <div data-testid="team-panel">
      {error ? <AuthAlert testId="team-error">{error}</AuthAlert> : null}
      {notice ? (
        <AuthAlert tone="success" testId="team-notice">
          {notice}
        </AuthAlert>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(workspaceId);
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="team-workspace"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.workspaceLabel}
          </label>
          <input
            id="team-workspace"
            name="workspaceId"
            type="text"
            autoComplete="off"
            required
            placeholder={copy.workspacePlaceholder}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            aria-describedby="team-workspace-hint"
            className={inputClass}
          />
          <p id="team-workspace-hint" className="mt-1 text-xs text-neutral-500">
            {copy.workspaceHint}
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {loading ? copy.loading : copy.loadButton}
        </button>
      </form>

      {members !== null && activeAdminCount <= 1 ? (
        <div
          role="note"
          data-testid="last-admin-warning"
          className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700"
        >
          {copy.lastAdminWarning}
        </div>
      ) : null}

      <section
        aria-labelledby="invite-heading"
        className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="invite-heading"
          className="text-lg font-semibold text-neutral-900"
        >
          {copy.inviteTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{copy.inviteSubtitle}</p>

        <form onSubmit={onInvite} noValidate data-testid="invite-form" className="mt-4 space-y-4">
          {formError ? (
            <AuthAlert testId="invite-error">{formError}</AuthAlert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="invite-email"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.emailLabel}
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                placeholder={copy.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={formError ? true : undefined}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="invite-role"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                {copy.roleLabel}
              </label>
              <select
                id="invite-role"
                name="role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as WorkspaceRole;
                  setRole(next);
                  if (next === 'admin') setScope('');
                }}
                className={inputClass}
              >
                <option value="admin">{copy.roleAdmin}</option>
                <option value="manager">{copy.roleManager}</option>
                <option value="staff">{copy.roleStaff}</option>
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="invite-scope"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              {copy.scopeLabel}
            </label>
            <input
              id="invite-scope"
              name="warehouseScope"
              type="text"
              autoComplete="off"
              disabled={role === 'admin'}
              placeholder={
                role === 'admin' ? copy.adminScopeNote : copy.scopePlaceholder
              }
              value={role === 'admin' ? '' : scope}
              onChange={(e) => setScope(e.target.value)}
              aria-describedby="invite-scope-hint"
              className={`${inputClass} disabled:bg-neutral-100 disabled:text-neutral-500`}
            />
            <p id="invite-scope-hint" className="mt-1 text-xs text-neutral-500">
              {role === 'admin' ? copy.adminScopeNote : copy.scopeHint}
            </p>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
          >
            {inviting ? copy.inviting : copy.inviteButton}
          </button>
        </form>

        {createdToken ? (
          <div
            data-testid="invite-token-once"
            className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-success-700">
              {copy.inviteTokenLabel}
            </p>
            <p className="mt-1 break-all font-mono text-sm text-neutral-900">
              {createdToken}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              {copy.inviteTokenHint}
            </p>
            <button
              type="button"
              onClick={onCopyToken}
              className="mt-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 min-h-[44px] text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
            >
              {copied ? copy.tokenCopied : copy.copyTokenButton}
            </button>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="members-heading"
        className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="members-heading"
          className="text-lg font-semibold text-neutral-900"
        >
          {copy.membersTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{copy.membersSubtitle}</p>
        {members === null ? (
          <p className="mt-4 text-sm text-neutral-500">
            {copy.membersEmpty}
          </p>
        ) : members.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">{copy.membersEmpty}</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {members.map((m) => {
              const edit = editFor(m);
              const isLastAdmin =
                m.role === 'admin' &&
                m.status === 'active' &&
                activeAdminCount <= 1;
              const busy = rowBusy === m.userId;
              return (
                <li
                  key={m.userId}
                  data-testid={`member-${m.userId}`}
                  className="px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge(m.role)}`}
                    >
                      {m.role}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(m.status)}`}
                    >
                      {m.status === 'active'
                        ? copy.statusActive
                        : copy.statusDeactivated}
                    </span>
                    {m.warehouseScope ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        {m.warehouseScope}
                      </span>
                    ) : null}
                    {isLastAdmin ? (
                      <span
                        data-testid={`last-admin-${m.userId}`}
                        className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700"
                      >
                        last admin
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-neutral-500">
                    {m.userId}
                  </p>
                  {m.status === 'active' ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <select
                        aria-label={`${copy.roleLabel} ${m.userId}`}
                        value={edit.role}
                        disabled={busy}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [m.userId]: {
                              ...editFor(m),
                              role: e.target.value as WorkspaceRole,
                              scope:
                                e.target.value === 'admin'
                                  ? ''
                                  : editFor(m).scope,
                            },
                          }))
                        }
                        className={smallInputClass}
                      >
                        <option value="admin">{copy.roleAdmin}</option>
                        <option value="manager">{copy.roleManager}</option>
                        <option value="staff">{copy.roleStaff}</option>
                      </select>
                      <input
                        aria-label={`${copy.scopeLabel} ${m.userId}`}
                        type="text"
                        autoComplete="off"
                        disabled={busy || edit.role === 'admin'}
                        placeholder={copy.scopePlaceholder}
                        value={edit.role === 'admin' ? '' : edit.scope}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [m.userId]: { ...editFor(m), scope: e.target.value },
                          }))
                        }
                        className={`${smallInputClass} disabled:bg-neutral-100`}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onSaveMember(m)}
                        className="rounded-lg bg-primary-500 px-4 py-2 min-h-[44px] text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
                      >
                        {busy && confirmTarget !== m.userId
                          ? copy.updating
                          : copy.updateButton}
                      </button>
                      {confirmTarget === m.userId ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onDeactivate(m)}
                            className="rounded-lg bg-error-500 px-4 py-2 min-h-[44px] text-sm font-semibold text-white hover:bg-error-600 disabled:opacity-60"
                          >
                            {busy ? copy.deactivating : copy.confirmDeactivate}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmTarget(null)}
                            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 min-h-[44px] text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
                          >
                            {copy.cancelButton}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmTarget(m.userId)}
                          className="rounded-lg border border-error-300 bg-white px-4 py-2 min-h-[44px] text-sm font-semibold text-error-700 hover:bg-error-50 disabled:opacity-60"
                        >
                          {copy.deactivateButton}
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="invites-heading"
        className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="invites-heading"
          className="text-lg font-semibold text-neutral-900"
        >
          {copy.invitesTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{copy.invitesSubtitle}</p>
        {invites === null || pendingInvites.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">{copy.invitesEmpty}</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                data-testid={`invite-${invite.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {invite.email}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {invite.role}
                    {invite.warehouseScope
                      ? ` · ${invite.warehouseScope}`
                      : ''}
                    {` · ${copy.statusPending}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={rowBusy === invite.id}
                  onClick={() => void onRevoke(invite)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 min-h-[44px] text-sm font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
                >
                  {rowBusy === invite.id ? copy.revoking : copy.revokeButton}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
