'use client';

import { useState, type FormEvent } from 'react';
import type { IntegrationBlibliKeyFormBody } from '@tokoboss/contracts';
import { getIntegrationBlibliCopy } from '@/lib/integration-blibli-copy';
import type { IntegrationLang } from '@/lib/integration-copy';
import { BlibliBindingInfo } from './BlibliBindingInfo';

/**
 * Connect wizard step 3 for Blibli (US20 / RFC 04 task 112c; Design §
 * Credential binding, O6). Key inputs are type=password and uncontrolled, so
 * keys never sit in state or echo back. Blank (trimmed) fields show
 * missingFields and skip onSubmit. ConnectWizard (113) owns route and busy.
 */
export interface BlibliKeyFormProps {
  /** TokoBoss's Blibli API client id; null shows clientIdMissing. */
  clientId: string | null;
  onSubmit: (body: IntegrationBlibliKeyFormBody) => void;
  busy?: boolean;
  /** Client-safe error from 113 (never contains a key). */
  error?: string | null;
  lang?: IntegrationLang;
}

type Field = keyof IntegrationBlibliKeyFormBody;

const FIELDS = [
  ['merchantCode', 'text', 'merchantCodeLabel'],
  ['apiSellerKey', 'password', 'apiSellerKeyLabel'],
  ['signatureKey', 'password', 'signatureKeyLabel'],
] as const;

export function BlibliKeyForm({
  clientId,
  onSubmit,
  busy = false,
  error = null,
  lang = 'id',
}: Readonly<BlibliKeyFormProps>) {
  const copy = getIntegrationBlibliCopy(lang);
  const [missing, setMissing] = useState(false);
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const read = (name: Field) => String(data.get(name) ?? '').trim();
    const body: IntegrationBlibliKeyFormBody = {
      merchantCode: read('merchantCode'),
      apiSellerKey: read('apiSellerKey'),
      signatureKey: read('signatureKey'),
    };
    const blank = Object.values(body).some((value) => value === '');
    setMissing(blank);
    if (!blank) onSubmit(body);
  }
  const alert = missing ? copy.missingFields : error;
  return (
    <form
      data-testid="blibli-key-form"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <BlibliBindingInfo clientId={clientId} lang={lang} />
      {FIELDS.map(([name, type, label]) => (
        <label key={name} className="flex flex-col gap-1 text-sm font-medium">
          {copy[label]}
          <input
            name={name}
            type={type}
            data-testid={`blibli-${name}`}
            autoComplete="off"
            placeholder={type === 'text' ? copy.merchantCodeHint : undefined}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
      ))}
      <p className="text-xs text-neutral-600">{copy.keysNote}</p>
      {alert ? (
        <p
          role="alert"
          data-testid="blibli-key-form-error"
          className="text-sm text-error-700"
        >
          {alert}
        </p>
      ) : null}
      <button
        type="submit"
        data-testid="blibli-submit"
        disabled={busy}
        aria-busy={busy}
        className="min-h-[44px] rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
      >
        {busy ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
