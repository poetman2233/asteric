import type { Instrumentation } from "next";

/**
 * Server error reporting. Every unhandled request error is written as one structured
 * log line (visible in Vercel → Logs). To forward errors to Sentry or another service,
 * add its SDK call here; no customer data is included beyond the route path.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logger } = await import("@/server/logger");
  const e = err as Error & { digest?: string };
  logger.error("request.unhandled", { err: { name: e.name, message: e.message, digest: e.digest }, path: request.path.split("?")[0], method: request.method, route: context.routePath, kind: context.routerKind });
};
