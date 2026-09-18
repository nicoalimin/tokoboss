// Basic API client for TUI functionality
// This would connect to your existing backend services

export const login = async (username: string, password: string) => {
  // In a real implementation, this would call your auth API
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        token: 'fake-auth-token',
        user: { username, role: 'admin' }
      });
    }, 100);
  });
};

export const listResources = async (resourceType: string) => {
  // In a real implementation, this would call your appropriate API
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        type: resourceType,
        items: [`fake-${resourceType}-item-1`, `fake-${resourceType}-item-2`]
      });
    }, 100);
  });
};