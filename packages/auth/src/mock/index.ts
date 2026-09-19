/**
 * Mock auth implementations for testing
 */

import type { User, Session } from '../types';
import type { AuthProvider, AuthorizationService } from '../ports';

export class MockAuthProvider implements AuthProvider {
  private readonly sessions = new Map<string, Session>();

  async authenticate(_credentials: {
    email: string;
    password: string;
  }): Promise<Session> {
    // Mock implementation - always succeeds
    const session: Session = {
      userId: 'mock-user-123',
      token: `mock-token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    };
    this.sessions.set(session.token, session);
    return session;
  }

  async validateSession(token: string): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < new Date()) {
      return null;
    }
    return session;
  }

  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async getCurrentUser(token: string): Promise<User | null> {
    const session = await this.validateSession(token);
    if (!session) {
      return null;
    }
    return {
      id: session.userId,
      email: 'mock@example.com',
      name: 'Mock User',
      roles: ['user'],
    };
  }
}

export class MockAuthorizationService implements AuthorizationService {
  async hasPermission(
    _userId: string,
    _resource: string,
    _action: string
  ): Promise<boolean> {
    return true; // Mock always allows
  }

  async hasRole(_userId: string, _role: string): Promise<boolean> {
    return true; // Mock always allows
  }
}
