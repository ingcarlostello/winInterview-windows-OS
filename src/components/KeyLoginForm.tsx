import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

const KEY_PREFIXES = ["wik_test_", "wik_live_"];

/**
 * Alternative to the Clerk sign-in: lets a desktop user paste the access key
 * shown in the web dashboard. The key is validated against Convex (it must
 * resolve to a real user in the active deployment) before it is stored — a key
 * from the wrong environment (e.g. a wik_test_* key while pointing at prod) is
 * rejected with a clear message instead of entering a dead "free" shell.
 */
export default function KeyLoginForm() {
  const setUserKey = useInterviewStore((s) => s.setUserKey);
  const convex = useConvex();
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const key = value.trim();
    if (!KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      setError(t("keyLoginInvalid"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Resolve the key against the active Convex deployment. A non-null result
      // means the key belongs to a real user (free plan included); null means
      // the key is unknown here (wrong env / typo / revoked).
      const info = await convex.query(api.users.getPlanInfoByUserKey, {
        userKey: key,
      });
      if (!info) {
        setError(t("keyLoginNotFound"));
        setLoading(false);
        return;
      }
      // Valid key: App.tsx unmounts this form and mounts the Overlay, so we
      // intentionally do not reset `loading` here.
      setUserKey(key);
    } catch {
      setError(t("keyLoginError"));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-2">
      <label className="text-xs text-white/60">{t("keyLoginLabel")}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="wik_..."
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          className="flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#a3e635] focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1 rounded-lg bg-[#a3e635] px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-[#bef264] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <KeyRound size={14} />
          )}
          {loading ? t("keyLoginVerifying") : t("keyLoginSubmit")}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
