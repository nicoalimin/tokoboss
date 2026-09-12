/**
 * Deployment metadata for observability
 * 
 * According to RFC 01, logs should include:
 * - Environment (production/staging/preview/local)
 * - Deployment ID (from Vercel)
 * - Commit SHA (from Git)
 * - Region (from Vercel)
 * 
 * This metadata helps correlate logs across services and trace issues back to specific deployments.
 */

export interface DeploymentMetadata {
  environment: string;
  deploymentId: string | null;
  commitSha: string | null;
  region: string | null;
  deploymentUrl: string | null;
  nodeEnv: string;
}

/**
 * Extract deployment metadata from environment variables
 * This should be called once at server startup and cached
 */
export function getDeploymentMetadata(): DeploymentMetadata {
  const env = process.env;
  
  // Determine application environment
  const appEnv = 
    env.APP_ENV || 
    (env.VERCEL_ENV === 'production' ? 'production' : 
     env.VERCEL_ENV === 'preview' ? 'preview' : 
     env.NODE_ENV === 'production' ? 'production' : 'local');
  
  return {
    environment: appEnv,
    deploymentId: env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || null,
    region: env.VERCEL_REGION || null,
    deploymentUrl: env.VERCEL_URL || null,
    nodeEnv: env.NODE_ENV || 'development',
  };
}

/**
 * Format deployment metadata for structured logging
 * Returns a flat object suitable for JSON logging
 */
export function formatDeploymentMetadata(metadata?: DeploymentMetadata): Record<string, string | null> {
  const data = metadata || getDeploymentMetadata();
  
  return {
    'deployment.environment': data.environment,
    'deployment.id': data.deploymentId,
    'deployment.commit_sha': data.commitSha,
    'deployment.region': data.region,
    'deployment.url': data.deploymentUrl,
    'deployment.node_env': data.nodeEnv,
  };
}

/**
 * Create a logger context with deployment metadata
 * Use this to enrich all log entries with deployment information
 * 
 * Example usage:
 * ```ts
 * const context = createLoggerContext();
 * console.log(JSON.stringify({ ...context, message: 'User logged in', userId: '123' }));
 * ```
 */
export function createLoggerContext(): Record<string, string | null> {
  return formatDeploymentMetadata();
}

/**
 * Check if running in Vercel environment
 */
export function isVercelEnvironment(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  const metadata = getDeploymentMetadata();
  return metadata.environment === 'production';
}

/**
 * Check if running in preview (PR preview)
 */
export function isPreview(): boolean {
  const metadata = getDeploymentMetadata();
  return metadata.environment === 'preview';
}

/**
 * Check if running in staging
 */
export function isStaging(): boolean {
  const metadata = getDeploymentMetadata();
  return metadata.environment === 'staging';
}

/**
 * Get a human-readable deployment summary
 * Useful for startup logs
 */
export function getDeploymentSummary(): string {
  const metadata = getDeploymentMetadata();
  const parts: string[] = [
    `Environment: ${metadata.environment}`,
  ];
  
  if (metadata.commitSha) {
    parts.push(`Commit: ${metadata.commitSha.substring(0, 7)}`);
  }
  
  if (metadata.region) {
    parts.push(`Region: ${metadata.region}`);
  }
  
  if (metadata.deploymentId) {
    parts.push(`Deployment: ${metadata.deploymentId}`);
  }
  
  return parts.join(' | ');
}
