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
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"])
    .index("by_paddle_customer", ["paddleCustomerId"])
    .index("by_paddle_subscription", ["paddleSubscriptionId"])
    .index("by_user_key", ["userKey"]),

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
