/**
 * Common auth types
 */

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface AuthContext {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
}
