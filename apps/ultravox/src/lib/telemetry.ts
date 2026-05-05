/**
 * Telemetry skeleton — Sentry / PostHog wiring lands when DSN is provisioned.
 *
 * For now everything is a no-op or console.log so feature code can call
 * `track(...)` and `captureError(...)` without conditional checks.
 */

const ENABLED = Boolean(import.meta.env["VITE_SENTRY_DSN"]);

export function track(event: string, props?: Record<string, unknown>): void {
  if (!ENABLED) {
    if (import.meta.env.DEV) console.debug("[telemetry]", event, props);
    return;
  }
  // TODO: Sentry breadcrumb / PostHog capture
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!ENABLED) {
    console.error("[telemetry-error]", err, context);
    return;
  }
  // TODO: Sentry.captureException(err, { extra: context })
}

export function setUserContext(_traits: Record<string, unknown>): void {
  // no-op until DSN is wired
}
