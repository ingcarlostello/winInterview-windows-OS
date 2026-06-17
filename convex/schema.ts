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
  }).index("by_token", ["tokenIdentifier"]).index("by_clerk_id", ["clerkId"]),

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
