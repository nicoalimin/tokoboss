/**
 * Generic repository port
 * Infrastructure layer provides concrete implementations
 */
export interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
}

/**
 * Query specification for flexible querying
 */
export interface QuerySpecification<T> {
  isSatisfiedBy(entity: T): boolean;
}
