/**
 * Domain event interface
 */
export interface DomainEvent {
  occurredAt: Date;
  eventType: string;
}

/**
 * Event publisher port
 * Infrastructure layer provides concrete implementations
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishBatch(events: DomainEvent[]): Promise<void>;
}
