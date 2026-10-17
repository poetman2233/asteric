import type { Instrumentation } from "next";

/**
 * Server error reporting. Every unhandled request error is written as one structured
 * log line (visible in Vercel → Logs). To forward errors to Sentry or another service,
 * add its SDK call here; no customer data is included beyond the route path.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logger, errorInfo } = await import("@/server/logger");
  logger.error("request.unhandled", { err: { ...errorInfo(err), digest: (err as { digest?: string }).digest }, path: request.path.split("?")[0], method: request.method, route: context.routePath, kind: context.routerKind });
};
