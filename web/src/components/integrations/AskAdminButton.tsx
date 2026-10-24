'use client';

import { useState } from 'react';
import { getIntegrationAskAdminCopy } from '@/lib/integration-ask-admin-copy';
import type { IntegrationLang } from '@/lib/integration-copy';

/**
 * Minta Admin button (US20 / RFC 04 task 105b, CoS Option A): a Manager or
 * Staff copies a prefilled request for an Admin. Client-only; nothing is
 * sent. Clipboard API first, then a hidden-textarea fallback; if both fail
 * the request text is shown so it can be copied by hand.
 */

export interface AskAdminButtonProps {
  /** Provider display name, e.g. Shopee or TikTok Shop. */
  provider: string;
  lang?: IntegrationLang;
  /** Rendered only when supplied (no parent supplies it in v1). */
  adminNames?: string[];
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function AskAdminButton({
  provider,
  lang = 'id',
  adminNames,
  className = '',
}: Readonly<AskAdminButtonProps>) {
  const copy = getIntegrationAskAdminCopy(lang);
  const request = copy.request(provider);
  const [state, setState] = useState<CopyState>('idle');

  async function onClick() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(request);
      ok = true;
    } catch {
      ok = fallbackCopy(request);
    }
    setState(ok ? 'copied' : 'failed');
  }

  return (
    <div
      data-testid="ask-admin"
      className={`inline-flex flex-col gap-1 ${className}`.trim()}
    >
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 min-h-[44px] text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        {state === 'copied' ? copy.copied : copy.button}
      </button>
      {adminNames && adminNames.length > 0 ? (
        <p className="text-xs text-neutral-600">
          {copy.adminsLabel(adminNames)}
        </p>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? copy.copied : ''}
      </span>
      {state === 'failed' ? (
        <p className="text-xs text-neutral-700">
          {copy.copyFailed}{' '}
          <span className="select-all font-medium">{request}</span>
        </p>
      ) : null}
    </div>
  );
}
