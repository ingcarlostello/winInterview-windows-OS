import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_FEATURES, type PlanId } from "./constants";

type Lang = "es" | "en";

function isLang(value: string): value is Lang {
  return value === "es" || value === "en";
}

function emptyPrompts(): { es: string; en: string } {
  return { es: "", en: "" };
}

export const getMyPrompts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return emptyPrompts();

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return emptyPrompts();

    const rows = await ctx.db
      .query("prompts")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id))
      .take(2);

    const result = emptyPrompts();
    for (const row of rows) {
      if (isLang(row.lang)) {
        result[row.lang] = row.promptText;
      }
    }
    return result;
  },
});

export const upsertMyPrompt = mutation({
  args: {
    lang: v.string(),
    promptText: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isLang(args.lang)) {
      throw new Error("Invalid language");
    }
    const trimmed = args.promptText.trim();
    if (!trimmed) {
      throw new Error("Prompt cannot be empty");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    const planId = (user.planId as PlanId) ?? "free";
    if (!PLAN_FEATURES[planId]?.includes("custom_prompts")) {
      throw new Error("Custom prompts not available in your plan. Upgrade to Pro.");
    }

    const existing = await ctx.db
      .query("prompts")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id).eq("lang", args.lang))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { promptText: trimmed });
    } else {
      await ctx.db.insert("prompts", {
        userId: user._id,
        lang: args.lang,
        promptText: trimmed,
      });
    }
    return { lang: args.lang, promptText: trimmed };
  },
});

export const clearMyPrompt = mutation({
  args: {
    lang: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isLang(args.lang)) {
      throw new Error("Invalid language");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    const planId = (user.planId as PlanId) ?? "free";
    if (!PLAN_FEATURES[planId]?.includes("custom_prompts")) {
      throw new Error("Custom prompts not available in your plan. Upgrade to Pro.");
    }

    const existing = await ctx.db
      .query("prompts")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id).eq("lang", args.lang))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { lang: args.lang, deleted: true };
  },
});
