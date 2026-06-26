import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const CONVEX_BACKEND_KEY = process.env.CONVEX_BACKEND_KEY ?? "";

function verifyBackendKey(request: Request): boolean {
  if (!CONVEX_BACKEND_KEY) {
    console.warn("CONVEX_BACKEND_KEY not set — rejecting backend request");
    return false;
  }
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${CONVEX_BACKEND_KEY}`;
}

export const getUserAndQuotaAction = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verifyBackendKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { clerkId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.clerkId) {
    return new Response(
      JSON.stringify({ error: "Missing required field: clerkId" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await ctx.runQuery(internal.users.getUserAndQuotaByClerkId, {
    clerkId: body.clerkId,
  });

  if (!result) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Resolves a desktop access key ("userKey") to the same plan/quota/prompts
// payload as /api/users/get, so the Python backend can authenticate a desktop
// session that logged in with a pasted key instead of a Clerk JWT. The returned
// body includes `clerkId`, which the backend reuses for later quota mutations.
export const getUserByKeyAction = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verifyBackendKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { userKey?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.userKey) {
    return new Response(
      JSON.stringify({ error: "Missing required field: userKey" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const owner = await ctx.runQuery(internal.users.getUserByKey, {
    userKey: body.userKey,
  });

  if (!owner) {
    return new Response(JSON.stringify({ error: "Invalid key" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await ctx.runQuery(internal.users.getUserAndQuotaByClerkId, {
    clerkId: owner.clerkId,
  });

  if (!result) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
