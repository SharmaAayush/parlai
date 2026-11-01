export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Force env validation at startup (not at build time)
    const { env } = await import('./server/env');
    // Access a property to trigger validation
    void env.APP_URL;
  }
}