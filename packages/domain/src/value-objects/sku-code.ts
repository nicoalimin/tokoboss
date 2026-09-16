import { ValidationError } from '../errors/domain-error';

/**
 * SKU TokoBoss code value object (UTA-75, Story 01).
 *
 * Invariants (Story 01 freeze):
 * - Trimmed, 1–64 chars, URL/path-safe alphabet (`A–Z a–r 0–9 - _ . /`),
 *   starting with an alphanumeric. Uniqueness is per workspace and is
 *   enforced by the store (unique index), not here.
 * - Pure validation only — no framework, no I/O.
 */
export class SkuCode {
  private static readonly PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_./]*$/;
  private static readonly MAX_LENGTH = 64;

  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static parse(raw: unknown): SkuCode {
    if (typeof raw !== 'string') {
      throw new ValidationError('SKU code must be a string');
    }
    const value = raw.trim();
    if (value.length === 0) {
      throw new ValidationError('SKU code must not be empty');
    }
    if (value.length > SkuCode.MAX_LENGTH) {
      throw new ValidationError('SKU code must be at most 64 characters');
    }
    if (!SkuCode.PATTERN.test(value)) {
      throw new ValidationError('SKU code has an unsupported format');
    }
    return new SkuCode(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: SkuCode): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
