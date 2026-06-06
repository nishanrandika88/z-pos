import { env } from "@/shared/lib/env";

export async function initSentry() {
  if (!env.VITE_SENTRY_DSN) return;
  const Sentry = await import("@sentry/react");

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_APP_ENV,
    tracesSampleRate: env.VITE_APP_ENV === "production" ? 0.1 : 1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
