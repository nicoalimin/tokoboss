/**
 * Next.js instrumentation file
 * This runs once on server startup before any requests are handled
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { validateEnv, getDeploymentSummary } from '@tokoboss/config';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate environment variables at server startup
    const validation = validateEnv();

    if (!validation.success) {
      console.error('❌ Environment validation failed!');
      console.error(validation.error);
      console.error('\nPlease check your environment variables and try again.');
      console.error('See infra/vercel/README.md for configuration details.\n');

      // Fail fast in production/staging - do not serve requests with invalid config
      if (
        validation.environment === 'production' ||
        validation.environment === 'staging'
      ) {
        throw new Error(
          'Environment validation failed in production/staging. Cannot start server.'
        );
      }

      // In preview/local, log error but allow startup for development
      console.warn(
        '⚠️  Continuing with invalid environment in preview/local mode.'
      );
      console.warn('⚠️  Some features may not work correctly.\n');
    } else {
      // Log successful startup with deployment metadata
      const summary = getDeploymentSummary();
      console.log('✓ Environment validation passed');
      console.log(`✓ ${summary}\n`);
    }
  }
}
