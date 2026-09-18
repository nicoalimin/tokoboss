import { listResources } from '../lib/client';

export const handleList = async (resourceType: string) => {
  try {
    const result = await listResources(resourceType);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};
