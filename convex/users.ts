import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_QUOTAS, type PlanId } from "./constants";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (user !== null) {
      const updates: Record<string, unknown> = {};
      if (identity.email !== undefined && user.email !== identity.email) {
        updates.email = identity.email;
      }
      if (identity.name !== undefined && user.name !== identity.name) {
        updates.name = identity.name;
      }
      if (identity.pictureUrl !== undefined && user.imageUrl !== identity.pictureUrl) {
        updates.imageUrl = identity.pictureUrl;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(user._id, updates);
      }
      return user._id;
    }

    const newUserId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.pictureUrl,
      planId: "lite",
      tokenIdentifier: identity.tokenIdentifier,
    });

    const month = new Date().toISOString().slice(0, 7);
    const quotas = PLAN_QUOTAS.lite;
    await ctx.db.insert("quotas", {
      userId: newUserId,
      month,
      transcriptionSecondsRemaining: quotas.transcriptionSeconds,
      capturesRemaining: quotas.captures,
      analysesRemaining: quotas.analyses,
    });

    return newUserId;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

export const updateUserPlan = mutation({
  args: {
    planId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    if (!PLAN_QUOTAS[args.planId as PlanId]) {
      throw new Error(`Invalid plan: ${args.planId}`);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, { planId: args.planId });

    const month = new Date().toISOString().slice(0, 7);
    const existingQuota = await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", user._id).eq("month", month)
      )
      .unique();

    const newQuotas = PLAN_QUOTAS[args.planId as PlanId];

    if (existingQuota) {
      await ctx.db.patch(existingQuota._id, {
        transcriptionSecondsRemaining: Math.max(
          existingQuota.transcriptionSecondsRemaining,
          newQuotas.transcriptionSeconds
        ),
        capturesRemaining: Math.max(
          existingQuota.capturesRemaining,
          newQuotas.captures
        ),
        analysesRemaining: Math.max(
          existingQuota.analysesRemaining,
          newQuotas.analyses
        ),
      });
    } else {
      await ctx.db.insert("quotas", {
        userId: user._id,
        month,
        transcriptionSecondsRemaining: newQuotas.transcriptionSeconds,
        capturesRemaining: newQuotas.captures,
        analysesRemaining: newQuotas.analyses,
      });
    }

    return user._id;
  },
});

export const deleteUserByClerkId = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const quotas = await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id))
      .collect();

    for (const quota of quotas) {
      await ctx.db.delete(quota._id);
    }

    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id))
      .collect();

    for (const prompt of prompts) {
      await ctx.db.delete(prompt._id);
    }

    await ctx.db.delete(user._id);
    return user._id;
  },
});

export const updateUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const updates: Record<string, unknown> = {};
    if (args.email !== undefined && user.email !== args.email) {
      updates.email = args.email;
    }
    if (args.name !== undefined && user.name !== args.name) {
      updates.name = args.name;
    }
    if (args.imageUrl !== undefined && user.imageUrl !== args.imageUrl) {
      updates.imageUrl = args.imageUrl;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates);
    }

    return user._id;
  },
});

export const createUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      return existing._id;
    }

    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      tokenIdentifier: args.tokenIdentifier,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      planId: "lite",
    });

    const month = new Date().toISOString().slice(0, 7);
    const quotas = PLAN_QUOTAS.lite;
    await ctx.db.insert("quotas", {
      userId: newUserId,
      month,
      transcriptionSecondsRemaining: quotas.transcriptionSeconds,
      capturesRemaining: quotas.captures,
      analysesRemaining: quotas.analyses,
    });

    return newUserId;
  },
});