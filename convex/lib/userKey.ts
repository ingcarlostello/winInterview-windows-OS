// Generates the desktop/dashboard access token ("userKey").
// Format: `wik_<env>_<40 random chars>` where env is `test` (dev) or `live` (prod),
// taken from the Convex deployment env var APP_ENV (set via `npx convex env set`).

declare const process: { env: Record<string, string | undefined> };

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_LENGTH = 40;

export function generateUserKey(): string {
  const env = process.env.APP_ENV ?? "test";
  const bytes = new Uint8Array(KEY_LENGTH);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `wik_${env}_${s}`;
}
