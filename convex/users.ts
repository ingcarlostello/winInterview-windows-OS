import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  PLAN_QUOTAS,
  PLAN_NAMES,
  PLAN_FEATURES,
  type PlanId,
} from "./constants";
import { generateUserKey } from "./lib/userKey";

function buildFeatureFlags(planId: PlanId): Record<string, boolean> {
  // Enumerate every known feature from the superset plan (ultra) so a feature
  // added to PLAN_FEATURES is reflected here automatically — no second edit, no
  // missing keys reaching the frontend as `undefined` (which resolves to false).
  const flags: Record<string, boolean> = {};
  for (const feature of PLAN_FEATURES.ultra) {
    flags[feature] = false;
  }
  for (const feature of PLAN_FEATURES[planId] ?? []) {
    flags[feature] = true;
  }
  return flags;
}

// Maps a users doc → the frontend `PlanInfo` shape (snake_case plan_id/quotas).
// Shared by the Clerk-identity query (getCurrentUserPlanInfo) and the access-key
// query (getPlanInfoByUserKey) so both return byte-identical plan info.
async function buildPlanInfoForUser(ctx: QueryCtx, user: Doc<"users">) {
  const planId = (user.planId as PlanId) ?? "free";
  const month = new Date().toISOString().slice(0, 7);

  const quota = await ctx.db
    .query("quotas")
    .withIndex("by_user_month", (q) =>
      q.eq("userId", user._id).eq("month", month)
    )
    .unique();

  const limits = PLAN_QUOTAS[planId] ?? PLAN_QUOTAS.free;

  const transcriptionSecondsRemaining =
    quota?.transcriptionSecondsRemaining ?? limits.transcriptionSeconds;
  const capturesRemaining = quota?.capturesRemaining ?? limits.captures;
  const analysesRemaining = quota?.analysesRemaining ?? limits.analyses;

  return {
    plan_id: planId,
    plan_name: PLAN_NAMES[planId] ?? "Lite",
    features: buildFeatureFlags(planId),
    quotas: {
      transcription_seconds: {
        used: Math.max(0, limits.transcriptionSeconds - transcriptionSecondsRemaining),
        limit: limits.transcriptionSeconds,
        remaining: transcriptionSecondsRemaining,
      },
      screen_captures: {
        used: Math.max(0, limits.captures - capturesRemaining),
        limit: limits.captures,
        remaining: capturesRemaining,
      },
      screen_analyses: {
        used: Math.max(0, limits.analyses - analysesRemaining),
        limit: limits.analyses,
        remaining: analysesRemaining,
      },
    },
  };
}

export const getUserAndQuotaByClerkId = internalQuery({
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

    const planId = (user.planId as PlanId) ?? "free";
    const month = new Date().toISOString().slice(0, 7);

    const quota = await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", user._id).eq("month", month)
      )
      .unique();

    const limits = PLAN_QUOTAS[planId] ?? PLAN_QUOTAS.free;

    const promptRows = await ctx.db
      .query("prompts")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id))
      .take(2);

    const prompts: Record<string, string> = {};
    for (const row of promptRows) {
      if (row.lang === "es" || row.lang === "en") {
        prompts[row.lang] = row.promptText;
      }
    }

    return {
      clerkId: user.clerkId,
      planId,
      planName: PLAN_NAMES[planId] ?? "Lite",
      features: buildFeatureFlags(planId),
      quota: {
        transcriptionSecondsRemaining:
          quota?.transcriptionSecondsRemaining ?? limits.transcriptionSeconds,
        capturesRemaining: quota?.capturesRemaining ?? limits.captures,
        analysesRemaining: quota?.analysesRemaining ?? limits.analyses,
      },
      limits: {
        transcriptionSeconds: limits.transcriptionSeconds,
        captures: limits.captures,
        analyses: limits.analyses,
      },
      prompts,
    };
  },
});

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
      // Lazy backfill: existing users created before userKey existed get one
      // the next time they sign in (dashboard or desktop app).
      if (user.userKey === undefined) {
        updates.userKey = generateUserKey();
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
      planId: "free",
      tokenIdentifier: identity.tokenIdentifier,
      userKey: generateUserKey(),
    });

    const month = new Date().toISOString().slice(0, 7);
    const quotas = PLAN_QUOTAS.free;
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

export const getCurrentUserPlanInfo = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      return null;
    }

    return buildPlanInfoForUser(ctx, user);
  },
});

// Public: access-key counterpart of getCurrentUserPlanInfo. A desktop session that
// logged in with a pasted access key has no Clerk JWT, so it cannot use the
// identity-based query above; it resolves the user by their userKey instead and
// returns the same PlanInfo shape. The userKey is a high-entropy bearer secret the
// caller already holds (it grants full app login), so exposing plan metadata to its
// holder adds no meaningful surface. Returns null for an unknown/empty key.
export const getPlanInfoByUserKey = query({
  args: {
    userKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.userKey) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_key", (q) => q.eq("userKey", args.userKey))
      .unique();

    if (!user) {
      return null;
    }

    return buildPlanInfoForUser(ctx, user);
  },
});

