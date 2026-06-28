import { Crown, Check, X } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import { useCheckout } from "../hooks/useCheckout";
import { WEBSITE_UPGRADE_URL } from "../constants/links";
import type { TranslationKey } from "../i18n/translations";
import type { PlanId } from "../stores/slices/planSlice";

type TierInfo = {
  id: Exclude<PlanId, "free">;
  nameKey: TranslationKey;
  price: number;
  features: { key: TranslationKey; included: boolean }[];
  quotas: { key: TranslationKey; params: Record<string, string | number> }[];
  popular?: boolean;
};

const tiers: TierInfo[] = [
  {
    id: "lite",
    nameKey: "planLite",
    price: 4.99,
    features: [
      { key: "featRealTime", included: true },
      { key: "featStreaming", included: true },
      { key: "featAlwaysOnTop", included: true },
      { key: "featCustomPrompts", included: false },
      { key: "featSimCaptures", included: false },
      { key: "featShortcuts", included: false },
      { key: "featInvisible", included: false },
      { key: "featGhost", included: false },
    ],
    quotas: [
      { key: "quotaTranscription", params: { count: 20 } },
      { key: "quotaCaptures", params: { count: 2 } },
      { key: "quotaAnalyses", params: { count: 2 } },
    ],
  },
  {
    id: "pro",
    nameKey: "planPro",
    price: 19.99,
    popular: true,
    features: [
      { key: "featRealTime", included: true },
      { key: "featStreaming", included: true },
      { key: "featAlwaysOnTop", included: true },
      { key: "featCustomPrompts", included: true },
      { key: "featSimCaptures", included: true },
      { key: "featShortcuts", included: true },
      { key: "featInvisible", included: false },
      { key: "featGhost", included: false },
    ],
    quotas: [
      { key: "quotaTranscription", params: { count: 120 } },
      { key: "quotaCaptures", params: { count: 8 } },
      { key: "quotaAnalyses", params: { count: 8 } },
    ],
  },
  {
    id: "ultra",
    nameKey: "planUltra",
    price: 59.99,
    features: [
      { key: "featRealTime", included: true },
      { key: "featStreaming", included: true },
      { key: "featAlwaysOnTop", included: true },
      { key: "featCustomPrompts", included: true },
      { key: "featSimCaptures", included: true },
      { key: "featShortcuts", included: true },
      { key: "featInvisible", included: true },
      { key: "featGhost", included: true },
    ],
    quotas: [
      { key: "quotaTranscription", params: { count: 480 } },
      { key: "quotaCaptures", params: { count: 40 } },
      { key: "quotaAnalyses", params: { count: 40 } },
    ],
  },
];

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const { t } = useTranslation();
  const planInfo = useInterviewStore((s) => s.planInfo);
  const currentPlanId = planInfo?.plan_id ?? "free";
  // Plans/billing are managed on the website (Clerk + Paddle); the desktop app
  // only routes the user there. The in-app Paddle checkout was Clerk-auth-only.
  const { openExternalUrl } = useCheckout();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[95%] max-w-3xl max-h-[90%] overflow-y-auto scrollbar-thin rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          title={t("closeModal")}
        >
          <X size={20} />
        </button>

        <div className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Crown size={22} className="text-amber-400" />
            <h2 className="text-xl font-bold text-white">{t("pricingTitle")}</h2>
          </div>
          <p className="text-sm text-gray-400">{t("pricingSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {tiers.map((tier) => {
            const isCurrentPlan = currentPlanId === tier.id;

            return (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                  tier.popular
                    ? "border-amber-400/40 bg-gradient-to-b from-amber-400/5 to-transparent"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-semibold text-black">
                    ★
                  </div>
                )}

                <h3 className="mb-1 text-lg font-bold text-white">{t(tier.nameKey)}</h3>
                <div className="mb-4 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">${tier.price}</span>
                  <span className="text-sm text-gray-400">{t("perMonth")}</span>
                </div>

                <div className="mb-3 space-y-1.5">
                  {tier.features.map((feat) => (
                    <div key={feat.key} className="flex items-center gap-2 text-xs">
                      {feat.included ? (
                        <Check size={14} className="shrink-0 text-green-400" />
                      ) : (
                        <span className="shrink-0 text-gray-600">—</span>
                      )}
                      <span className={feat.included ? "text-gray-300" : "text-gray-600"}>
                        {t(feat.key)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mb-4 space-y-1 border-t border-white/5 pt-3">
                  {tier.quotas.map((q) => (
                    <div key={q.key} className="text-xs text-gray-400">
                      {t(q.key, q.params)}
                    </div>
                  ))}
                </div>

                <div className="mt-auto">
                  {isCurrentPlan ? (
                    <div className="rounded-lg bg-white/10 py-2 text-center text-sm font-semibold text-white">
                      {t("btnCurrentPlan")}
                    </div>
                  ) : (
                    <button
                      onClick={() => openExternalUrl(WEBSITE_UPGRADE_URL)}
                      className={`w-full rounded-lg py-2 text-center text-sm font-semibold transition-all ${
                        tier.popular
                          ? "bg-amber-400 text-black hover:bg-amber-300"
                          : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {t("btnSubscribe")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {currentPlanId === "free" && (
          <div className="mt-5 text-center text-xs text-gray-500">
            {t("freeTrialFeatures")}
          </div>
        )}
      </div>
    </div>
  );
}
