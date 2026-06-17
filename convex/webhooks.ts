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

export const decrementQuotaAction = httpAction(async (ctx, request) => {
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

  let body: { clerkId?: string; quotaType?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.clerkId || !body.quotaType || typeof body.amount !== "number") {
    return new Response(
      JSON.stringify({ error: "Missing required fields: clerkId, quotaType, amount" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    await ctx.runMutation(internal.quotas.decrementQuota, {
      clerkId: body.clerkId,
      quotaType: body.quotaType,
      amount: body.amount,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

const CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? "";

function base64Decode(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

async function verifyClerkSignature(request: Request, body: string): Promise<boolean> {
  if (!CLERK_WEBHOOK_SIGNING_SECRET) {
    console.warn("CLERK_WEBHOOK_SIGNING_SECRET not set — skipping verification");
    return true;
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  try {
    const secretBase64 = CLERK_WEBHOOK_SIGNING_SECRET.startsWith("whsec_")
      ? CLERK_WEBHOOK_SIGNING_SECRET.slice(6)
      : CLERK_WEBHOOK_SIGNING_SECRET;
    const secretBytes = base64Decode(secretBase64);
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const msgBuffer = new TextEncoder().encode(signedContent);
    const signatureParts = svixSignature.split(" ");

    for (const part of signatureParts) {
      const [version, sig] = part.split(",");
      if (version !== "v1" || !sig) continue;
      const sigBuffer = base64Decode(sig);
      const valid = await crypto.subtle.verify("HMAC", key, sigBuffer, msgBuffer);
      if (valid) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const clerkWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await request.text();

  if (!await verifyClerkSignature(request, body)) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { type, data } = payload;

  try {
    if (type === "user.deleted") {
      const clerkId = data?.id as string | undefined;
      if (clerkId) {
        await ctx.runMutation(internal.users.deleteUserByClerkId, { clerkId });
      }
    } else if (type === "user.created") {
      const clerkId = data?.id as string | undefined;
      if (!clerkId) {
        return new Response(JSON.stringify({ ok: true, skipped: "no clerk id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const emailAddresses = data?.email_addresses as Array<{ id: string; email_address: string }> | undefined;
      const primaryEmailAddressId = data?.primary_email_address_id as string | undefined;
      const firstName = data?.first_name as string | undefined;
      const lastName = data?.last_name as string | undefined;
      const imageUrl = data?.image_url as string | undefined;

      const primaryEmail = emailAddresses?.find(
        (e) => e.id === primaryEmailAddressId
      )?.email_address;

      const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

      const tokenIdentifier = `https://infinite-quail-91.clerk.accounts.dev|${clerkId}`;

      await ctx.runMutation(internal.users.createUserFromClerk, {
        clerkId,
        tokenIdentifier,
        email: primaryEmail,
        name: fullName,
        imageUrl,
      });

      console.log(`[Clerk webhook] Created Convex user for Clerk id ${clerkId}`);
    } else if (type === "user.updated") {
      const clerkId = data?.id as string | undefined;
      const emailAddresses = data?.email_addresses as Array<{ id: string; email_address: string }> | undefined;
      const primaryEmailAddressId = data?.primary_email_address_id as string | undefined;
      const firstName = data?.first_name as string | undefined;
      const lastName = data?.last_name as string | undefined;
      const imageUrl = data?.image_url as string | undefined;

      const primaryEmail = emailAddresses?.find(
        (e) => e.id === primaryEmailAddressId
      )?.email_address;

      const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

      if (clerkId) {
        await ctx.runMutation(internal.users.updateUserFromClerk, {
          clerkId,
          email: primaryEmail,
          name: fullName,
          imageUrl,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("Clerk webhook error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});