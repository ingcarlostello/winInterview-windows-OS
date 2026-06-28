import React from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "https://placeholder.convex.cloud";

const convex = new ConvexReactClient(CONVEX_URL);

/**
 * The desktop app authenticates only with a pasted access key (`wik_*`), not
 * Clerk — registration, Clerk login, and key generation live in the separate
 * web app. Convex is used here just for the public `getPlanInfoByUserKey`
 * query, so a plain (unauthenticated) ConvexProvider is all that's needed.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
