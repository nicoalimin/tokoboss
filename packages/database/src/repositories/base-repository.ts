import type { Repository } from '@tokoboss/domain';

/**
 * Base repository with common database operations
 * Concrete implementations extend this
 */
export abstract class BaseRepository<T, ID> implements Repository<T, ID> {
  abstract findById(id: ID): Promise<T | null>;
  abstract save(entity: T): Promise<T>;
  abstract delete(id: ID): Promise<void>;

  /**
   * Additional query methods can be added here
   */
  abstract findAll(): Promise<T[]>;
}
