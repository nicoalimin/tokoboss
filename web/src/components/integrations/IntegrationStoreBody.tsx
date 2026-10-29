import type {
  IntegrationCallbackResult,
  IntegrationConnectionView,
} from '@tokoboss/contracts';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { resolveIntegrationProblem } from '@/lib/integration-problem-views';
import { getIntegrationStoreDetailCopy } from '@/lib/integration-store-detail-copy';
import type { IntegrationStoreActions } from '@/lib/use-integration-store-actions';
import { useIntegrationStoreManagement } from '@/lib/use-integration-store-management';
import { ConnectProblem } from './ConnectProblem';
import { DisconnectedPanel } from './DisconnectedPanel';
import { IntegrationStoreConnected } from './IntegrationStoreConnected';

/**
 * Store detail screen body (US20 / RFC 04 task 122d-ii, CoS split of 122d):
 * picks the screen from the stored status and the callback `result`. A
 * problem (resolveIntegrationProblem) shows ConnectProblem with Otorisasi
 * ulang; Terputus shows DisconnectedPanel with Hapus koneksi; otherwise the
 * connected screen (IntegrationStoreConnected, 122d-i). Admins also get
 * Putuskan toko unless Terputus. The 122e loader owns the data, the role
 * and the confirm dialogs.
 */

export interface IntegrationStoreBodyProps {
  workspaceId: string;
  connection: IntegrationConnectionView;
  result?: IntegrationCallbackResult | null;
  isAdmin: boolean;
  /** The 122c action hook state and handlers. */
  actions: IntegrationStoreActions;
  lang?: IntegrationLang;
}

const SECONDARY =
  'inline-flex min-h-[44px] items-center self-start rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

export function IntegrationStoreBody({
  workspaceId,
  connection,
  result,
  isAdmin,
  actions,
  lang = 'id',
}: Readonly<IntegrationStoreBodyProps>) {
  const { status } = connection;
  const problem = resolveIntegrationProblem({ result, connection });
  const management = useIntegrationStoreManagement(workspaceId, connection.id);
  const base = `/w/${encodeURIComponent(workspaceId)}/integrasi`;
  let screen;
  if (problem) {
    screen = (
      <ConnectProblem
        problem={problem}
        provider={INTEGRATION_PROVIDER_NAMES[connection.provider]}
        storeName={connection.storeName ?? undefined}
        storeId={connection.providerStoreId}
        centerHref={base}
        isAdmin={isAdmin}
        onAction={actions.reauthorize}
        busy={actions.reauthorizing}
        lang={lang}
      />
    );
  } else if (status === 'disconnected') {
    screen = (
      <DisconnectedPanel
        connection={connection}
        isAdmin={isAdmin}
        onRemove={() => actions.openDialog('remove')}
        lang={lang}
      />
    );
  } else {
    screen = (
      <IntegrationStoreConnected
        workspaceId={workspaceId}
        connection={connection}
        isAdmin={isAdmin}
        lang={lang}
        {...management}
      />
    );
  }
  return (
    <div data-testid="integration-store-body" className="flex flex-col gap-6">
      {screen}
      {isAdmin && status !== 'disconnected' ? (
        <button
          type="button"
          onClick={() => actions.openDialog('disconnect')}
          disabled={actions.busy}
          className={SECONDARY}
        >
          {getIntegrationStoreDetailCopy(lang).disconnect}
        </button>
      ) : null}
    </div>
  );
}
