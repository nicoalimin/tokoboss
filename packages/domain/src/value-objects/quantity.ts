/**
 * Quantity value object - immutable representation of item quantity
 */
export class Quantity {
  private readonly _value: number;
  private readonly _unit: string;

  private constructor(value: number, unit: string) {
    this._value = value;
    this._unit = unit;
  }

  static create(value: number, unit: string = 'pcs'): Quantity {
    if (value < 0) {
      throw new Error('Quantity cannot be negative');
    }
    if (!Number.isFinite(value)) {
      throw new Error('Quantity must be a finite number');
    }
    return new Quantity(value, unit);
  }

  get value(): number {
    return this._value;
  }

  get unit(): string {
    return this._unit;
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.create(this._value + other._value, this._unit);
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.create(this._value - other._value, this._unit);
  }

  multiply(factor: number): Quantity {
    return Quantity.create(this._value * factor, this._unit);
  }

  equals(other: Quantity): boolean {
    return this._value === other._value && this._unit === other._unit;
  }

  isGreaterThan(other: Quantity): boolean {
    this.assertSameUnit(other);
    return this._value > other._value;
  }

  isLessThan(other: Quantity): boolean {
    this.assertSameUnit(other);
    return this._value < other._value;
  }

  private assertSameUnit(other: Quantity): void {
    if (this._unit !== other._unit) {
      throw new Error(`Unit mismatch: ${this._unit} vs ${other._unit}`);
    }
  }

  toString(): string {
    return `${this._value} ${this._unit}`;
  }
}
