import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

const KEY_PREFIXES = ["wik_test_", "wik_live_"];

/**
 * Alternative to the Clerk sign-in: lets a desktop user paste the access key
 * shown in the web dashboard. A valid key flips the app into key-mode (see
 * useAppAuth); an invalid key is rejected before it is stored.
 */
export default function KeyLoginForm() {
  const setUserKey = useInterviewStore((s) => s.setUserKey);
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      setError(t("keyLoginInvalid"));
      return;
    }
    setError(null);
    setUserKey(key);
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
          className="flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#a3e635] focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-lg bg-[#a3e635] px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-[#bef264]"
        >
          <KeyRound size={14} />
          {t("keyLoginSubmit")}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
