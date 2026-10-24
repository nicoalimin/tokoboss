'use client';

import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationLocationLinksCopy } from '@/lib/integration-location-links-copy';
import { useLocationLinks } from '@/lib/use-location-links';
import { LocationLinkRow } from './LocationLinkRow';

/**
 * Pilih gudang sumber (US20 / RFC 04 task 121m, CoS split of row 121): the
 * client container for one store. 121k hook data; 121j heading, intro,
 * linked count and note; one 121l row per location. Loading is role="status";
 * a failed read is role="alert" with retry. The parent passes isAdmin
 * (useMembership role === 'admin'); Manager rows are read-only.
 */

export interface LocationLinksProps {
  workspaceId: string;
  connectionId: string;
  isAdmin: boolean;
  lang?: IntegrationLang;
}

export function LocationLinks({
  workspaceId,
  connectionId,
  isAdmin,
  lang = 'id',
}: Readonly<LocationLinksProps>) {
  const copy = getIntegrationLocationLinksCopy(lang);
  const links = useLocationLinks(workspaceId, connectionId);
  const { locations, warehouses, loading, failed } = links;
  let note: string | null = null;
  if (!isAdmin) note = copy.adminOnlyNote;
  else if (warehouses.length === 0) note = copy.noWarehouses;

  let body;
  if (failed) {
    body = (
      <div
        role="alert"
        data-testid="location-links-error"
        className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
      >
        <p>{copy.failed}</p>
        <button
          type="button"
          onClick={links.retry}
          className="mt-3 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-error-100"
        >
          {copy.retry}
        </button>
      </div>
    );
  } else if (loading || locations.length === 0) {
    body = (
      <p
        role={loading ? 'status' : undefined}
        data-testid={loading ? undefined : 'location-links-empty'}
        className="py-3 text-sm text-neutral-600"
      >
        {loading ? copy.loading : copy.emptyLocations}
      </p>
    );
  } else {
    body = (
      <>
        <p className="text-sm font-semibold text-neutral-700">
          {copy.linkedCount(links.linkedCount, locations.length)}
        </p>
        {note ? <p className="text-xs text-neutral-600">{note}</p> : null}
        <ul data-testid="location-links-rows" className="flex flex-col">
          {locations.map((location) => (
            <LocationLinkRow
              key={location.externalLocationId}
              location={location}
              warehouses={warehouses}
              isAdmin={isAdmin}
              save={links.saves[location.externalLocationId]}
              onLink={links.link}
              lang={lang}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <section data-testid="location-links" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-neutral-900">
        {copy.heading}
      </h2>
      <p className="text-sm text-neutral-600">{copy.intro}</p>
      {body}
    </section>
  );
}
