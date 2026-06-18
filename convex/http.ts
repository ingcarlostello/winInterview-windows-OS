import { httpRouter } from "convex/server";
import { decrementQuotaAction, clerkWebhook } from "./webhooks";
import { getUserAndQuotaAction } from "./backend";
import { paddleWebhook } from "./paddle";

const http = httpRouter();

http.route({
  path: "/api/quotas/decrement",
  method: "POST",
  handler: decrementQuotaAction,
});

http.route({
  path: "/api/users/get",
  method: "POST",
  handler: getUserAndQuotaAction,
});

http.route({
  path: "/api/webhooks/clerk",
  method: "POST",
  handler: clerkWebhook,
});

http.route({
  path: "/api/webhooks/paddle",
  method: "POST",
  handler: paddleWebhook,
});

export default http;