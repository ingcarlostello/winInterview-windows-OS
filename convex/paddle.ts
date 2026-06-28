import { httpAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { v } from "convex/values";

declare const process: { env: Record<string, string | undefined> };

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? "";
const PADDLE_API_KEY = process.env.PADDLE_API_KEY ?? "";
const PADDLE_API_URL = process.env.PADDLE_API_URL ?? "https://sandbox-api.paddle.com";

const SANDBOX_PRICE_IDS: Record<string, string> = {
  lite: "pri_01kvc6na8fharg06tas9cb5da4",
  pro: "pri_01kvc6na9wsxctyp9291jtmer6",
  ultra: "pri_01kvc6nab71h76fpdcx203wkag",
};

function getPriceId(planId: string): string | null {
  const envKey = `PADDLE_PRICE_${planId.toUpperCase()}`;
  return process.env[envKey] ?? SANDBOX_PRICE_IDS[planId] ?? null;
}

function hexDecode(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!PADDLE_WEBHOOK_SECRET) {
    console.warn("PADDLE_WEBHOOK_SECRET not set — skipping verification");
    return true;
  }
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(";");
  let ts: string | null = null;
  let h1: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "ts") ts = value;
    else if (key === "h1") h1 = value;
  }
  if (!ts || !h1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Date.now() / 1000;
  if (Math.abs(nowSec - tsNum) > 300) return false;

  try {
    const keyData = new TextEncoder().encode(PADDLE_WEBHOOK_SECRET);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const msg = new TextEncoder().encode(`${ts}:${rawBody}`);
    const sigBuffer = hexDecode(h1);
    return await crypto.subtle.verify("HMAC", key, sigBuffer, msg);
  } catch {
    return false;
  }
}

type PaddlePriceItem = {
  price_id?: string;
  price?: { custom_data?: Record<string, unknown> | null };
};

type PaddleSubscriptionData = {
  id?: string;
  status?: string;
  customer_id?: string;
  items?: PaddlePriceItem[];
  custom_data?: Record<string, unknown> | null;
  management_urls?: {
    update_payment_method?: string;
    cancel?: string;
  } | null;
  current_billing_period?: { ends_at?: string } | null;
};

type PaddleTransactionData = {
  id?: string;
  status?: string;
  customer_id?: string;
  subscription_id?: string;
  items?: PaddlePriceItem[];
  custom_data?: Record<string, unknown> | null;
};

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown>;
};

function extractPlanId(data: Record<string, unknown>): string | null {
  const items = (data as PaddleSubscriptionData).items;
  if (!items || items.length === 0) return null;
  for (const item of items) {
    const planId = item.price?.custom_data?.plan_id;
    if (typeof planId === "string") return planId;
    if (item.price_id) {
      for (const [plan, priceId] of Object.entries(SANDBOX_PRICE_IDS)) {
        if (item.price_id === priceId) return plan;
      }
      for (const plan of ["lite", "pro", "ultra"]) {
        const envPrice = process.env[`PADDLE_PRICE_${plan.toUpperCase()}`];
        if (item.price_id === envPrice) return plan;
      }
    }
  }
  return null;
}

function extractClerkId(data: Record<string, unknown>): string | null {
  const customData = (data as PaddleSubscriptionData).custom_data;
  const clerkId = customData?.clerk_id;
  return typeof clerkId === "string" ? clerkId : null;
}

