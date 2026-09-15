import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Instrumentation is supported by default in Next.js 15+
  // See: /web/instrumentation.ts for server startup validation
  // Ensure workspace packages are compiled by Next's SWC pipeline at
  // build time (they ship raw TS via workspace symlinks).
  transpilePackages: [
    '@tokoboss/domain',
    '@tokoboss/application',
    '@tokoboss/integrations',
  ],
};

export default nextConfig;
