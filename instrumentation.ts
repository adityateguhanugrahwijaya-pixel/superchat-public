/**
 * Next.js Instrumentation Hook
 * Executes when the Next.js server instances start up.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { runJanitor } = await import('@/lib/sandbox/janitor')
      // Run once on server startup
      runJanitor().catch((err) => console.error('[Janitor Startup Error]', err))

      // Schedule periodic sweep every 6 hours
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000
      const timer = setInterval(() => {
        runJanitor().catch((err) => console.error('[Janitor Periodic Error]', err))
      }, SIX_HOURS_MS)

      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    } catch (err) {
      console.error('[Instrumentation Error]', err)
    }
  }
}
