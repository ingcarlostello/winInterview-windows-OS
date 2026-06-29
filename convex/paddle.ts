import { httpAction, action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { PLAN_RANK, type PlanId } from "./constants";

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
  scheduled_change?: { action?: string; effective_at?: string; resume_at?: string } | null;
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
  const eventId = event.event_id;
  const occurredAt = event.occurred_at ?? new Date().toISOString();

  try {
    // Idempotencia: si ya procesamos este event_id, responder 200 sin reprocesar.
    if (
      eventId &&
      (await ctx.runQuery(internal.users.isEventProcessed, { paddleEventId: eventId }))
    ) {
      return new Response(JSON.stringify({ ok: true, deduped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    // Marcar como procesado solo tras éxito (un evento fallido se reintenta).
    if (eventId) {
      await ctx.runMutation(internal.users.recordSubscriptionEvent, {
        paddleEventId: eventId,
        eventType,
        occurredAt,
      });
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

  // scheduled_change de Paddle: objeto (cancel/pause/resume programado) o null (sin
  // cambio). `undefined` => el payload no lo trae => no tocamos el campo guardado.
  let scheduledChange: { action: string; effectiveAt?: string } | null | undefined;
  if (data.scheduled_change === null) {
    scheduledChange = null;
  } else if (data.scheduled_change && data.scheduled_change.action) {
    scheduledChange = {
      action: data.scheduled_change.action,
      effectiveAt: data.scheduled_change.effective_at,
    };
  } else {
    scheduledChange = undefined;
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
    scheduledChange,
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

// ---------------------------------------------------------------------------
// Portal de facturación self-service: acciones que llaman a la API de Paddle.
// Todas se atan a la identidad de Clerk y validan ownership de la suscripción.
// ---------------------------------------------------------------------------

// Helper REST con auth Bearer. Devuelve el objeto `data` de la respuesta de Paddle.
async function paddleApi(
  path: string,
  method: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${PADDLE_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Paddle ${method} ${path}] ${response.status}:`, errorBody);
    throw new Error(`Paddle API error: ${response.status} ${errorBody}`);
  }
  const json = (await response.json()) as { data?: Record<string, unknown> };
  return json.data ?? {};
}

function planRank(planId: string): number {
  return PLAN_RANK[planId as PlanId] ?? 0;
}

function readPeriodEnd(sub: Record<string, unknown>): string | undefined {
  const cbp = sub.current_billing_period as { ends_at?: string } | undefined | null;
  return cbp?.ends_at ?? undefined;
}

function readScheduledChange(
  sub: Record<string, unknown>
): { action: string; effectiveAt?: string } | null {
  const sc = sub.scheduled_change as { action?: string; effective_at?: string } | undefined | null;
  if (sc && sc.action) return { action: sc.action, effectiveAt: sc.effective_at };
  return null;
}

function readManagementUrls(sub: Record<string, unknown>): {
  cancel?: string;
  update?: string;
} {
  const mu = sub.management_urls as
    | { cancel?: string; update_payment_method?: string }
    | undefined
    | null;
  return { cancel: mu?.cancel, update: mu?.update_payment_method };
}

// Espeja en Convex la entidad de suscripción devuelta por Paddle (write-through
// optimista). El webhook reconcilia después; ambos pasan por applySubscription.
async function writeThroughFromSubscription(
  ctx: ActionCtx,
  clerkId: string,
  planId: string,
  sub: Record<string, unknown>
): Promise<void> {
  const mu = readManagementUrls(sub);
  await ctx.runMutation(internal.users.applySubscription, {
    clerkId,
    planId,
    paddleStatus: typeof sub.status === "string" ? sub.status : undefined,
    paddleSubscriptionId: typeof sub.id === "string" ? sub.id : undefined,
    paddleCustomerId: typeof sub.customer_id === "string" ? sub.customer_id : undefined,
    paddleCancelUrl: mu.cancel,
    paddleUpdatePaymentUrl: mu.update,
    subscriptionCurrentPeriodEnd: readPeriodEnd(sub),
    scheduledChange: readScheduledChange(sub),
  });
}

// Cambia el plan. Upgrade (sube de rango) → inmediato con prorrateo. Downgrade
// (baja de rango) → programado al final del ciclo (pendingPlan* + do_not_bill).
export const changeSubscriptionPlan = action({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not configured");
    const validPlans = ["lite", "pro", "ultra"];
    if (!validPlans.includes(args.planId)) throw new Error(`Invalid plan: ${args.planId}`);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const clerkId = identity.subject;

    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("User not found");
    const subscriptionId = user.paddleSubscriptionId;
    if (!subscriptionId) {
      throw new Error("No active subscription to change. Use checkout to start one.");
    }

    const priceId = getPriceId(args.planId);
    if (!priceId) throw new Error(`No Paddle price ID configured for plan: ${args.planId}`);

    const currentRank = planRank(user.planId);
    const targetRank = planRank(args.planId);
    const items = [{ price_id: priceId, quantity: 1 }];

    // Mismo plan: si hay un downgrade programado, "deshacer" (restaurar ítems al plan
    // actual y limpiar el pendiente). Sin pendiente no hay nada que hacer.
    if (targetRank === currentRank) {
      if (user.pendingPlanId) {
        await ctx.runMutation(internal.users.clearPendingPlanChange, { clerkId });
        const sub = await paddleApi(`/subscriptions/${subscriptionId}`, "PATCH", {
          items,
          proration_billing_mode: "do_not_bill",
        });
        await writeThroughFromSubscription(ctx, clerkId, user.planId, sub);
      }
      return { ok: true, direction: "none" as const };
    }

    if (targetRank > currentRank) {
      // UPGRADE inmediato con prorrateo. Un downgrade pendiente queda sin efecto.
      await ctx.runMutation(internal.users.clearPendingPlanChange, { clerkId });
      const sub = await paddleApi(`/subscriptions/${subscriptionId}`, "PATCH", {
        items,
        proration_billing_mode: "prorated_immediately",
        on_payment_failure: "prevent_change",
      });
      await writeThroughFromSubscription(ctx, clerkId, args.planId, sub);
      return { ok: true, direction: "upgrade" as const };
    }

    // DOWNGRADE al final del ciclo. Fijamos el pendiente ANTES de tocar Paddle (gana
    // la carrera con el webhook del PATCH), luego cambiamos ítems sin cobrar: el
    // precio menor se cobra en la próxima renovación. El plan alto se conserva hasta
    // la fecha (regla en applySubscription + cron backstop).
    const knownEnd = user.subscriptionCurrentPeriodEnd ?? "";
    await ctx.runMutation(internal.users.setPendingPlanChange, {
      clerkId,
      pendingPlanId: args.planId,
      pendingPlanEffectiveAt: knownEnd,
    });
    const sub = await paddleApi(`/subscriptions/${subscriptionId}`, "PATCH", {
      items,
      proration_billing_mode: "do_not_bill",
    });
    const effectiveAt = readPeriodEnd(sub) ?? knownEnd;
    if (effectiveAt && effectiveAt !== knownEnd) {
      await ctx.runMutation(internal.users.setPendingPlanChange, {
        clerkId,
        pendingPlanId: args.planId,
        pendingPlanEffectiveAt: effectiveAt,
      });
    }
    return { ok: true, direction: "downgrade" as const, effectiveAt: effectiveAt || null };
  },
});

// Previsualiza el prorrateo de un cambio de plan sin aplicarlo (read-only).
export const previewSubscriptionChange = action({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not configured");
    const validPlans = ["lite", "pro", "ultra"];
    if (!validPlans.includes(args.planId)) throw new Error(`Invalid plan: ${args.planId}`);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("User not found");
    const subscriptionId = user.paddleSubscriptionId;
    if (!subscriptionId) throw new Error("No active subscription.");

    const priceId = getPriceId(args.planId);
    if (!priceId) throw new Error(`No Paddle price ID configured for plan: ${args.planId}`);

    const prorationMode =
      planRank(args.planId) > planRank(user.planId) ? "prorated_immediately" : "do_not_bill";

    const sub = await paddleApi(`/subscriptions/${subscriptionId}/preview`, "POST", {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: prorationMode,
    });

    // immediate_transaction.details.totals.grand_total: string en la menor denominación.
    const immediate = sub.immediate_transaction as
      | { details?: { totals?: { grand_total?: string; currency_code?: string } } }
      | undefined
      | null;
    const totals = immediate?.details?.totals;
    return {
      immediateAmount: totals?.grand_total ?? null,
      currencyCode: totals?.currency_code ?? null,
      nextBilledAt: typeof sub.next_billed_at === "string" ? sub.next_billed_at : null,
    };
  },
});

// Cancela al final del ciclo (periodo de gracia). status sigue "active" + scheduled_change cancel.
export const cancelSubscription = action({
  args: {},
  handler: async (ctx) => {
    if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not configured");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const clerkId = identity.subject;

    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("User not found");
    const subscriptionId = user.paddleSubscriptionId;
    if (!subscriptionId) throw new Error("No active subscription to cancel.");

    const sub = await paddleApi(`/subscriptions/${subscriptionId}/cancel`, "POST", {
      effective_from: "next_billing_period",
    });
    await writeThroughFromSubscription(ctx, clerkId, user.planId, sub);
    return {
      ok: true,
      effectiveAt: readScheduledChange(sub)?.effectiveAt ?? readPeriodEnd(sub) ?? null,
    };
  },
});

// Reactiva durante la gracia: quita la cancelación programada (scheduled_change: null).
export const reactivateSubscription = action({
  args: {},
  handler: async (ctx) => {
    if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not configured");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const clerkId = identity.subject;

    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("User not found");
    const subscriptionId = user.paddleSubscriptionId;
    if (!subscriptionId) {
      throw new Error("No subscription to reactivate. Start a new checkout.");
    }
    if (user.subscriptionScheduledChangeAction !== "cancel") {
      throw new Error("No pending cancellation to reactivate.");
    }

    const sub = await paddleApi(`/subscriptions/${subscriptionId}`, "PATCH", {
      scheduled_change: null,
    });
    await writeThroughFromSubscription(ctx, clerkId, user.planId, sub);
    return { ok: true };
  },
});

// Devuelve un transactionId para actualizar el método de pago vía overlay Paddle.js.
export const updatePaymentMethod = action({
  args: {},
  handler: async (ctx) => {
    if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not configured");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("User not found");
    const subscriptionId = user.paddleSubscriptionId;
    if (!subscriptionId) throw new Error("No active subscription.");

    const txn = await paddleApi(
      `/subscriptions/${subscriptionId}/update-payment-method-transaction`,
      "GET"
    );
    const transactionId = txn.id;
    if (typeof transactionId !== "string") {
      throw new Error("Paddle did not return a transaction ID");
    }
    return { transactionId };
  },
});
