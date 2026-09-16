import { getSettingsCopy, type SettingsLang } from '@/lib/settings-copy';
import { MATRIX_ROLES, roleCardTone, type MatrixRole } from '@/lib/role-matrix';

function roleTitle(
  copy: ReturnType<typeof getSettingsCopy>,
  role: MatrixRole
): string {
  if (role === 'admin') return copy.roleAdmin;
  if (role === 'manager') return copy.roleManager;
  return copy.roleStaff;
}

function roleBody(
  copy: ReturnType<typeof getSettingsCopy>,
  role: MatrixRole
): string {
  if (role === 'admin') return copy.roleAdminBody;
  if (role === 'manager') return copy.roleManagerBody;
  return copy.roleStaffBody;
}

/**
 * Pastel Admin / Manager / Staff role cards (UTA-74, Story 23).
 *
 * Static, readable cards with text labels (never color-only). Rendered on
 * the Settings hub area and above the Tim & Akses management controls so
 * every role sees what each role means.
 */
export function RoleCards({ lang = 'en' }: { lang?: SettingsLang }) {
  const copy = getSettingsCopy(lang);
  return (
    <section aria-labelledby="roles-heading" data-testid="role-cards">
      <h2 id="roles-heading" className="text-lg font-semibold text-neutral-900">
        {copy.rolesTitle}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{copy.rolesSubtitle}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {MATRIX_ROLES.map((role) => (
          <li
            key={role}
            data-testid={`role-card-${role}`}
            className={`rounded-xl border border-neutral-200 px-4 py-4 ${roleCardTone(role).split(' ')[0]}`}
          >
            <p
              className={`text-sm font-semibold ${roleCardTone(role).split(' ')[1]}`}
            >
              {roleTitle(copy, role)}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              {roleBody(copy, role)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
