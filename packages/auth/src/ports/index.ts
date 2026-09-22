/**
 * Auth ports - Infrastructure implements these
 */

import type { User, Session } from '../types';

export interface AuthProvider {
  authenticate(credentials: {
    email: string;
    password: string;
  }): Promise<Session>;
  validateSession(token: string): Promise<Session | null>;
  invalidateSession(token: string): Promise<void>;
  getCurrentUser(token: string): Promise<User | null>;
}

export interface AuthorizationService {
  hasPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean>;
  hasRole(userId: string, role: string): Promise<boolean>;
}
