import { BaseRepository } from '../repositories/index.js';

/**
 * In-memory repository implementation
 * Useful for testing and demonstrations
 */
export class InMemoryRepository<T extends { id: ID }, ID> extends BaseRepository<T, ID> {
  private readonly store = new Map<ID, T>();

  async findById(id: ID): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async save(entity: T): Promise<T> {
    this.store.set(entity.id, entity);
    return entity;
  }

  async delete(id: ID): Promise<void> {
    this.store.delete(id);
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.store.values());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  /**
   * Seed data for testing
   */
  async seed(entities: T[]): Promise<void> {
    for (const entity of entities) {
      await this.save(entity);
    }
  }
}
