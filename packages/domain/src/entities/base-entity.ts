/**
 * Base entity with identity
 * All domain entities extend this base
 */
export abstract class BaseEntity<T> {
  protected readonly _id: T;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(id: T, createdAt?: Date, updatedAt?: Date) {
    this._id = id;
    this._createdAt = createdAt ?? new Date();
    this._updatedAt = updatedAt ?? new Date();
  }

  get id(): T {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected markUpdated(): void {
    this._updatedAt = new Date();
  }

  equals(other: BaseEntity<T>): boolean {
    if (other == null || other === undefined) {
      return false;
    }
    return this._id === other._id;
  }
}
