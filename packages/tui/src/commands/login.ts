import { login } from '../lib/client';

export const handleLogin = async (username: string, password: string) => {
  try {
    const result = await login(username, password);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};
