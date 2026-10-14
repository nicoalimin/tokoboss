import { Beranda } from '@/components/shell/Beranda';

export const metadata = { title: 'Beranda — TokoBoss' };

/**
 * Workspace dashboard (US29 / RFC 02 row 44). The `/w/[workspaceId]` layout
 * enforces membership. Legacy `/` stays until middleware (row 60) redirects it.
 */
export default function WorkspaceDashboardPage() {
  return <Beranda />;
}