export const applySubscription = internalMutation({
  args: {
    clerkId: v.string(),
    planId: v.string(),
    paddleCustomerId: v.optional(v.string()),
    paddleSubscriptionId: v.optional(v.string()),
    paddleStatus: v.optional(v.string()),
    paddleCancelUrl: v.optional(v.string()),
    paddleUpdatePaymentUrl: v.optional(v.string()),
    subscriptionCurrentPeriodEnd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!PLAN_QUOTAS[args.planId as PlanId]) {
      throw new Error(`Invalid plan: ${args.planId}`);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const planId = args.planId as PlanId;
    const previousPlanId = user.planId as PlanId;

    const patch: Record<string, unknown> = { planId };
    if (args.paddleCustomerId !== undefined) patch.paddleCustomerId = args.paddleCustomerId;
    if (args.paddleSubscriptionId !== undefined) patch.paddleSubscriptionId = args.paddleSubscriptionId;
    if (args.paddleStatus !== undefined) patch.paddleStatus = args.paddleStatus;
    if (args.paddleCancelUrl !== undefined) patch.paddleCancelUrl = args.paddleCancelUrl;
    if (args.paddleUpdatePaymentUrl !== undefined) patch.paddleUpdatePaymentUrl = args.paddleUpdatePaymentUrl;
    if (args.subscriptionCurrentPeriodEnd !== undefined) patch.subscriptionCurrentPeriodEnd = args.subscriptionCurrentPeriodEnd;

    await ctx.db.patch(user._id, patch);

    const month = new Date().toISOString().slice(0, 7);
    const existingQuota = await ctx.db
      .query("quotas")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", user._id).eq("month", month)
      )
      .unique();

    const newQuotas = PLAN_QUOTAS[planId];

    if (existingQuota) {
      if (previousPlanId !== planId) {
        await ctx.db.patch(existingQuota._id, {
          transcriptionSecondsRemaining: newQuotas.transcriptionSeconds,
          capturesRemaining: newQuotas.captures,
          analysesRemaining: newQuotas.analyses,
        });
      }
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

// Internal: resuelve el clerkId de un usuario a partir de sus IDs de Paddle. Lo usa
// el webhook para procesar eventos `subscription.*`, que (a diferencia de las
// transacciones) no traen clerk_id en custom_data. Usa los índices existentes.
export const findClerkIdByPaddleIds = internalQuery({
  args: {
    paddleSubscriptionId: v.optional(v.string()),
    paddleCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users"> | null = null;
    if (args.paddleSubscriptionId) {
      const subId = args.paddleSubscriptionId;
      user = await ctx.db
        .query("users")
        .withIndex("by_paddle_subscription", (q) =>
          q.eq("paddleSubscriptionId", subId)
        )
        .unique();
    }
    if (!user && args.paddleCustomerId) {
      const custId = args.paddleCustomerId;
      user = await ctx.db
        .query("users")
        .withIndex("by_paddle_customer", (q) => q.eq("paddleCustomerId", custId))
        .unique();
    }
    return user ? user.clerkId : null;
  },
});

export const getCurrentUserSubscription = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      return null;
    }

    return {
      planId: user.planId as PlanId,
      paddleStatus: user.paddleStatus ?? null,
      paddleSubscriptionId: user.paddleSubscriptionId ?? null,
      paddleCancelUrl: user.paddleCancelUrl ?? null,
      paddleUpdatePaymentUrl: user.paddleUpdatePaymentUrl ?? null,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    };
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
      planId: "free",
      userKey: generateUserKey(),
    });

    const month = new Date().toISOString().slice(0, 7);
    const quotas = PLAN_QUOTAS.free;
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

// Public: called by the web dashboard's UserKeyCard to rotate the access key.
// Returns the freshly generated key string so the UI can display it.
export const regenerateUserKey = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called regenerateUserKey without authentication present");
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

    const userKey = generateUserKey();
    await ctx.db.patch(user._id, { userKey });
    return userKey;
  },
});

// Internal: resolves a desktop access key to its owner's clerkId. Called by the
// Python backend (via the getUserByKeyAction HTTP action) to authenticate a
// desktop session that logged in with a pasted key instead of a Clerk JWT.
export const getUserByKey = internalQuery({
  args: {
    userKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_key", (q) => q.eq("userKey", args.userKey))
      .unique();

    if (!user) {
      return null;
    }

    return { clerkId: user.clerkId };
  },
});

// Internal: one-time backfill to assign a userKey to any user that predates the
// field. Run once per deployment with `npx convex run users:backfillUserKeys`.
export const backfillUserKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updated = 0;
    for (const user of users) {
      if (user.userKey === undefined) {
        await ctx.db.patch(user._id, { userKey: generateUserKey() });
        updated++;
      }
    }
    return { scanned: users.length, updated };
  },
});