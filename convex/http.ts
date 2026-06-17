import { httpRouter } from "convex/server";
import { decrementQuotaAction, clerkWebhook } from "./webhooks";

const http = httpRouter();

http.route({
  path: "/api/quotas/decrement",
  method: "POST",
  handler: decrementQuotaAction,
});

http.route({
  path: "/api/webhooks/clerk",
  method: "POST",
  handler: clerkWebhook,
});

export default http;