export const paddleWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Paddle-Signature");

  if (!(await verifyPaddleSignature(rawBody, signatureHeader))) {
    console.error("[Paddle webhook] Invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = event.event_type ?? "";
  const data = event.data ?? {};
  console.log(`[Paddle webhook] Event: ${eventType}`);

  // No exigimos clerk_id globalmente: los eventos `subscription.*` no lo llevan en
  // custom_data (solo la transacción). Para esos, el usuario se resuelve por sus IDs
  // de Paddle dentro de handleSubscriptionEvent. `transaction.completed` sí debe traerlo.
  const clerkId = extractClerkId(data);

  try {
    if (eventType.startsWith("subscription.")) {
      await handleSubscriptionEvent(ctx, eventType, data as PaddleSubscriptionData, clerkId);
    } else if (eventType === "transaction.completed") {
      if (!clerkId) {
        console.warn(`[Paddle webhook] transaction.completed without clerk_id — skipping`);
        return new Response(JSON.stringify({ ok: true, skipped: "no clerk_id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      await handleTransactionCompleted(ctx, data as PaddleTransactionData, clerkId);
    } else if (eventType === "transaction.payment_failed") {
      console.warn(`[Paddle webhook] Payment failed${clerkId ? ` for clerk ${clerkId}` : ""}`);
    } else {
      console.log(`[Paddle webhook] Unhandled event type: ${eventType}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error(`[Paddle webhook] Error processing ${eventType}:`, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function handleSubscriptionEvent(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  eventType: string,
  data: PaddleSubscriptionData,
  clerkIdFromEvent: string | null
): Promise<void> {
  const subscriptionId = data.id ?? undefined;
  const customerId = data.customer_id ?? undefined;
  const status = data.status ?? undefined;
  const managementUrls = data.management_urls ?? null;
  const currentPeriodEnd = data.current_billing_period?.ends_at ?? undefined;

  // Los eventos `subscription.*` no llevan clerk_id en custom_data (solo lo lleva la
  // transacción). Se resuelve el usuario por los IDs de Paddle que la fila ya guarda
  // (puestos por el `transaction.completed` de la compra inicial).
  let clerkId = clerkIdFromEvent;
  if (!clerkId) {
    clerkId = await ctx.runQuery(internal.users.findClerkIdByPaddleIds, {
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId,
    });
  }
  if (!clerkId) {
    console.warn(
      `[Paddle webhook] Could not resolve user for ${eventType} (sub=${subscriptionId}) — skipping`
    );
    return;
  }

  if (!status) {
    console.warn(`[Paddle webhook] ${eventType} without status — skipping`);
    return;
  }

  // El plan se decide por el ESTADO de la suscripción, NO por el tipo de evento.
  // Paddle envía un `subscription.updated` (status "canceled"/"paused"/"past_due")
  // junto con la cancelación; si la rama "general" aplicara el plan del precio sin
  // mirar el estado, pisaría el revert a free. Solo `active`/`trialing` dan plan de pago.
  const isEntitled = status === "active" || status === "trialing";

  let planId = "free";
  if (isEntitled) {
    const extracted = extractPlanId(data as unknown as Record<string, unknown>);
    if (!extracted) {
      console.warn(`[Paddle webhook] Could not determine plan_id for active ${eventType}`);
      return;
    }
    planId = extracted;
  }

  await ctx.runMutation(internal.users.applySubscription, {
    clerkId,
    planId,
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId: customerId,
    paddleStatus: status,
    paddleCancelUrl: managementUrls?.cancel ?? undefined,
    paddleUpdatePaymentUrl: managementUrls?.update_payment_method ?? undefined,
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
  });
  console.log(
    `[Paddle webhook] ${eventType} (status ${status}) → plan ${planId} for clerk ${clerkId}`
  );
}

async function handleTransactionCompleted(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  data: PaddleTransactionData,
  clerkId: string
): Promise<void> {
  const planId = extractPlanId(data as unknown as Record<string, unknown>);
  if (!planId) {
    console.warn("[Paddle webhook] transaction.completed: could not determine plan_id");
    return;
  }
  await ctx.runMutation(internal.users.applySubscription, {
    clerkId,
    planId,
    paddleSubscriptionId: data.subscription_id ?? undefined,
    paddleCustomerId: data.customer_id ?? undefined,
    paddleStatus: "active",
  });
  console.log(`[Paddle webhook] Transaction completed: plan ${planId} for clerk ${clerkId}`);
}

export const createCheckout = action({
  args: {
    planId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!PADDLE_API_KEY) {
      throw new Error("PADDLE_API_KEY not configured");
    }

    const validPlans = ["lite", "pro", "ultra"];
    if (!validPlans.includes(args.planId)) {
      throw new Error(`Invalid plan: ${args.planId}`);
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const clerkId = identity.subject;
    const email = identity.email ?? undefined;

    const priceId = getPriceId(args.planId);
    if (!priceId) {
      throw new Error(`No Paddle price ID configured for plan: ${args.planId}`);
    }

    let customerId: string | undefined;

    const existingUser = await ctx.runQuery(api.users.getCurrentUser, {});
    if (existingUser && existingUser.paddleCustomerId) {
      customerId = existingUser.paddleCustomerId;
    }

    if (!customerId && email) {
      customerId = await findOrCreatePaddleCustomer(email, identity.name ?? undefined);
    }

    const transactionPayload: Record<string, unknown> = {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { clerk_id: clerkId, plan_id: args.planId },
      checkout: { url: null },
    };

    if (customerId) {
      transactionPayload.customer_id = customerId;
    }

    const response = await fetch(`${PADDLE_API_URL}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transactionPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Paddle createCheckout] Failed:", response.status, errorBody);
      throw new Error(`Paddle API error: ${response.status} ${errorBody}`);
    }

    const body = (await response.json()) as { data?: Record<string, unknown> };
    const transaction = body.data;
    const transactionId = transaction?.id;
    if (!transactionId || typeof transactionId !== "string") {
      console.error("[Paddle createCheckout] Response structure:", {
        hasData: !!body.data,
        id: transaction?.id,
        status: transaction?.status,
      });
      throw new Error("Paddle did not return a transaction ID");
    }

    return { transactionId };
  },
});

async function findOrCreatePaddleCustomer(
  email: string,
  name?: string
): Promise<string | undefined> {
  const listResponse = await fetch(
    `${PADDLE_API_URL}/customers?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (listResponse.ok) {
    const listData = await listResponse.json();
    const existing = listData?.data?.[0];
    if (existing?.id) {
      return existing.id as string;
    }
  }

  const createResponse = await fetch(`${PADDLE_API_URL}/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, name: name ?? undefined }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    console.error("[Paddle] Failed to create customer:", createResponse.status, errorBody);
    return undefined;
  }

  const customerBody = (await createResponse.json()) as { data?: Record<string, unknown> };
  return customerBody.data?.id as string | undefined;
}
