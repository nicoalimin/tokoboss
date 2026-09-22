/**
 * Money value object - immutable representation of currency
 * Uses integer cents to avoid floating-point precision issues
 */
export class Money {
  private readonly _amountInCents: number;
  private readonly _currency: string;

  private constructor(amountInCents: number, currency: string) {
    this._amountInCents = amountInCents;
    this._currency = currency;
  }

  static fromCents(amountInCents: number, currency: string = 'IDR'): Money {
    if (amountInCents < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (!Number.isInteger(amountInCents)) {
      throw new Error('Amount must be an integer (cents)');
    }
    return new Money(amountInCents, currency.toUpperCase());
  }

  static fromUnits(amount: number, currency: string = 'IDR'): Money {
    return Money.fromCents(Math.round(amount * 100), currency);
  }

  get amountInCents(): number {
    return this._amountInCents;
  }

  get amount(): number {
    return this._amountInCents / 100;
  }

  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(
      this._amountInCents + other._amountInCents,
      this._currency
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(
      this._amountInCents - other._amountInCents,
      this._currency
    );
  }

  multiply(factor: number): Money {
    return Money.fromCents(
      Math.round(this._amountInCents * factor),
      this._currency
    );
  }

  equals(other: Money): boolean {
    return (
      this._amountInCents === other._amountInCents &&
      this._currency === other._currency
    );
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amountInCents > other._amountInCents;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amountInCents < other._amountInCents;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: ${this._currency} vs ${other._currency}`
      );
    }
  }

  toString(): string {
    return `${this._currency} ${this.amount.toFixed(2)}`;
  }
}
