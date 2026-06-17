import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_QUOTAS, type PlanId } from "./constants";

export const decrementQuota = internalMutation({
  args: {
    clerkId: v.string(),
    quotaType: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const month = new Date().toISOString().slice(0, 7);
    let quota = await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id).eq("month", month))
      .unique();

    if (!quota) {
      const planQuotas = PLAN_QUOTAS[user.planId as PlanId] ?? PLAN_QUOTAS.lite;
      const newQuotaId = await ctx.db.insert("quotas", {
        userId: user._id,
        month,
        transcriptionSecondsRemaining: planQuotas.transcriptionSeconds,
        capturesRemaining: planQuotas.captures,
        analysesRemaining: planQuotas.analyses,
      });
      quota = await ctx.db.get(newQuotaId);
    }

    if (quota) {
      if (args.quotaType === "transcription") {
        await ctx.db.patch(quota._id, {
          transcriptionSecondsRemaining: Math.max(0, quota.transcriptionSecondsRemaining - args.amount),
        });
      } else if (args.quotaType === "capture") {
        await ctx.db.patch(quota._id, {
          capturesRemaining: Math.max(0, quota.capturesRemaining - args.amount),
        });
      } else if (args.quotaType === "analysis") {
        await ctx.db.patch(quota._id, {
          analysesRemaining: Math.max(0, quota.analysesRemaining - args.amount),
        });
      }
    }
  },
});

export const getQuota = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) return null;

    const month = new Date().toISOString().slice(0, 7);
    return await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id).eq("month", month))
      .unique();
  },
});
