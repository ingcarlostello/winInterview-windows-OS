import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    planId: v.string(),
    tokenIdentifier: v.string(),
    paddleCustomerId: v.optional(v.string()),
    paddleSubscriptionId: v.optional(v.string()),
    paddleStatus: v.optional(v.string()),
    paddleCancelUrl: v.optional(v.string()),
    paddleUpdatePaymentUrl: v.optional(v.string()),
    subscriptionCurrentPeriodEnd: v.optional(v.string()),
    userKey: v.optional(v.string()),
    // Cancelación programada nativa de Paddle (scheduled_change). Su presencia con
    // action "cancel" = estado "cancelación pendiente" (acceso hasta effectiveAt).
    subscriptionScheduledChangeAction: v.optional(v.string()),
    subscriptionScheduledChangeEffectiveAt: v.optional(v.string()),
    // Downgrade programado gestionado por la app: Paddle no programa cambios de
    // ítems, así que guardamos el plan destino y cuándo aplicarlo (= fin de ciclo).
    pendingPlanId: v.optional(v.string()),
    pendingPlanEffectiveAt: v.optional(v.string()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"])
    .index("by_paddle_customer", ["paddleCustomerId"])
    .index("by_paddle_subscription", ["paddleSubscriptionId"])
    .index("by_user_key", ["userKey"])
    .index("by_pending_effective", ["pendingPlanEffectiveAt"]),

  // Log de eventos de Paddle ya procesados. Da idempotencia al webhook (dedupe por
  // event_id de Paddle) y deja rastro de auditoría de los cambios de suscripción.
  subscriptionEvents: defineTable({
    userId: v.optional(v.id("users")),
    paddleEventId: v.string(),
    eventType: v.string(),
    occurredAt: v.string(),
    raw: v.optional(v.any()),
  })
    .index("by_event_id", ["paddleEventId"])
    .index("by_user", ["userId"]),

  prompts: defineTable({
    userId: v.id("users"),
    lang: v.string(),
    promptText: v.string(),
  }).index("by_user_lang", ["userId", "lang"]),

  quotas: defineTable({
    userId: v.id("users"),
    month: v.string(),
    transcriptionSecondsRemaining: v.number(),
    capturesRemaining: v.number(),
    analysesRemaining: v.number(),
  }).index("by_user_month", ["userId", "month"]),
});
